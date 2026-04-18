import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  InvalidUpstreamModelRulesError,
  maskApiKey,
  UpstreamNotFoundError,
  type UpstreamUpdateInput,
} from "@/lib/services/upstream-crud";

// Type helpers for mocking Drizzle ORM query builder
type MockInsertChain = {
  values: ReturnType<typeof vi.fn>;
};

type MockUpdateChain = {
  set: ReturnType<typeof vi.fn>;
};

type MockSelectChain = {
  from: ReturnType<typeof vi.fn>;
};

type MockDeleteChain = {
  where: ReturnType<typeof vi.fn>;
};

type PartialUpstream = {
  id: string;
  name: string;
  [key: string]: unknown;
};

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      upstreams: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      requestLogs: {
        findFirst: vi.fn(),
      },
      circuitBreakerStates: {
        findMany: vi.fn(() => Promise.resolve([])),
      },
    },
    select: vi.fn((selection?: Record<string, unknown>) => {
      if (selection && "value" in selection) {
        return {
          from: vi.fn(() => Promise.resolve([{ value: 0 }])),
        };
      }

      return {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            groupBy: vi.fn(() => Promise.resolve([])),
          })),
        })),
      };
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() =>
          Promise.resolve([
            {
              id: "cb-1",
              upstreamId: "test-upstream-id",
              state: "closed",
              failureCount: 0,
              successCount: 0,
              lastFailureAt: null,
              openedAt: null,
            },
          ])
        ),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(),
    })),
  },
  upstreams: {},
  circuitBreakerStates: {},
  requestLogs: {
    upstreamId: "upstreamId",
    createdAt: "createdAt",
  },
}));

vi.mock("@/lib/utils/encryption", () => ({
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  decrypt: vi.fn((value: string) => value.replace("encrypted:", "")),
}));

vi.mock("@/lib/services/load-balancer", () => ({
  getConnectionCountsSnapshot: vi.fn(() => ({})),
}));

