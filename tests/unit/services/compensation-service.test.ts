import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildCompensations, invalidateCache } from "@/lib/services/compensation-service";

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
  },
  compensationRules: { enabled: "enabled" },
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  }),
}));

function makeRule(overrides: {
  capabilities?: string[];
  targetHeader?: string;
  sources?: string[];
  mode?: string;
}) {
  return {
    id: "rule-1",
    name: "Test Rule",
    isBuiltin: false,
    enabled: true,
    capabilities: overrides.capabilities ?? ["codex_responses"],
    targetHeader: overrides.targetHeader ?? "session_id",
    sources: overrides.sources ?? ["headers.session_id"],
    mode: overrides.mode ?? "missing_only",
  };
}

function setupDbWithRules(rules: ReturnType<typeof makeRule>[]) {
  mockSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rules),
    }),
  });
}

describe("compensation-service", () => {
  beforeEach(() => {
    invalidateCache();
    vi.clearAllMocks();
  });

  describe("buildCompensations", () => {
    it("should return empty array when no rules match the capability", async () => {
      setupDbWithRules([
        makeRule({ capabilities: ["anthropic_messages"], targetHeader: "session_id" }),
      ]);

      const result = await buildCompensations(
        "codex_responses",
        { "content-type": "application/json" },
        null
      );

      expect(result).toHaveLength(0);
    });

    it("should resolve header source correctly", async () => {
      setupDbWithRules([
        makeRule({
          capabilities: ["codex_responses"],
          targetHeader: "session_id",
          sources: ["headers.session_id"],
        }),
      ]);

      const result = await buildCompensations(
        "codex_responses",
        { session_id: "sess_abc123" },
        null
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        header: "session_id",
        value: "sess_abc123",
        source: "headers.session_id",
      });
    });

    it("should resolve body source correctly", async () => {
      setupDbWithRules([
        makeRule({
          capabilities: ["codex_responses"],
          targetHeader: "session_id",
          sources: ["body.prompt_cache_key"],
        }),
      ]);

      const result = await buildCompensations(
        "codex_responses",
        {},
        { prompt_cache_key: "cache_key_value" }
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        header: "session_id",
        value: "cache_key_value",
        source: "body.prompt_cache_key",
      });
    });

    it("should resolve nested body path", async () => {
      setupDbWithRules([
        makeRule({
          sources: ["body.metadata.session_id"],
        }),
      ]);

      const result = await buildCompensations(
        "codex_responses",
        {},
        { metadata: { session_id: "nested_value" } }
      );

      expect(result).toHaveLength(1);
      expect(result[0].value).toBe("nested_value");
    });

    it("should try sources in order and use the first resolved value", async () => {
      setupDbWithRules([
        makeRule({
          sources: ["headers.session_id", "body.prompt_cache_key", "headers.x-session-id"],
        }),
      ]);

      const result = await buildCompensations(
        "codex_responses",
        { "x-session-id": "from_x_header" },
        { prompt_cache_key: "from_body" }
      );

      // body.prompt_cache_key is second, but headers.session_id is first (missing), so second wins
      expect(result).toHaveLength(1);
      expect(result[0].source).toBe("body.prompt_cache_key");
    });

    it("should skip rule when no source resolves", async () => {
      setupDbWithRules([
        makeRule({
          sources: ["headers.session_id", "body.prompt_cache_key"],
        }),
      ]);

      const result = await buildCompensations("codex_responses", {}, null);

      expect(result).toHaveLength(0);
    });

    it("should skip invalid source paths", async () => {
      setupDbWithRules([
        makeRule({
          sources: ["invalid_path", "headers.session_id"],
        }),
      ]);

      const result = await buildCompensations("codex_responses", { session_id: "valid" }, null);

      // "invalid_path" is skipped, "headers.session_id" resolves
      expect(result).toHaveLength(1);
      expect(result[0].source).toBe("headers.session_id");
    });

    it("should handle multiple rules and return one entry per rule", async () => {
      setupDbWithRules([
        makeRule({
          capabilities: ["codex_responses"],
          targetHeader: "session_id",
          sources: ["headers.session_id"],
        }),
        {
          id: "rule-2",
          name: "Another Rule",
          isBuiltin: false,
          enabled: true,
          capabilities: ["codex_responses"],
          targetHeader: "x-custom",
          sources: ["headers.x-custom"],
          mode: "missing_only",
        },
      ]);

      const result = await buildCompensations(
        "codex_responses",
        { session_id: "sess1", "x-custom": "custom1" },
        null
      );

      expect(result).toHaveLength(2);
      expect(result.find((r) => r.header === "session_id")?.value).toBe("sess1");
      expect(result.find((r) => r.header === "x-custom")?.value).toBe("custom1");
    });

    it("should return empty array and not throw when db fails", async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error("DB connection error")),
        }),
      });

      const result = await buildCompensations("codex_responses", {}, null);

      expect(result).toHaveLength(0);
    });

    it("should use cached rules on subsequent calls", async () => {
      setupDbWithRules([makeRule({ sources: ["headers.session_id"] })]);

      await buildCompensations("codex_responses", { session_id: "s1" }, null);
      await buildCompensations("codex_responses", { session_id: "s2" }, null);

      // DB should only be queried once (the second call uses cache)
      expect(mockSelect).toHaveBeenCalledTimes(1);
    });

    it("should reload rules after cache is invalidated", async () => {
      setupDbWithRules([makeRule({ sources: ["headers.session_id"] })]);

      await buildCompensations("codex_responses", { session_id: "s1" }, null);
      invalidateCache();
      await buildCompensations("codex_responses", { session_id: "s2" }, null);

      expect(mockSelect).toHaveBeenCalledTimes(2);
    });

    it("should ignore body source when body is null", async () => {
      setupDbWithRules([
        makeRule({
          sources: ["body.prompt_cache_key"],
        }),
      ]);

      const result = await buildCompensations("codex_responses", {}, null);

      expect(result).toHaveLength(0);
    });

    it("should ignore empty string header values", async () => {
      setupDbWithRules([
        makeRule({
          sources: ["headers.session_id"],
        }),
      ]);

      const result = await buildCompensations("codex_responses", { session_id: "   " }, null);

      expect(result).toHaveLength(0);
    });
  });
});
