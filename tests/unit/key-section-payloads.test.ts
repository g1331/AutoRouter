// @vitest-environment node
/**
 * Phase C1 · 分区 payload 单测（openspec/changes/restructure-ops-console-pages
 * tasks.md #5.4）。断言 API Key 详情页各分区 partial PUT payload 只含本分区字段、
 * access-grants 在 unrestricted 模式下强制清空 upstream_ids、spending-rules 的
 * 空规则语义、rate-limits 的 null 语义、model-allowlist 空转 null，并覆盖分发器
 * （dispatcher）的分区覆盖面。
 */
import { describe, expect, it } from "vitest";

import {
  apiKeySectionPayloadBuilders,
  buildAccessGrantsPayload,
  buildApiKeySectionPayload,
  buildBasicPayload,
  buildExpiryPayload,
  buildModelAllowlistPayload,
  buildRateLimitsPayload,
  buildSpendingRulesPayload,
  keySpendingRulesToApi,
} from "@/components/admin/key/section-payloads";
import {
  KEY_ROLLING_DEFAULT_PERIOD_HOURS,
  apiKeySectionSchemas,
  keySpendingRuleSchema,
} from "@/components/admin/key/section-schemas";

// 分区 id 的期望集合，与 apiKeySectionSchemas / apiKeySectionPayloadBuilders 的
// key 集合一一对应（见 tasks.md #5.4 团队交底）。
const EXPECTED_SECTION_IDS = [
  "access-grants",
  "basic",
  "expiry",
  "model-allowlist",
  "rate-limits",
  "spending-rules",
] as const;

describe("apiKeySectionPayloadBuilders 分区覆盖", () => {
  it("覆盖且仅覆盖 6 个分区 id", () => {
    expect(Object.keys(apiKeySectionPayloadBuilders).sort()).toEqual([...EXPECTED_SECTION_IDS]);
    expect(Object.keys(apiKeySectionSchemas).sort()).toEqual([...EXPECTED_SECTION_IDS]);
  });

  it("buildApiKeySectionPayload 按 sectionId 分发到对应 builder", () => {
    const basicValues = apiKeySectionSchemas.basic.parse({
      name: "Test Key",
      description: "",
      is_active: true,
    });
    expect(buildApiKeySectionPayload("basic", basicValues)).toEqual(buildBasicPayload(basicValues));

    const accessValues = apiKeySectionSchemas["access-grants"].parse({
      access_mode: "unrestricted",
      upstream_ids: [],
    });
    expect(buildApiKeySectionPayload("access-grants", accessValues)).toEqual(
      buildAccessGrantsPayload(accessValues)
    );

    const expiryValues = apiKeySectionSchemas.expiry.parse({ expires_at: null });
    expect(buildApiKeySectionPayload("expiry", expiryValues)).toEqual(
      buildExpiryPayload(expiryValues)
    );

    const rateLimitValues = apiKeySectionSchemas["rate-limits"].parse({
      rpm_limit: "60",
      tpm_limit: "",
    });
    expect(buildApiKeySectionPayload("rate-limits", rateLimitValues)).toEqual(
      buildRateLimitsPayload(rateLimitValues)
    );
  });
});

describe("buildBasicPayload", () => {
  it("非空字段：payload 只含 name/description/is_active", () => {
    const values = apiKeySectionSchemas.basic.parse({
      name: "Production Key",
      description: "used by billing service",
      is_active: true,
    });
    const payload = buildBasicPayload(values);
    expect(Object.keys(payload).sort()).toEqual(["description", "is_active", "name"]);
    expect(payload).toEqual({
      name: "Production Key",
      description: "used by billing service",
      is_active: true,
    });
  });

  it.each(["", "   "])("description 为空/空白（%j）时归一为 null", (raw) => {
    const values = apiKeySectionSchemas.basic.parse({
      name: "Production Key",
      description: raw,
      is_active: true,
    });
    const payload = buildBasicPayload(values);
    expect(payload.description).toBeNull();
  });

  it("description 非空时裁剪首尾空格", () => {
    const values = apiKeySectionSchemas.basic.parse({
      name: "Production Key",
      description: "  trimmed  ",
      is_active: true,
    });
    expect(buildBasicPayload(values).description).toBe("trimmed");
  });
});