describe("upstream-crud", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("maskApiKey", () => {
    it("should mask standard API key with sk- prefix", () => {
      expect(maskApiKey("sk-1234567890abcdef")).toBe("sk-***cdef");
    });

    it("should mask API key without sk- prefix", () => {
      expect(maskApiKey("api-1234567890abcdef")).toBe("ap***cdef");
    });

    it("should return *** for short keys", () => {
      expect(maskApiKey("short")).toBe("***");
    });

    it("should return *** for keys with length <= 7", () => {
      expect(maskApiKey("1234567")).toBe("***");
    });

    it("should handle exactly 8 character keys", () => {
      expect(maskApiKey("12345678")).toBe("12***5678");
    });

    it("should handle empty string", () => {
      expect(maskApiKey("")).toBe("***");
    });
  });

  describe("UpstreamNotFoundError", () => {
    it("should have correct name", () => {
      const error = new UpstreamNotFoundError("upstream not found");
      expect(error.name).toBe("UpstreamNotFoundError");
    });

    it("should have correct message", () => {
      const error = new UpstreamNotFoundError("Upstream not found: test-id");
      expect(error.message).toBe("Upstream not found: test-id");
    });

    it("should be instanceof Error", () => {
      const error = new UpstreamNotFoundError("test");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("createUpstream", () => {
    it("should create upstream with encrypted API key", async () => {
      const { createUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");
      const { encrypt } = await import("@/lib/utils/encryption");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      const mockReturning = vi.fn().mockResolvedValue([
        {
          id: "test-id",
          name: "test-upstream",
          providerType: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-test-key",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          priority: 0,
          weight: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: mockReturning,
        }),
      } as unknown as MockInsertChain);

      const result = await createUpstream({
        name: "test-upstream",
        providerType: "openai",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-test-key",
      });

      expect(encrypt).toHaveBeenCalledWith("sk-test-key");
      expect(result.name).toBe("test-upstream");
      expect(result.apiKeyMasked).toBe("sk-***-key");
      expect(result.priority).toBe(0);
      expect(result.weight).toBe(1);
    });

    it("should create upstream with priority and weight", async () => {
      const { createUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      const mockReturning = vi.fn().mockResolvedValue([
        {
          id: "test-id",
          name: "test-upstream",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-test-key",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          priority: 10,
          weight: 5,
          providerType: null,
          allowedModels: null,
          modelRedirects: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: mockReturning,
        }),
      } as unknown as MockInsertChain);

      const result = await createUpstream({
        name: "test-upstream",
        providerType: "openai",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-test-key",
        priority: 10,
        weight: 5,
      });

      expect(result.priority).toBe(10);
      expect(result.weight).toBe(5);
    });

    it("should create upstream with routing fields", async () => {
      const { createUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      const mockReturning = vi.fn().mockResolvedValue([
        {
          id: "test-id",
          name: "test-upstream",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-test-key",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          priority: 0,
          weight: 1,
          providerType: "openai",
          routeCapabilities: ["openai_chat_compatible"],
          allowedModels: ["gpt-4", "gpt-4-turbo"],
          modelRedirects: { "gpt-4-turbo": "gpt-4" },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: mockReturning,
        }),
      } as unknown as MockInsertChain);

      const result = await createUpstream({
        name: "test-upstream",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-test-key",
        routeCapabilities: ["openai_chat_compatible"],
        allowedModels: ["gpt-4", "gpt-4-turbo"],
        modelRedirects: { "gpt-4-turbo": "gpt-4" },
      });

      expect(result.routeCapabilities).toEqual(["openai_chat_compatible"]);
      expect(result.allowedModels).toEqual(["gpt-4", "gpt-4-turbo"]);
      expect(result.modelRedirects).toEqual({ "gpt-4-turbo": "gpt-4" });
    });

    it("should persist normalized model discovery and unified model rules", async () => {
      const { createUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      const values = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: "test-id",
            name: "anthropic-upstream",
            baseUrl: "https://api.anthropic.com/v1",
            apiKeyEncrypted: "encrypted:sk-ant-test",
            isDefault: false,
            timeout: 60,
            isActive: true,
            config: null,
            priority: 0,
            weight: 1,
            routeCapabilities: ["anthropic_messages"],
            allowedModels: ["claude-3-7-sonnet"],
            modelRedirects: { "claude-3-opus": "claude-3-7-sonnet" },
            modelDiscovery: {
              mode: "anthropic_native",
              customEndpoint: null,
              enableLiteLlmFallback: true,
            },
            modelCatalog: null,
            modelCatalogUpdatedAt: null,
            modelCatalogLastStatus: null,
            modelCatalogLastError: null,
            modelCatalogLastFailedAt: null,
            modelRules: [
              {
                type: "exact",
                value: "claude-3-7-sonnet",
                targetModel: null,
                source: "manual",
                displayLabel: "精确匹配",
              },
              {
                type: "alias",
                value: "claude-3-opus",
                targetModel: "claude-3-7-sonnet",
                source: "manual",
                displayLabel: "模型别名",
              },
            ],
            affinityMigration: null,
            billingInputMultiplier: 1,
            billingOutputMultiplier: 1,
            spendingRules: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      });

      vi.mocked(db.insert).mockReturnValue({
        values,
      } as unknown as MockInsertChain);

      const result = await createUpstream({
        name: "anthropic-upstream",
        baseUrl: "https://api.anthropic.com/v1",
        apiKey: "sk-ant-test",
        routeCapabilities: ["anthropic_messages"],
        modelDiscovery: {
          mode: "anthropic_native",
          customEndpoint: null,
          enableLiteLlmFallback: true,
        },
        modelRules: [
          {
            type: "exact",
            value: "claude-3-7-sonnet",
            targetModel: null,
            source: "manual",
            displayLabel: "精确匹配",
          },
          {
            type: "alias",
            value: "claude-3-opus",
            targetModel: "claude-3-7-sonnet",
            source: "manual",
            displayLabel: "模型别名",
          },
        ],
      });

      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedModels: ["claude-3-7-sonnet"],
          modelRedirects: { "claude-3-opus": "claude-3-7-sonnet" },
          modelDiscovery: {
            mode: "anthropic_native",
            customEndpoint: null,
            enableLiteLlmFallback: true,
          },
          modelRules: [
            {
              type: "exact",
              value: "claude-3-7-sonnet",
              targetModel: null,
              source: "manual",
              displayLabel: "精确匹配",
            },
            {
              type: "alias",
              value: "claude-3-opus",
              targetModel: "claude-3-7-sonnet",
              source: "manual",
              displayLabel: "模型别名",
            },
          ],
        })
      );
      expect(result.modelDiscovery?.mode).toBe("anthropic_native");
      expect(result.modelRules).toHaveLength(2);
    });

    it("should reject invalid model rules before writing them", async () => {
      const { createUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      await expect(
        createUpstream({
          name: "broken-upstream",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-test-key",
          modelRules: [
            {
              type: "regex",
              value: "(",
              targetModel: null,
              source: "manual",
              displayLabel: "模式匹配",
            },
          ],
        })
      ).rejects.toThrow(InvalidUpstreamModelRulesError);

      expect(db.insert).not.toHaveBeenCalled();
    });

    it("should throw error if name already exists", async () => {
      const { createUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue({
        id: "existing-id",
        name: "test-upstream",
      } as unknown as PartialUpstream);

      await expect(
        createUpstream({
          name: "test-upstream",
          providerType: "openai",
          baseUrl: "https://api.openai.com",
          apiKey: "sk-test-key",
        })
      ).rejects.toThrow("Upstream with name 'test-upstream' already exists");
    });
  });

  describe("updateUpstream", () => {
    it("should update upstream", async () => {
      const { updateUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst)
        .mockResolvedValueOnce({
          id: "test-id",
          name: "test-upstream",
          providerType: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-test-key",
        } as unknown as PartialUpstream)
        .mockResolvedValueOnce(null);

      const mockReturning = vi.fn().mockResolvedValue([
        {
          id: "test-id",
          name: "updated-upstream",
          providerType: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-test-key",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          priority: 0,
          weight: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: mockReturning,
          }),
        }),
      } as unknown as MockUpdateChain);

      const result = await updateUpstream("test-id", { name: "updated-upstream" });

      expect(result.name).toBe("updated-upstream");
    });

    it("should update upstream with priority and weight", async () => {
      const { updateUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce({
        id: "test-id",
        name: "test-upstream",
        providerType: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted:sk-test-key",
        priority: 0,
        weight: 1,
      } as unknown as PartialUpstream);

      const mockReturning = vi.fn().mockResolvedValue([
        {
          id: "test-id",
          name: "test-upstream",
          providerType: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-test-key",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          priority: 5,
          weight: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: mockReturning,
          }),
        }),
      } as unknown as MockUpdateChain);

      const result = await updateUpstream("test-id", { priority: 5, weight: 10 });

      expect(result.priority).toBe(5);
      expect(result.weight).toBe(10);
    });

    it("should return lastUsedAt in update response when request logs exist", async () => {
      const { updateUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");
      const lastUsedAt = new Date("2026-03-03T10:00:00.000Z");

      vi.mocked(db.select).mockImplementation((selection?: Record<string, unknown>) => {
        if (selection && "value" in selection) {
          return {
            from: vi.fn().mockResolvedValue([{ value: 0 }]),
          } as unknown as MockSelectChain;
        }

        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              groupBy: vi.fn().mockResolvedValue([
                { upstreamId: "test-id", lastUsedAt },
                { upstreamId: null, lastUsedAt: new Date("2026-03-03T09:00:00.000Z") },
              ]),
            })),
          })),
        } as unknown as MockSelectChain;
      });

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce({
        id: "test-id",
        name: "test-upstream",
        providerType: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted:sk-test-key",
      } as unknown as PartialUpstream);

      const mockReturning = vi.fn().mockResolvedValue([
        {
          id: "test-id",
          name: "updated-upstream",
          providerType: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-test-key",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          priority: 0,
          weight: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: mockReturning,
          }),
        }),
      } as unknown as MockUpdateChain);

      const result = await updateUpstream("test-id", { name: "updated-upstream" });

      expect(result.lastUsedAt).toEqual(lastUsedAt);
    });

    it("should normalize route capabilities when updating upstream", async () => {
      const { updateUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce({
        id: "test-id",
        name: "test-upstream",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted:sk-test-key",
      } as unknown as PartialUpstream);

      const mockReturning = vi.fn().mockResolvedValue([
        {
          id: "test-id",
          name: "test-upstream",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-test-key",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          priority: 0,
          weight: 1,
          routeCapabilities: ["openai_chat_compatible"],
          allowedModels: null,
          modelRedirects: null,
          affinityMigration: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      const set = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: mockReturning,
        }),
      });
      vi.mocked(db.update).mockReturnValue({
        set,
      } as unknown as MockUpdateChain);

      const result = await updateUpstream("test-id", {
        routeCapabilities: [
          " openai_chat_compatible ",
          "openai_chat_compatible",
          "invalid_capability",
          "",
        ],
      } as unknown as UpstreamUpdateInput);

      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          routeCapabilities: ["openai_chat_compatible"],
        })
      );
      expect(result.routeCapabilities).toEqual(["openai_chat_compatible"]);
    });

    it("should preserve existing alias rules when only allowed models are updated", async () => {
      const { updateUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce({
        id: "test-id",
        name: "test-upstream",
        baseUrl: "https://api.openai.com/v1",
        apiKeyEncrypted: "encrypted:sk-test-key",
        routeCapabilities: ["openai_chat_compatible"],
        modelRules: [
          {
            type: "regex",
            value: "^gpt-4.*$",
            targetModel: null,
            source: "manual",
            displayLabel: "模式匹配",
          },
          {
            type: "alias",
            value: "gpt-4.1-preview",
            targetModel: "gpt-4.1",
            source: "manual",
            displayLabel: "模型别名",
          },
        ],
      } as unknown as PartialUpstream);

      const set = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "test-id",
              name: "test-upstream",
              baseUrl: "https://api.openai.com/v1",
              apiKeyEncrypted: "encrypted:sk-test-key",
              isDefault: false,
              timeout: 60,
              isActive: true,
              config: null,
              priority: 0,
              weight: 1,
              routeCapabilities: ["openai_chat_compatible"],
              allowedModels: ["gpt-4.1", "gpt-4.1-mini"],
              modelRedirects: { "gpt-4.1-preview": "gpt-4.1" },
              modelDiscovery: null,
              modelCatalog: null,
              modelCatalogUpdatedAt: null,
              modelCatalogLastStatus: null,
              modelCatalogLastError: null,
              modelCatalogLastFailedAt: null,
              modelRules: [
                {
                  type: "regex",
                  value: "^gpt-4.*$",
                  targetModel: null,
                  source: "manual",
                  displayLabel: "模式匹配",
                },
                {
                  type: "exact",
                  value: "gpt-4.1",
                  targetModel: null,
                  source: "manual",
                  displayLabel: "精确匹配",
                },
                {
                  type: "exact",
                  value: "gpt-4.1-mini",
                  targetModel: null,
                  source: "manual",
                  displayLabel: "精确匹配",
                },
                {
                  type: "alias",
                  value: "gpt-4.1-preview",
                  targetModel: "gpt-4.1",
                  source: "manual",
                  displayLabel: "模型别名",
                },
              ],
              affinityMigration: null,
              billingInputMultiplier: 1,
              billingOutputMultiplier: 1,
              spendingRules: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        }),
      });

      vi.mocked(db.update).mockReturnValue({
        set,
      } as unknown as MockUpdateChain);

      await updateUpstream("test-id", {
        allowedModels: ["gpt-4.1", "gpt-4.1-mini"],
      });

      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedModels: ["gpt-4.1", "gpt-4.1-mini"],
          modelRedirects: { "gpt-4.1-preview": "gpt-4.1" },
          modelRules: [
            {
              type: "regex",
              value: "^gpt-4.*$",
              targetModel: null,
              source: "manual",
              displayLabel: "模式匹配",
            },
            {
              type: "exact",
              value: "gpt-4.1",
              targetModel: null,
              source: "manual",
              displayLabel: "精确匹配",
            },
            {
              type: "exact",
              value: "gpt-4.1-mini",
              targetModel: null,
              source: "manual",
              displayLabel: "精确匹配",
            },
            {
              type: "alias",
              value: "gpt-4.1-preview",
              targetModel: "gpt-4.1",
              source: "manual",
              displayLabel: "模型别名",
            },
          ],
        })
      );
    });

    it("should preserve existing exact rules when only redirects are updated", async () => {
      const { updateUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce({
        id: "test-id",
        name: "test-upstream",
        baseUrl: "https://api.openai.com/v1",
        apiKeyEncrypted: "encrypted:sk-test-key",
        routeCapabilities: ["openai_chat_compatible"],
        modelRules: [
          {
            type: "regex",
            value: "^gpt-4.*$",
            targetModel: null,
            source: "manual",
            displayLabel: "模式匹配",
          },
          {
            type: "exact",
            value: "gpt-4.1",
            targetModel: null,
            source: "manual",
            displayLabel: "精确匹配",
          },
        ],
      } as unknown as PartialUpstream);

      const set = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "test-id",
              name: "test-upstream",
              baseUrl: "https://api.openai.com/v1",
              apiKeyEncrypted: "encrypted:sk-test-key",
              isDefault: false,
              timeout: 60,
              isActive: true,
              config: null,
              priority: 0,
              weight: 1,
              routeCapabilities: ["openai_chat_compatible"],
              allowedModels: ["gpt-4.1"],
              modelRedirects: { "gpt-4.1-preview": "gpt-4.1" },
              modelDiscovery: null,
              modelCatalog: null,
              modelCatalogUpdatedAt: null,
              modelCatalogLastStatus: null,
              modelCatalogLastError: null,
              modelCatalogLastFailedAt: null,
              modelRules: [
                {
                  type: "regex",
                  value: "^gpt-4.*$",
                  targetModel: null,
                  source: "manual",
                  displayLabel: "模式匹配",
                },
                {
                  type: "exact",
                  value: "gpt-4.1",
                  targetModel: null,
                  source: "manual",
                  displayLabel: "精确匹配",
                },
                {
                  type: "alias",
                  value: "gpt-4.1-preview",
                  targetModel: "gpt-4.1",
                  source: "manual",
                  displayLabel: "模型别名",
                },
              ],
              affinityMigration: null,
              billingInputMultiplier: 1,
              billingOutputMultiplier: 1,
              spendingRules: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        }),
      });

      vi.mocked(db.update).mockReturnValue({
        set,
      } as unknown as MockUpdateChain);

      await updateUpstream("test-id", {
        modelRedirects: { "gpt-4.1-preview": "gpt-4.1" },
      });

      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          allowedModels: ["gpt-4.1"],
          modelRedirects: { "gpt-4.1-preview": "gpt-4.1" },
          modelRules: [
            {
              type: "regex",
              value: "^gpt-4.*$",
              targetModel: null,
              source: "manual",
              displayLabel: "模式匹配",
            },
            {
              type: "exact",
              value: "gpt-4.1",
              targetModel: null,
              source: "manual",
              displayLabel: "精确匹配",
            },
            {
              type: "alias",
              value: "gpt-4.1-preview",
              targetModel: "gpt-4.1",
              source: "manual",
              displayLabel: "模型别名",
            },
          ],
        })
      );
    });

    it("should reject invalid merged model rules during update", async () => {
      const { updateUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce({
        id: "test-id",
        name: "test-upstream",
        baseUrl: "https://api.openai.com/v1",
        apiKeyEncrypted: "encrypted:sk-test-key",
        routeCapabilities: ["openai_chat_compatible"],
        modelRules: [
          {
            type: "regex",
            value: "(",
            targetModel: null,
            source: "manual",
            displayLabel: "模式匹配",
          },
        ],
      } as unknown as PartialUpstream);

      await expect(
        updateUpstream("test-id", {
          allowedModels: ["gpt-4.1"],
        })
      ).rejects.toThrow(InvalidUpstreamModelRulesError);

      expect(db.update).not.toHaveBeenCalled();
    });

    it("should throw UpstreamNotFoundError if upstream does not exist", async () => {
      const { updateUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      await expect(updateUpstream("nonexistent-id", { name: "new-name" })).rejects.toThrow(
        UpstreamNotFoundError
      );
    });

    it("should throw error if new name already exists", async () => {
      const { updateUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst)
        .mockResolvedValueOnce({
          id: "test-id",
          name: "test-upstream",
        } as unknown as PartialUpstream)
        .mockResolvedValueOnce({
          id: "other-id",
          name: "existing-name",
        } as unknown as PartialUpstream);

      await expect(updateUpstream("test-id", { name: "existing-name" })).rejects.toThrow(
        "Upstream with name 'existing-name' already exists"
      );
    });
  });

  describe("deleteUpstream", () => {
    it("should delete upstream", async () => {
      const { deleteUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue({
        id: "test-id",
        name: "test-upstream",
      } as unknown as PartialUpstream);

      const mockWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.delete).mockReturnValue({
        where: mockWhere,
      } as unknown as MockDeleteChain);

      await deleteUpstream("test-id");

      expect(mockWhere).toHaveBeenCalled();
    });

    it("should throw UpstreamNotFoundError if upstream does not exist", async () => {
      const { deleteUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      await expect(deleteUpstream("nonexistent-id")).rejects.toThrow(UpstreamNotFoundError);
    });
  });

  describe("listUpstreams", () => {
    it("should list upstreams with pagination", async () => {
      const { listUpstreams } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.select).mockImplementation((selection?: Record<string, unknown>) => {
        if (selection && "value" in selection) {
          return {
            from: vi.fn().mockResolvedValue([{ value: 2 }]),
          } as unknown as MockSelectChain;
        }

        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              groupBy: vi.fn().mockResolvedValue([]),
            })),
          })),
        } as unknown as MockSelectChain;
      });

      vi.mocked(db.query.upstreams.findMany).mockResolvedValue([
        {
          id: "id-1",
          name: "upstream-1",
          providerType: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-key-1",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          priority: 0,
          weight: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "id-2",
          name: "upstream-2",
          providerType: "anthropic",
          baseUrl: "https://api.anthropic.com",
          apiKeyEncrypted: "encrypted:sk-key-2",
          isDefault: true,
          timeout: 60,
          isActive: true,
          config: null,
          priority: 5,
          weight: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as unknown as PartialUpstream[]);

      const result = await listUpstreams(1, 20);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(1);
      expect(result.items[0].priority).toBe(0);
      expect(result.items[1].priority).toBe(5);
    });

    it("should skip last-used aggregation query when current page has no upstreams", async () => {
      const { listUpstreams } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.select).mockImplementation((selection?: Record<string, unknown>) => {
        if (selection && "value" in selection) {
          return {
            from: vi.fn().mockResolvedValue([{ value: 0 }]),
          } as unknown as MockSelectChain;
        }

        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              groupBy: vi.fn().mockResolvedValue([]),
            })),
          })),
        } as unknown as MockSelectChain;
      });

      vi.mocked(db.query.upstreams.findMany).mockResolvedValue([]);

      const result = await listUpstreams(1, 20);

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(1);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it("should include last_used_at from request log aggregation", async () => {
      const { listUpstreams } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");
      const lastUsedAt = new Date("2026-03-01T10:00:00.000Z");

      vi.mocked(db.select).mockImplementation((selection?: Record<string, unknown>) => {
        if (selection && "value" in selection) {
          return {
            from: vi.fn().mockResolvedValue([{ value: 1 }]),
          } as unknown as MockSelectChain;
        }

        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              groupBy: vi.fn().mockResolvedValue([
                { upstreamId: null, lastUsedAt: new Date("2026-03-01T09:00:00.000Z") },
                { upstreamId: "id-1", lastUsedAt },
              ]),
            })),
          })),
        } as unknown as MockSelectChain;
      });

      vi.mocked(db.query.upstreams.findMany).mockResolvedValue([
        {
          id: "id-1",
          name: "upstream-1",
          providerType: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-key-1",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          priority: 0,
          weight: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as unknown as PartialUpstream[]);

      const result = await listUpstreams(1, 20);

      expect(result.items[0].lastUsedAt).toEqual(lastUsedAt);
    });

    it("should handle decryption errors gracefully", async () => {
      const { listUpstreams } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");
      const { decrypt } = await import("@/lib/utils/encryption");

      vi.mocked(db.select).mockImplementation((selection?: Record<string, unknown>) => {
        if (selection && "value" in selection) {
          return {
            from: vi.fn().mockResolvedValue([{ value: 1 }]),
          } as unknown as MockSelectChain;
        }

        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              groupBy: vi.fn().mockResolvedValue([]),
            })),
          })),
        } as unknown as MockSelectChain;
      });

      vi.mocked(db.query.upstreams.findMany).mockResolvedValue([
        {
          id: "id-1",
          name: "upstream-1",
          providerType: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "invalid-encrypted",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          priority: 0,
          weight: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as unknown as PartialUpstream[]);

      vi.mocked(decrypt).mockImplementation(() => {
        throw new Error("Decryption failed");
      });

      const result = await listUpstreams(1, 20);

      expect(result.items[0].apiKeyMasked).toBe("***error***");
    });
  });

  describe("getUpstreamById", () => {
    it("should return upstream by id", async () => {
      const { getUpstreamById } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");
      const { decrypt } = await import("@/lib/utils/encryption");

      vi.mocked(decrypt).mockImplementation((value: string) => value.replace("encrypted:", ""));

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue({
        id: "test-id",
        name: "test-upstream",
        providerType: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted:sk-test-key",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        priority: 3,
        weight: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as PartialUpstream);

      const result = await getUpstreamById("test-id");

      expect(result).not.toBeNull();
      expect(result?.name).toBe("test-upstream");
      expect(result?.apiKeyMasked).toBe("sk-***-key");
      expect(result?.priority).toBe(3);
      expect(result?.weight).toBe(3);
    });

    it("should return null if upstream not found", async () => {
      const { getUpstreamById } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      const result = await getUpstreamById("nonexistent-id");

      expect(result).toBeNull();
    });
  });

  describe("refreshUpstreamCatalog", () => {
    it("should refresh catalog metadata and persist the refreshed fields", async () => {
      const discoveryModule = await import("@/lib/services/upstream-model-discovery");
      vi.spyOn(discoveryModule, "refreshUpstreamModelCatalog").mockResolvedValue({
        modelDiscovery: {
          mode: "openai_compatible",
          customEndpoint: null,
          enableLiteLlmFallback: false,
        },
        modelCatalog: [{ model: "gpt-4.1", source: "native" }],
        modelCatalogUpdatedAt: new Date("2026-04-18T08:00:00.000Z"),
        modelCatalogLastStatus: "success",
        modelCatalogLastError: null,
        modelCatalogLastFailedAt: null,
      });

      const { refreshUpstreamCatalog } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst)
        .mockResolvedValueOnce({
          id: "test-id",
          name: "test-upstream",
          baseUrl: "https://api.openai.com/v1",
          apiKeyEncrypted: "encrypted:sk-test-key",
          timeout: 60,
          routeCapabilities: ["openai_chat_compatible"],
          modelDiscovery: null,
          modelCatalog: null,
        } as unknown as PartialUpstream)
        .mockResolvedValueOnce({
          id: "test-id",
          name: "test-upstream",
          baseUrl: "https://api.openai.com/v1",
          apiKeyEncrypted: "encrypted:sk-test-key",
          timeout: 60,
          isDefault: false,
          isActive: true,
          config: null,
          priority: 0,
          weight: 1,
          routeCapabilities: ["openai_chat_compatible"],
          modelDiscovery: null,
          modelCatalog: null,
          modelRules: null,
          allowedModels: null,
          modelRedirects: null,
          affinityMigration: null,
          billingInputMultiplier: 1,
          billingOutputMultiplier: 1,
          spendingRules: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as PartialUpstream);

      const set = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "test-id",
              name: "test-upstream",
              baseUrl: "https://api.openai.com/v1",
              apiKeyEncrypted: "encrypted:sk-test-key",
              timeout: 60,
              isDefault: false,
              isActive: true,
              config: null,
              priority: 0,
              weight: 1,
              routeCapabilities: ["openai_chat_compatible"],
              modelDiscovery: {
                mode: "openai_compatible",
                customEndpoint: null,
                enableLiteLlmFallback: false,
              },
              modelCatalog: [{ model: "gpt-4.1", source: "native" }],
              modelCatalogUpdatedAt: new Date("2026-04-18T08:00:00.000Z"),
              modelCatalogLastStatus: "success",
              modelCatalogLastError: null,
              modelCatalogLastFailedAt: null,
              modelRules: null,
              allowedModels: null,
              modelRedirects: null,
              affinityMigration: null,
              billingInputMultiplier: 1,
              billingOutputMultiplier: 1,
              spendingRules: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        }),
      });
      vi.mocked(db.update).mockReturnValue({
        set,
      } as unknown as MockUpdateChain);

      const result = await refreshUpstreamCatalog("test-id");

      expect(discoveryModule.refreshUpstreamModelCatalog).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "sk-test-key",
          timeoutMs: 60000,
        })
      );
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          modelCatalog: [{ model: "gpt-4.1", source: "native" }],
          modelCatalogLastStatus: "success",
        })
      );
      expect(result.modelCatalog).toEqual([{ model: "gpt-4.1", source: "native" }]);
    });

    it("should throw when refreshing a missing upstream catalog", async () => {
      const { refreshUpstreamCatalog } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      await expect(refreshUpstreamCatalog("missing-id")).rejects.toThrow(UpstreamNotFoundError);
    });
  });

  describe("importUpstreamCatalogModels", () => {
    it("should import selected catalog entries into unified model rules", async () => {
      const { importUpstreamCatalogModels } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst)
        .mockResolvedValueOnce({
          id: "test-id",
          name: "test-upstream",
          baseUrl: "https://api.openai.com/v1",
          apiKeyEncrypted: "encrypted:sk-test-key",
          timeout: 60,
          routeCapabilities: ["openai_chat_compatible"],
          modelCatalog: [{ model: "gpt-4.1", source: "native" }],
          modelRules: [
            {
              type: "alias",
              value: "gpt-4.1-preview",
              targetModel: "gpt-4.1",
              source: "manual",
              displayLabel: "模型别名",
            },
          ],
        } as unknown as PartialUpstream)
        .mockResolvedValueOnce({
          id: "test-id",
          name: "test-upstream",
          baseUrl: "https://api.openai.com/v1",
          apiKeyEncrypted: "encrypted:sk-test-key",
          timeout: 60,
          isDefault: false,
          isActive: true,
          config: null,
          priority: 0,
          weight: 1,
          routeCapabilities: ["openai_chat_compatible"],
          modelDiscovery: null,
          modelCatalog: [{ model: "gpt-4.1", source: "native" }],
          modelCatalogUpdatedAt: null,
          modelCatalogLastStatus: null,
          modelCatalogLastError: null,
          modelCatalogLastFailedAt: null,
          modelRules: [
            {
              type: "alias",
              value: "gpt-4.1-preview",
              targetModel: "gpt-4.1",
              source: "manual",
              displayLabel: "模型别名",
            },
          ],
          allowedModels: null,
          modelRedirects: { "gpt-4.1-preview": "gpt-4.1" },
          affinityMigration: null,
          billingInputMultiplier: 1,
          billingOutputMultiplier: 1,
          spendingRules: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as unknown as PartialUpstream);

      const set = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "test-id",
              name: "test-upstream",
              baseUrl: "https://api.openai.com/v1",
              apiKeyEncrypted: "encrypted:sk-test-key",
              timeout: 60,
              isDefault: false,
              isActive: true,
              config: null,
              priority: 0,
              weight: 1,
              routeCapabilities: ["openai_chat_compatible"],
              modelDiscovery: null,
              modelCatalog: [{ model: "gpt-4.1", source: "native" }],
              modelCatalogUpdatedAt: null,
              modelCatalogLastStatus: null,
              modelCatalogLastError: null,
              modelCatalogLastFailedAt: null,
              modelRules: [
                {
                  type: "alias",
                  value: "gpt-4.1-preview",
                  targetModel: "gpt-4.1",
                  source: "manual",
                  displayLabel: "模型别名",
                },
                {
                  type: "exact",
                  value: "gpt-4.1",
                  targetModel: null,
                  source: "native",
                  displayLabel: "精确匹配",
                },
              ],
              allowedModels: ["gpt-4.1"],
              modelRedirects: { "gpt-4.1-preview": "gpt-4.1" },
              affinityMigration: null,
              billingInputMultiplier: 1,
              billingOutputMultiplier: 1,
              spendingRules: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        }),
      });
      vi.mocked(db.update).mockReturnValue({
        set,
      } as unknown as MockUpdateChain);

      const result = await importUpstreamCatalogModels("test-id", ["gpt-4.1"]);

      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({
          modelRules: [
            {
              type: "alias",
              value: "gpt-4.1-preview",
              targetModel: "gpt-4.1",
              source: "manual",
              displayLabel: "模型别名",
            },
            {
              type: "exact",
              value: "gpt-4.1",
              targetModel: null,
              source: "native",
              displayLabel: "精确匹配",
            },
          ],
        })
      );
      expect(result.modelRules).toHaveLength(2);
    });

    it("should throw when importing models for a missing upstream", async () => {
      const { importUpstreamCatalogModels } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      await expect(importUpstreamCatalogModels("missing-id", ["gpt-4.1"])).rejects.toThrow(
        UpstreamNotFoundError
      );
    });
  });

  describe("loadActiveUpstreams", () => {
    it("should load active upstreams", async () => {
      const { loadActiveUpstreams } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findMany).mockResolvedValue([
        { id: "id-1", isActive: true },
        { id: "id-2", isActive: true },
      ] as unknown as PartialUpstream[]);

      const result = await loadActiveUpstreams();

      expect(result).toHaveLength(2);
    });
  });

  describe("getDefaultUpstream", () => {
    it("should return default upstream", async () => {
      const { getDefaultUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue({
        id: "default-id",
        isDefault: true,
      } as unknown as PartialUpstream);

      const result = await getDefaultUpstream();

      expect(result).not.toBeNull();
      expect(result?.id).toBe("default-id");
    });

    it("should return null if no default upstream", async () => {
      const { getDefaultUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      const result = await getDefaultUpstream();

      expect(result).toBeNull();
    });
  });

  describe("getUpstreamByName", () => {
    it("should return upstream by name", async () => {
      const { getUpstreamByName } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue({
        id: "test-id",
        name: "test-upstream",
      } as unknown as PartialUpstream);

      const result = await getUpstreamByName("test-upstream");

      expect(result).not.toBeNull();
      expect(result?.name).toBe("test-upstream");
    });

    it("should return null if upstream not found", async () => {
      const { getUpstreamByName } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      const result = await getUpstreamByName("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getDecryptedApiKey", () => {
    it("should decrypt API key", async () => {
      const { getDecryptedApiKey } = await import("@/lib/services/upstream-crud");
      const { decrypt } = await import("@/lib/utils/encryption");

      vi.mocked(decrypt).mockImplementation((value: string) => value.replace("encrypted:", ""));

      const upstream = {
        id: "test-id",
        apiKeyEncrypted: "encrypted:sk-test-key",
      } as unknown as PartialUpstream;

      const result = getDecryptedApiKey(upstream);

      expect(result).toBe("sk-test-key");
    });
  });

  describe("spending quota fields in CRUD", () => {
    it("should include spending fields in createUpstream response", async () => {
      const { createUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      const mockReturning = vi.fn().mockResolvedValue([
        {
          id: "test-quota",
          name: "quota-upstream",
          baseUrl: "https://api.example.com",
          apiKeyEncrypted: "encrypted:sk-key",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          priority: 0,
          weight: 1,
          providerType: null,
          allowedModels: null,
          modelRedirects: null,
          spendingRules: [{ period_type: "daily", limit: 50 }],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: mockReturning,
        }),
      } as unknown as MockInsertChain);

      const result = await createUpstream({
        name: "quota-upstream",
        baseUrl: "https://api.example.com",
        apiKey: "sk-key",
        spendingRules: [{ period_type: "daily", limit: 50 }],
      });

      expect(result.spendingRules).toEqual([{ period_type: "daily", limit: 50 }]);
    });

    it("should include spending fields in updateUpstream", async () => {
      const { updateUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst)
        .mockResolvedValueOnce({
          id: "test-quota",
          name: "quota-upstream",
        } as unknown as PartialUpstream)
        .mockResolvedValueOnce(null);

      const mockReturning = vi.fn().mockResolvedValue([
        {
          id: "test-quota",
          name: "quota-upstream",
          baseUrl: "https://api.example.com",
          apiKeyEncrypted: "encrypted:sk-key",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          priority: 0,
          weight: 1,
          providerType: null,
          allowedModels: null,
          modelRedirects: null,
          spendingRules: [{ period_type: "rolling", limit: 100, period_hours: 24 }],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: mockReturning,
          }),
        }),
      } as unknown as MockUpdateChain);

      const input: UpstreamUpdateInput = {
        spendingRules: [{ period_type: "rolling", limit: 100, period_hours: 24 }],
      };

      const result = await updateUpstream("test-quota", input);

      expect(result.spendingRules).toEqual([
        { period_type: "rolling", limit: 100, period_hours: 24 },
      ]);
    });

    it("should allow removing spending limit by setting null", async () => {
      const { updateUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockReset();
      vi.mocked(db.query.upstreams.findFirst)
        .mockResolvedValueOnce({
          id: "test-quota",
          name: "quota-upstream",
        } as unknown as PartialUpstream)
        .mockResolvedValueOnce(null);

      const mockReturning = vi.fn().mockResolvedValue([
        {
          id: "test-quota",
          name: "quota-upstream",
          baseUrl: "https://api.example.com",
          apiKeyEncrypted: "encrypted:sk-key",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          priority: 0,
          weight: 1,
          providerType: null,
          allowedModels: null,
          modelRedirects: null,
          spendingRules: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: mockReturning,
          }),
        }),
      } as unknown as MockUpdateChain);

      const input: UpstreamUpdateInput = {
        spendingRules: null,
      };

      const result = await updateUpstream("test-quota", input);

      expect(result.spendingRules).toBeNull();
    });
  });
});
