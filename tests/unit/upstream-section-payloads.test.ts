// @vitest-environment node
/**
 * Phase B2 · 分区 payload 单测（openspec/changes/restructure-ops-console-pages
 * tasks.md #3.5）。断言各分区 partial PUT payload 只含本分区字段、api_key 空省略、
 * basic-profile 不携带已下线的 description 字段，并覆盖共享字段映射 helper。
 */
import { describe, expect, it } from "vitest";

import {
  buildAffinityMigrationPayload,
  buildApiKeyPayload,
  buildBasicNamePayload,
  buildBasicProfilePayload,
  buildBillingMultipliersPayload,
  buildCapacityControlPayload,
  buildCircuitBreakerPayload,
  buildFailureRulesPayload,
  buildModelRoutingPayload,
  buildPriorityWeightPayload,
  buildRouteEndpointPayload,
  buildSpendingQuotaPayload,
  buildUpstreamSectionPayload,
  normalizeQueuePolicyForSubmit,
  spendingRulesToApi,
  toApiModelDiscoveryValue,
  toApiModelRulesValue,
  upstreamSectionPayloadBuilders,
} from "@/components/admin/upstream/section-payloads";
import {
  ROLLING_DEFAULT_PERIOD_HOURS,
  modelDiscoverySchema,
  modelRuleSchema,
  queuePolicyFormSchema,
  spendingRuleSchema,
  upstreamSectionSchemas,
} from "@/components/admin/upstream/section-schemas";

// 分区 id 的期望集合（不含 basic-diagnostics —— 它是只读诊断面板，没有独立的
// zod schema / payload builder，见 tasks.md #3.1 与 #3.5 团队交底）。
const EXPECTED_SECTION_IDS = [
  "basic-name",
  "basic-profile",
  "basic-route-endpoint",
  "basic-api-key",
  "priority-weight",
  "model-routing",
  "billing-multipliers",
  "spending-quota",
  "capacity-control",
  "circuit-breaker",
  "failure-rules",
  "affinity-migration",
] as const;

describe("upstreamSectionPayloadBuilders 分区覆盖", () => {
  it("覆盖且仅覆盖 12 个分区 id", () => {
    expect(Object.keys(upstreamSectionPayloadBuilders).sort()).toEqual(
      [...EXPECTED_SECTION_IDS].sort()
    );
    expect(Object.keys(upstreamSectionSchemas).sort()).toEqual([...EXPECTED_SECTION_IDS].sort());
  });

  it("buildUpstreamSectionPayload 按 sectionId 分发到对应 builder", () => {
    expect(buildUpstreamSectionPayload("basic-name", { name: "X" })).toEqual(
      buildBasicNamePayload({ name: "X" })
    );
    expect(buildUpstreamSectionPayload("priority-weight", { priority: 3, weight: 7 })).toEqual(
      buildPriorityWeightPayload({ priority: 3, weight: 7 })
    );
    expect(
      buildUpstreamSectionPayload("failure-rules", {
        failure_rule_config: { use_global_rules: false },
      })
    ).toEqual(buildFailureRulesPayload({ failure_rule_config: { use_global_rules: false } }));
    expect(buildUpstreamSectionPayload("affinity-migration", { affinity_migration: null })).toEqual(
      buildAffinityMigrationPayload({ affinity_migration: null })
    );
  });
});