describe("buildAccessGrantsPayload", () => {
  it("restricted 模式：payload 只含 access_mode/upstream_ids，透传选中的上游", () => {
    const values = apiKeySectionSchemas["access-grants"].parse({
      access_mode: "restricted",
      upstream_ids: ["upstream-1", "upstream-2"],
    });
    const payload = buildAccessGrantsPayload(values);
    expect(Object.keys(payload).sort()).toEqual(["access_mode", "upstream_ids"]);
    expect(payload).toEqual({
      access_mode: "restricted",
      upstream_ids: ["upstream-1", "upstream-2"],
    });
  });

  it("unrestricted 模式：即使表单仍带着未清空的 upstream_ids，也强制清空为 []", () => {
    // superRefine 只在 restricted 分支校验 upstream_ids 非空，unrestricted 分支
    // 允许任意 upstream_ids 通过 schema；builder 负责按语义强制清空。
    const values = apiKeySectionSchemas["access-grants"].parse({
      access_mode: "unrestricted",
      upstream_ids: ["upstream-1", "upstream-2"],
    });
    const payload = buildAccessGrantsPayload(values);
    expect(payload).toEqual({ access_mode: "unrestricted", upstream_ids: [] });
  });

  it("restricted 模式下 upstream_ids 为空触发 schema 校验失败", () => {
    const result = apiKeySectionSchemas["access-grants"].safeParse({
      access_mode: "restricted",
      upstream_ids: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("keySpendingRulesToApi", () => {
  it("空数组返回 null", () => {
    expect(keySpendingRulesToApi([])).toBeNull();
  });

  it("rolling 规则缺省 period_hours 时补默认 24 小时", () => {
    const rules = [
      keySpendingRuleSchema.parse({ period_type: "rolling", limit: 10, period_hours: null }),
    ];
    expect(keySpendingRulesToApi(rules)).toEqual([
      { period_type: "rolling", limit: 10, period_hours: KEY_ROLLING_DEFAULT_PERIOD_HOURS },
    ]);
  });

  it("rolling 规则显式 period_hours 时原样透传", () => {
    const rules = [
      keySpendingRuleSchema.parse({ period_type: "rolling", limit: 10, period_hours: 6 }),
    ];
    expect(keySpendingRulesToApi(rules)).toEqual([
      { period_type: "rolling", limit: 10, period_hours: 6 },
    ]);
  });

  it("daily/monthly 规则不携带 period_hours 键（非仅值为 undefined）", () => {
    const rules = [
      keySpendingRuleSchema.parse({ period_type: "daily", limit: 10, period_hours: null }),
      keySpendingRuleSchema.parse({ period_type: "monthly", limit: 20, period_hours: null }),
    ];
    const result = keySpendingRulesToApi(rules)!;
    expect(result.map((rule) => Object.keys(rule).sort())).toEqual([
      ["limit", "period_type"],
      ["limit", "period_type"],
    ]);
    expect(result).toEqual([
      { period_type: "daily", limit: 10 },
      { period_type: "monthly", limit: 20 },
    ]);
  });
});

describe("buildSpendingRulesPayload", () => {
  it("非空规则：payload 只含 spending_rules", () => {
    const values = apiKeySectionSchemas["spending-rules"].parse({
      spending_rules: [{ period_type: "daily", limit: 100, period_hours: null }],
    });
    const payload = buildSpendingRulesPayload(values);
    expect(Object.keys(payload).sort()).toEqual(["spending_rules"]);
    expect(payload).toEqual({ spending_rules: [{ period_type: "daily", limit: 100 }] });
  });

  it("规则列表为空时显式提交 { spending_rules: [] }（清空契约，而非省略字段）", () => {
    // 契约：分区表单的“清空所有规则并保存”必须能把服务端状态清空，因此空列表
    // 不能被省略字段的 write-only 语义吞掉——必须显式提交空数组。
    const values = apiKeySectionSchemas["spending-rules"].parse({ spending_rules: [] });
    const payload = buildSpendingRulesPayload(values);
    expect(payload).toEqual({ spending_rules: [] });
    expect("spending_rules" in payload).toBe(true);
  });
});

describe("buildRateLimitsPayload", () => {
  it("serializes both independent rate-limit dimensions", () => {
    const values = apiKeySectionSchemas["rate-limits"].parse({
      rpm_limit: "60",
      tpm_limit: "120000",
    });

    expect(buildRateLimitsPayload(values)).toEqual({ rpm_limit: 60, tpm_limit: 120000 });
  });

  it("keeps empty numeric inputs as null instead of coercing them to zero", () => {
    const values = apiKeySectionSchemas["rate-limits"].parse({
      rpm_limit: "",
      tpm_limit: "   ",
    });

    expect(buildRateLimitsPayload(values)).toEqual({ rpm_limit: null, tpm_limit: null });
  });

  it("rejects zero and fractional rate limits", () => {
    expect(
      apiKeySectionSchemas["rate-limits"].safeParse({ rpm_limit: "0", tpm_limit: null }).success
    ).toBe(false);
    expect(
      apiKeySectionSchemas["rate-limits"].safeParse({ rpm_limit: null, tpm_limit: "1.5" }).success
    ).toBe(false);
  });
});

describe("buildModelAllowlistPayload", () => {
  it("非空列表：透传", () => {
    const values = apiKeySectionSchemas["model-allowlist"].parse({
      allowed_models: ["gpt-4.1", "claude-3-7-sonnet"],
    });
    const payload = buildModelAllowlistPayload(values);
    expect(Object.keys(payload).sort()).toEqual(["allowed_models"]);
    expect(payload).toEqual({ allowed_models: ["gpt-4.1", "claude-3-7-sonnet"] });
  });

  it("空列表转为 null（不限制模型）", () => {
    const values = apiKeySectionSchemas["model-allowlist"].parse({ allowed_models: [] });
    const payload = buildModelAllowlistPayload(values);
    expect(payload).toEqual({ allowed_models: null });
  });
});

describe("buildExpiryPayload", () => {
  it("Date 值序列化为 ISO 字符串", () => {
    const values = apiKeySectionSchemas.expiry.parse({
      expires_at: new Date("2026-12-31T00:00:00.000Z"),
    });
    const payload = buildExpiryPayload(values);
    expect(payload).toEqual({ expires_at: "2026-12-31T00:00:00.000Z" });
  });

  it("null 值原样透传（清除过期时间）", () => {
    const values = apiKeySectionSchemas.expiry.parse({ expires_at: null });
    expect(buildExpiryPayload(values)).toEqual({ expires_at: null });
  });
});
