import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  SessionAffinityStore,
  extractSessionId,
  shouldMigrate,
  type AffinityMigrationConfig,
  type UpstreamCandidate,
} from "@/lib/services/session-affinity";

describe("SessionAffinityStore", () => {
  let store: SessionAffinityStore;

  beforeEach(() => {
    store = new SessionAffinityStore(5000, 30000); // 5s TTL, 30s max
  });

  afterEach(() => {
    store.dispose();
  });

  describe("basic operations", () => {
    it("should set and get affinity entry", () => {
      store.set("key1", "anthropic_messages", "session-abc", "upstream-1", 1024);

      const entry = store.get("key1", "anthropic_messages", "session-abc");

      expect(entry).not.toBeNull();
      expect(entry?.upstreamId).toBe("upstream-1");
      expect(entry?.contentLength).toBe(1024);
      expect(entry?.cumulativeTokens).toBe(0);
    });

    it("should return null for non-existent entry", () => {
      const entry = store.get("key1", "anthropic_messages", "non-existent");
      expect(entry).toBeNull();
    });

    it("should update existing entry preserving cumulative tokens", () => {
      store.set("key1", "anthropic_messages", "session-abc", "upstream-1", 1024);
      store.updateCumulativeTokens("key1", "anthropic_messages", "session-abc", {
        totalInputTokens: 175,
      });

      // Update to new upstream
      store.set("key1", "anthropic_messages", "session-abc", "upstream-2", 2048);

      const entry = store.get("key1", "anthropic_messages", "session-abc");
      expect(entry?.upstreamId).toBe("upstream-2");
      expect(entry?.cumulativeTokens).toBe(175); // Preserved
    });

    it("should delete entry", () => {
      store.set("key1", "anthropic_messages", "session-abc", "upstream-1", 1024);

      const deleted = store.delete("key1", "anthropic_messages", "session-abc");

      expect(deleted).toBe(true);
      expect(store.get("key1", "anthropic_messages", "session-abc")).toBeNull();
    });

    it("should check if entry exists", () => {
      store.set("key1", "anthropic_messages", "session-abc", "upstream-1", 1024);

      expect(store.has("key1", "anthropic_messages", "session-abc")).toBe(true);
      expect(store.has("key1", "anthropic_messages", "other-session")).toBe(false);
    });
  });

  describe("TTL management", () => {
    it("should refresh lastAccessedAt on get (sliding window)", async () => {
      store.set("key1", "anthropic_messages", "session-abc", "upstream-1", 1024);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Get should refresh
      const entry1 = store.get("key1", "anthropic_messages", "session-abc");
      expect(entry1).not.toBeNull();

      // Wait again, but less than TTL
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should still exist due to sliding window
      const entry2 = store.get("key1", "anthropic_messages", "session-abc");
      expect(entry2).not.toBeNull();
    });

    it("should expire entry after TTL", async () => {
      const shortStore = new SessionAffinityStore(100, 1000); // 100ms TTL

      shortStore.set("key1", "anthropic_messages", "session-abc", "upstream-1", 1024);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      const entry = shortStore.get("key1", "anthropic_messages", "session-abc");
      expect(entry).toBeNull();

      shortStore.dispose();
    });

    it("should expire entry after max TTL even with activity", () => {
      vi.useFakeTimers();
      const shortStore = new SessionAffinityStore(5000, 100); // 100ms max TTL

      try {
        shortStore.set("key1", "anthropic_messages", "session-abc", "upstream-1", 1024);

        // Get multiple times to refresh sliding window
        vi.advanceTimersByTime(30);
        expect(shortStore.get("key1", "anthropic_messages", "session-abc")).not.toBeNull();

        vi.advanceTimersByTime(30);
        expect(shortStore.get("key1", "anthropic_messages", "session-abc")).not.toBeNull();

        // Move beyond max TTL (absolute lifetime from createdAt)
        vi.advanceTimersByTime(41);

        const entry = shortStore.get("key1", "anthropic_messages", "session-abc");
        expect(entry).toBeNull();
      } finally {
        shortStore.dispose();
        vi.useRealTimers();
      }
    });
  });

  describe("cleanup", () => {
    it("should cleanup expired entries", async () => {
      const shortStore = new SessionAffinityStore(50, 1000);

      shortStore.set("key1", "anthropic_messages", "session-1", "upstream-1", 1024);
      shortStore.set("key1", "anthropic_messages", "session-2", "upstream-2", 2048);

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Add a fresh entry
      shortStore.set("key1", "anthropic_messages", "session-3", "upstream-3", 512);

      const cleaned = shortStore.cleanup();

      expect(cleaned).toBe(2);
      expect(shortStore.size()).toBe(1);
      expect(shortStore.has("key1", "anthropic_messages", "session-3")).toBe(true);

      shortStore.dispose();
    });

    it("should clear all entries", () => {
      store.set("key1", "anthropic_messages", "session-1", "upstream-1", 1024);
      store.set("key1", "anthropic_messages", "session-2", "upstream-2", 2048);

      store.clear();

      expect(store.size()).toBe(0);
      expect(store.get("key1", "anthropic_messages", "session-1")).toBeNull();
    });
  });

  describe("updateCumulativeTokens", () => {
    it("should accumulate input tokens", () => {
      store.set("key1", "anthropic_messages", "session-abc", "upstream-1", 1024);

      store.updateCumulativeTokens("key1", "anthropic_messages", "session-abc", {
        totalInputTokens: 175,
      });

      const entry = store.get("key1", "anthropic_messages", "session-abc");
      expect(entry?.cumulativeTokens).toBe(175);
    });

    it("should accumulate multiple updates", () => {
      store.set("key1", "anthropic_messages", "session-abc", "upstream-1", 1024);

      store.updateCumulativeTokens("key1", "anthropic_messages", "session-abc", {
        totalInputTokens: 100,
      });

      store.updateCumulativeTokens("key1", "anthropic_messages", "session-abc", {
        totalInputTokens: 275,
      });

      const entry = store.get("key1", "anthropic_messages", "session-abc");
      expect(entry?.cumulativeTokens).toBe(375);
    });

    it("should do nothing for non-existent entry", () => {
      // Should not throw
      store.updateCumulativeTokens("key1", "anthropic_messages", "non-existent", {
        totalInputTokens: 175,
      });

      expect(store.size()).toBe(0);
    });

    it("should keep cumulative tokens isolated by route capability scope", () => {
      store.set("key1", "codex_responses", "session-abc", "upstream-codex", 1024);
      store.set("key1", "openai_chat_compatible", "session-abc", "upstream-openai-chat", 1024);

      store.updateCumulativeTokens("key1", "codex_responses", "session-abc", {
        totalInputTokens: 100,
      });
      store.updateCumulativeTokens("key1", "openai_chat_compatible", "session-abc", {
        totalInputTokens: 250,
      });

      const codexEntry = store.get("key1", "codex_responses", "session-abc");
      const chatEntry = store.get("key1", "openai_chat_compatible", "session-abc");

      expect(codexEntry?.cumulativeTokens).toBe(100);
      expect(chatEntry?.cumulativeTokens).toBe(250);
    });
  });

  describe("key isolation", () => {
    it("should isolate entries by api key", () => {
      store.set("key1", "anthropic_messages", "session-abc", "upstream-1", 1024);
      store.set("key2", "anthropic_messages", "session-abc", "upstream-2", 2048);

      expect(store.get("key1", "anthropic_messages", "session-abc")?.upstreamId).toBe("upstream-1");
      expect(store.get("key2", "anthropic_messages", "session-abc")?.upstreamId).toBe("upstream-2");
    });

    it("should isolate entries by route capability scope", () => {
      store.set("key1", "codex_responses", "session-abc", "upstream-1", 1024);
      store.set("key1", "openai_chat_compatible", "session-abc", "upstream-2", 2048);

      expect(store.get("key1", "codex_responses", "session-abc")?.upstreamId).toBe("upstream-1");
      expect(store.get("key1", "openai_chat_compatible", "session-abc")?.upstreamId).toBe(
        "upstream-2"
      );
    });

    it("should isolate entries by session id", () => {
      store.set("key1", "anthropic_messages", "session-abc", "upstream-1", 1024);
      store.set("key1", "anthropic_messages", "session-def", "upstream-2", 2048);

      expect(store.get("key1", "anthropic_messages", "session-abc")?.upstreamId).toBe("upstream-1");
      expect(store.get("key1", "anthropic_messages", "session-def")?.upstreamId).toBe("upstream-2");
    });
  });
});