describe("每个分区 builder 的 payload 只含本分区字段", () => {
  it("basic-name", () => {
    const values = upstreamSectionSchemas["basic-name"].parse({ name: "Test Upstream" });
    const payload = buildBasicNamePayload(values);
    expect(Object.keys(payload).sort()).toEqual(["name"]);
    expect(payload).toEqual({ name: "Test Upstream" });
  });

  it("basic-profile", () => {
    const values = upstreamSectionSchemas["basic-profile"].parse({
      official_website_url: "https://example.com",
    });
    const payload = buildBasicProfilePayload(values);
    expect(Object.keys(payload).sort()).toEqual(["official_website_url"]);
    expect(payload).toEqual({ official_website_url: "https://example.com" });
  });

  it("basic-route-endpoint", () => {
    const values = upstreamSectionSchemas["basic-route-endpoint"].parse({
      base_url: "https://api.example.com",
      route_capabilities: ["openai_chat_compatible"],
    });
    const payload = buildRouteEndpointPayload(values);
    expect(Object.keys(payload).sort()).toEqual(["base_url", "route_capabilities"]);
    // openai_chat_compatible 属于自动补 /v1 的能力集合
    expect(payload.base_url).toBe("https://api.example.com/v1");
    expect(payload.route_capabilities).toEqual(["openai_chat_compatible"]);
  });

  it("basic-api-key（非空值）", () => {
    const values = upstreamSectionSchemas["basic-api-key"].parse({ api_key: "sk-live-123" });
    const payload = buildApiKeyPayload(values);
    expect(Object.keys(payload).sort()).toEqual(["api_key"]);
  });

  it("priority-weight", () => {
    const values = upstreamSectionSchemas["priority-weight"].parse({ priority: 5, weight: 10 });
    const payload = buildPriorityWeightPayload(values);
    expect(Object.keys(payload).sort()).toEqual(["priority", "weight"]);
    expect(payload).toEqual({ priority: 5, weight: 10 });
  });

  it("model-routing", () => {
    const values = upstreamSectionSchemas["model-routing"].parse({
      model_discovery: {
        mode: "openai_compatible",
        custom_endpoint: "",
        enable_lite_llm_fallback: false,
        auto_refresh_enabled: false,
      },
      model_rules: [
        {
          type: "exact",
          value: "gpt-4",
          target_model: null,
          source: "manual",
          display_label: null,
        },
      ],
    });
    const payload = buildModelRoutingPayload(values);
    expect(Object.keys(payload).sort()).toEqual(["model_discovery", "model_rules"]);
  });

  it("billing-multipliers", () => {
    const values = upstreamSectionSchemas["billing-multipliers"].parse({
      billing_input_multiplier: 1.5,
      billing_output_multiplier: 2,
    });
    const payload = buildBillingMultipliersPayload(values);
    expect(Object.keys(payload).sort()).toEqual([
      "billing_input_multiplier",
      "billing_output_multiplier",
    ]);
    expect(payload).toEqual({ billing_input_multiplier: 1.5, billing_output_multiplier: 2 });
  });

  it("spending-quota", () => {
    const values = upstreamSectionSchemas["spending-quota"].parse({
      spending_rules: [{ period_type: "daily", limit: 100, period_hours: null }],
    });
    const payload = buildSpendingQuotaPayload(values);
    expect(Object.keys(payload).sort()).toEqual(["spending_rules"]);
  });

  it("capacity-control", () => {
    const values = upstreamSectionSchemas["capacity-control"].parse({
      max_concurrency: 10,
      queue_policy: { enabled: false, timeout_ms: 30000, max_queue_length: null },
    });
    const payload = buildCapacityControlPayload(values);
    expect(Object.keys(payload).sort()).toEqual(["max_concurrency", "queue_policy"]);
  });

  it("circuit-breaker", () => {
    const values = upstreamSectionSchemas["circuit-breaker"].parse({
      circuit_breaker_config: null,
    });
    const payload = buildCircuitBreakerPayload(values);
    expect(Object.keys(payload).sort()).toEqual(["circuit_breaker_config"]);
  });

  it("failure-rules", () => {
    const values = upstreamSectionSchemas["failure-rules"].parse({
      failure_rule_config: { use_global_rules: true },
    });
    const payload = buildFailureRulesPayload(values);
    expect(Object.keys(payload).sort()).toEqual(["failure_rule_config"]);
  });

  it("affinity-migration", () => {
    const values = upstreamSectionSchemas["affinity-migration"].parse({
      affinity_migration: {
        enabled: true,
        metric: "tokens",
        threshold: 1000,
      },
    });
    const payload = buildAffinityMigrationPayload(values);
    expect(Object.keys(payload).sort()).toEqual(["affinity_migration"]);
  });
});

describe("buildApiKeyPayload：write-only 语义", () => {
  it.each(["", "   "])("空/空白值（%j）省略 api_key 字段", (raw) => {
    const values = upstreamSectionSchemas["basic-api-key"].parse({ api_key: raw });
    const payload = buildApiKeyPayload(values);
    expect(payload).toEqual({});
    expect("api_key" in payload).toBe(false);
  });

  it("非空值裁剪首尾空格后提交", () => {
    const values = upstreamSectionSchemas["basic-api-key"].parse({ api_key: "sk-x " });
    const payload = buildApiKeyPayload(values);
    expect(payload).toEqual({ api_key: "sk-x" });
  });
});

describe("buildBasicProfilePayload：description 死字段防回归守卫", () => {
  it("非空 URL 时不含 description 字段", () => {
    const values = upstreamSectionSchemas["basic-profile"].parse({
      official_website_url: "https://vendor.example.com",
    });
    const payload = buildBasicProfilePayload(values);
    expect("description" in payload).toBe(false);
  });

  it.each(["", "   "])("空/空白输入（%j）归一为 null 且不含 description 字段", (raw) => {
    // 空白值不满足 schema 的 z.union([literal(""), url()])，此处直接调用纯函数
    // 校验运行时裁剪行为（对齐 form-values.ts 的 official_website_url 语义）。
    const payload = buildBasicProfilePayload({ official_website_url: raw });
    expect(payload).toEqual({ official_website_url: null });
    expect("description" in payload).toBe(false);
    expect(Object.keys(payload)).toEqual(["official_website_url"]);
  });
});

