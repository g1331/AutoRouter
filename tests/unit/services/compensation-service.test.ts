import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSelect, mockInsert, mockUpdate } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
  },
  compensationRules: { enabled: "enabled", id: "id", isBuiltin: "isBuiltin", name: "name" },
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
  mockSelect.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  });

  mockSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rules),
    }),
  });
}

describe("compensation-service", () => {
  let buildCompensations: typeof import("@/lib/services/compensation-service").buildCompensations;
  let invalidateCache: typeof import("@/lib/services/compensation-service").invalidateCache;
  let ensureBuiltinCompensationRulesExist: typeof import("@/lib/services/compensation-service").ensureBuiltinCompensationRulesExist;

  const setupInsertNoop = () => {
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    };
    mockInsert.mockReturnValue(insertChain);
    return insertChain;
  };

  beforeEach(async () => {
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    vi.resetModules();
    ({ buildCompensations, invalidateCache, ensureBuiltinCompensationRulesExist } =
      await import("@/lib/services/compensation-service"));
    invalidateCache();
    setupInsertNoop();
  });

  describe("ensureBuiltinCompensationRulesExist", () => {
    it("should insert builtin rule and only run once", async () => {
      const insertChain = setupInsertNoop();

      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      await ensureBuiltinCompensationRulesExist();
      await ensureBuiltinCompensationRulesExist();

      expect(mockSelect).toHaveBeenCalledTimes(1);
      expect(mockInsert).toHaveBeenCalledTimes(1);
      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Session ID Recovery", isBuiltin: true })
      );
      expect(insertChain.onConflictDoNothing).toHaveBeenCalledTimes(1);
    });

    it("should update builtin rule config without changing enabled", async () => {
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: "rule-builtin", isBuiltin: true }]),
        }),
      });

      const updateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      mockUpdate.mockReturnValue(updateChain);

      await ensureBuiltinCompensationRulesExist();

      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          capabilities: ["codex_responses"],
          mode: "missing_only",
          targetHeader: "session_id",
        })
      );
      expect(updateChain.set.mock.calls[0]?.[0]).not.toHaveProperty("enabled");
    });

    it("should retry ensure after name conflict cool-down", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: "rule-custom", isBuiltin: false }]),
        }),
      });

      await ensureBuiltinCompensationRulesExist();
      await ensureBuiltinCompensationRulesExist();
      expect(mockSelect).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(60_000);

      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      await ensureBuiltinCompensationRulesExist();
      expect(mockSelect).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
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
      // One select for builtin ensure + one select for initial rule load
      expect(mockSelect).toHaveBeenCalledTimes(2);
    });

    it("should reload rules after cache is invalidated", async () => {
      setupDbWithRules([makeRule({ sources: ["headers.session_id"] })]);

      await buildCompensations("codex_responses", { session_id: "s1" }, null);
      invalidateCache();
      await buildCompensations("codex_responses", { session_id: "s2" }, null);

      // Two selects for the first call (ensure + load) and one select for reload after invalidation
      expect(mockSelect).toHaveBeenCalledTimes(3);
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