describe("extractSessionId", () => {
  describe("capability-based extraction", () => {
    it("should extract anthropic session for anthropic_messages capability", () => {
      const body = {
        metadata: {
          user_id: "claude-code_session_550e8400-e29b-41d4-a716-446655440000",
        },
      };

      const sessionId = extractSessionId("anthropic_messages", {}, body);

      expect(sessionId).toBe("550e8400-e29b-41d4-a716-446655440000");
    });

    it("should extract session_id for codex/openai capabilities", () => {
      const headers = {
        session_id: "sess_route_scope_001",
      };

      expect(extractSessionId("codex_responses", headers, {})).toBe("sess_route_scope_001");
      expect(extractSessionId("openai_chat_compatible", headers, {})).toBe("sess_route_scope_001");
      expect(extractSessionId("openai_extended", headers, {})).toBe("sess_route_scope_001");
    });

    it("should return null for capabilities without session strategy", () => {
      expect(extractSessionId("gemini_native_generate", {}, { any: "payload" })).toBeNull();
      expect(extractSessionId("gemini_code_assist_internal", {}, { any: "payload" })).toBeNull();
    });
  });

  describe("anthropic provider", () => {
    it("should extract session UUID from metadata.user_id", () => {
      const body = {
        metadata: {
          user_id: "claude-code_session_550e8400-e29b-41d4-a716-446655440000",
        },
      };

      const sessionId = extractSessionId("anthropic_messages", {}, body);

      expect(sessionId).toBe("550e8400-e29b-41d4-a716-446655440000");
    });

    it("should handle different prefixes", () => {
      const body = {
        metadata: {
          user_id: "some-user_session_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        },
      };

      const sessionId = extractSessionId("anthropic_messages", {}, body);

      expect(sessionId).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890");
    });

    it("should return null when user_id has no session pattern", () => {
      const body = {
        metadata: {
          user_id: "just-a-regular-user-id",
        },
      };

      const sessionId = extractSessionId("anthropic_messages", {}, body);

      expect(sessionId).toBeNull();
    });

    it("should return null when metadata is missing", () => {
      const body = {};

      const sessionId = extractSessionId("anthropic_messages", {}, body);

      expect(sessionId).toBeNull();
    });

    it("should return null when user_id is not a string", () => {
      const body = {
        metadata: {
          user_id: 12345,
        },
      };

      const sessionId = extractSessionId("anthropic_messages", {}, body);

      expect(sessionId).toBeNull();
    });

    it("should return null for null body", () => {
      const sessionId = extractSessionId("anthropic_messages", {}, null);

      expect(sessionId).toBeNull();
    });

    it("should handle uppercase UUID", () => {
      const body = {
        metadata: {
          user_id: "user_session_550E8400-E29B-41D4-A716-446655440000",
        },
      };

      const sessionId = extractSessionId("anthropic_messages", {}, body);

      expect(sessionId).toBe("550e8400-e29b-41d4-a716-446655440000");
    });
  });

  describe("openai provider", () => {
    it("should extract session_id from headers", () => {
      const headers = {
        session_id: "sess_abc123def456",
      };

      const sessionId = extractSessionId("openai_chat_compatible", headers, {});

      expect(sessionId).toBe("sess_abc123def456");
    });

    it("should return null when session_id header is missing", () => {
      const headers = {
        authorization: "Bearer token",
      };

      const sessionId = extractSessionId("openai_chat_compatible", headers, {});

      expect(sessionId).toBeNull();
    });

    it("should return null when session_id is empty string", () => {
      const headers = {
        session_id: "",
      };

      const sessionId = extractSessionId("openai_chat_compatible", headers, {});

      expect(sessionId).toBeNull();
    });

    it("should return null when session_id is array", () => {
      const headers = {
        session_id: ["sess_1", "sess_2"],
      };

      const sessionId = extractSessionId("openai_chat_compatible", headers, {});

      expect(sessionId).toBeNull();
    });
  });

  describe("other providers", () => {
    it("should return null for google provider", () => {
      const sessionId = extractSessionId("gemini_native_generate", {}, { some: "data" });
      expect(sessionId).toBeNull();
    });

    it("should return null for custom provider", () => {
      const sessionId = extractSessionId("gemini_code_assist_internal", {}, { some: "data" });
      expect(sessionId).toBeNull();
    });
  });
});

describe("shouldMigrate", () => {
  const createUpstream = (
    id: string,
    priority: number,
    migration: AffinityMigrationConfig | null
  ): UpstreamCandidate => ({
    id,
    priority,
    affinityMigration: migration,
  });

  it("should return null when current upstream is already highest priority", () => {
    const current = createUpstream("up-1", 0, null);
    const candidates = [
      createUpstream("up-1", 0, null),
      createUpstream("up-2", 1, { enabled: true, metric: "tokens", threshold: 50000 }),
    ];

    const result = shouldMigrate(current, candidates, 1000, 1000);

    expect(result).toBeNull();
  });

  it("should migrate when higher priority upstream accepts and tokens below threshold", () => {
    const current = createUpstream("up-2", 1, null);
    const candidates = [
      createUpstream("up-1", 0, { enabled: true, metric: "tokens", threshold: 50000 }),
      current,
    ];

    const result = shouldMigrate(current, candidates, 1000, 1000);

    expect(result).not.toBeNull();
    expect(result?.id).toBe("up-1");
  });

  it("should not migrate when tokens exceed threshold", () => {
    const current = createUpstream("up-2", 1, null);
    const candidates = [
      createUpstream("up-1", 0, { enabled: true, metric: "tokens", threshold: 50000 }),
      current,
    ];

    const result = shouldMigrate(current, candidates, 1000, 60000);

    expect(result).toBeNull();
  });

  it("should migrate based on length metric", () => {
    const current = createUpstream("up-2", 1, null);
    const candidates = [
      createUpstream("up-1", 0, { enabled: true, metric: "length", threshold: 51200 }),
      current,
    ];

    // Content length below threshold
    const result1 = shouldMigrate(current, candidates, 50000, 100000);
    expect(result1).not.toBeNull();

    // Content length above threshold
    const result2 = shouldMigrate(current, candidates, 60000, 1000);
    expect(result2).toBeNull();
  });

  it("should allow migration when cumulativeTokens is 0 (first request)", () => {
    const current = createUpstream("up-2", 1, null);
    const candidates = [
      createUpstream("up-1", 0, { enabled: true, metric: "tokens", threshold: 50000 }),
      current,
    ];

    const result = shouldMigrate(current, candidates, 1000, 0);

    expect(result).not.toBeNull();
  });

  it("should not migrate when higher priority upstream has migration disabled", () => {
    const current = createUpstream("up-2", 1, null);
    const candidates = [
      createUpstream("up-1", 0, { enabled: false, metric: "tokens", threshold: 50000 }),
      current,
    ];

    const result = shouldMigrate(current, candidates, 1000, 1000);

    expect(result).toBeNull();
  });

  it("should not migrate when higher priority upstream has no migration config", () => {
    const current = createUpstream("up-2", 1, null);
    const candidates = [createUpstream("up-1", 0, null), current];

    const result = shouldMigrate(current, candidates, 1000, 1000);

    expect(result).toBeNull();
  });

  it("should choose highest priority upstream that accepts migration", () => {
    const current = createUpstream("up-3", 2, null);
    const candidates = [
      createUpstream("up-1", 0, { enabled: false, metric: "tokens", threshold: 50000 }),
      createUpstream("up-2", 1, { enabled: true, metric: "tokens", threshold: 50000 }),
      current,
    ];

    const result = shouldMigrate(current, candidates, 1000, 1000);

    expect(result?.id).toBe("up-2");
  });

  it("should handle multiple higher priority upstreams", () => {
    const current = createUpstream("up-3", 2, null);
    const candidates = [
      createUpstream("up-1", 0, { enabled: true, metric: "tokens", threshold: 50000 }),
      createUpstream("up-2", 1, { enabled: true, metric: "tokens", threshold: 50000 }),
      current,
    ];

    const result = shouldMigrate(current, candidates, 1000, 1000);

    // Should choose up-1 (highest priority)
    expect(result?.id).toBe("up-1");
  });
});