describe("normalizeQueuePolicyForSubmit", () => {
  it("enabled=false 时返回 null，忽略其余字段", () => {
    const policy = queuePolicyFormSchema.parse({
      enabled: false,
      timeout_ms: 1000,
      max_queue_length: 5,
    });
    expect(normalizeQueuePolicyForSubmit(policy)).toBeNull();
  });

  it("enabled=true 时透传 timeout_ms 与 max_queue_length（含 null）", () => {
    const policy = queuePolicyFormSchema.parse({
      enabled: true,
      timeout_ms: 2000,
      max_queue_length: null,
    });
    expect(normalizeQueuePolicyForSubmit(policy)).toEqual({
      enabled: true,
      timeout_ms: 2000,
      max_queue_length: null,
    });
  });
});

describe("toApiModelDiscoveryValue", () => {
  it("custom_endpoint 空白裁剪为 null", () => {
    const value = modelDiscoverySchema.parse({
      mode: "custom",
      custom_endpoint: "   ",
      enable_lite_llm_fallback: false,
      auto_refresh_enabled: true,
    });
    expect(toApiModelDiscoveryValue(value)).toEqual({
      mode: "custom",
      custom_endpoint: null,
      enable_lite_llm_fallback: false,
      auto_refresh_enabled: true,
    });
  });

  it("custom_endpoint 非空时裁剪首尾空格但保留内容", () => {
    const value = modelDiscoverySchema.parse({
      mode: "custom",
      custom_endpoint: "  https://relay.example.com  ",
      enable_lite_llm_fallback: true,
      auto_refresh_enabled: false,
    });
    expect(toApiModelDiscoveryValue(value).custom_endpoint).toBe("https://relay.example.com");
  });
});

describe("toApiModelRulesValue", () => {
  it("裁剪 value/target_model/display_label 并保留非 alias 规则的 target_model=null", () => {
    const rules = [
      modelRuleSchema.parse({
        type: "exact",
        value: "  gpt-4  ",
        target_model: null,
        source: "manual",
        display_label: "  Label  ",
      }),
      modelRuleSchema.parse({
        type: "alias",
        value: "gpt-4-alias",
        target_model: "  gpt-4  ",
        source: "manual",
        display_label: null,
      }),
    ];
    expect(toApiModelRulesValue(rules)).toEqual([
      {
        type: "exact",
        value: "gpt-4",
        target_model: null,
        source: "manual",
        display_label: "Label",
      },
      {
        type: "alias",
        value: "gpt-4-alias",
        target_model: "gpt-4",
        source: "manual",
        display_label: null,
      },
    ]);
  });

  it("非 alias 类型即使携带 target_model 也强制归 null", () => {
    const rules = [
      modelRuleSchema.parse({
        type: "regex",
        value: "^gpt-.*$",
        target_model: "ignored-in-schema-but-defensive",
        source: "manual",
        display_label: null,
      }),
    ];
    expect(toApiModelRulesValue(rules)![0].target_model).toBeNull();
  });

  it("裁剪后为空的规则被过滤；全部为空时返回 null", () => {
    // modelRuleSchema 的 value 经 trim().min(1) 校验，无法构造出裁剪后为空的合法
    // 实例；此处直接以纯函数入参形式覆盖 filter 分支（防御性代码路径）。
    expect(
      toApiModelRulesValue([
        { type: "exact", value: "   ", target_model: null, source: "manual", display_label: null },
      ])
    ).toBeNull();
  });
});

describe("spendingRulesToApi", () => {
  it("空数组返回 null", () => {
    expect(spendingRulesToApi([])).toBeNull();
  });

  it("rolling 规则缺省 period_hours 时补默认 24 小时", () => {
    const rules = [
      spendingRuleSchema.parse({ period_type: "rolling", limit: 10, period_hours: null }),
    ];
    expect(spendingRulesToApi(rules)).toEqual([
      { period_type: "rolling", limit: 10, period_hours: ROLLING_DEFAULT_PERIOD_HOURS },
    ]);
  });

  it("rolling 规则显式 period_hours 时原样透传", () => {
    const rules = [
      spendingRuleSchema.parse({ period_type: "rolling", limit: 10, period_hours: 6 }),
    ];
    expect(spendingRulesToApi(rules)).toEqual([
      { period_type: "rolling", limit: 10, period_hours: 6 },
    ]);
  });

  it("daily/monthly 规则不携带 period_hours 键（非仅值为 undefined）", () => {
    const rules = [
      spendingRuleSchema.parse({ period_type: "daily", limit: 10, period_hours: null }),
      spendingRuleSchema.parse({ period_type: "monthly", limit: 20, period_hours: null }),
    ];
    const result = spendingRulesToApi(rules)!;
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
