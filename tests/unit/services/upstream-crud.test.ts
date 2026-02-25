import { describe, it, expect, vi, beforeEach } from "vitest";
import { maskApiKey, UpstreamNotFoundError } from "@/lib/services/upstream-crud";

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
      circuitBreakerStates: {
        findMany: vi.fn(() => Promise.resolve([])),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => Promise.resolve([{ value: 0 }])),
    })),
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
}));

vi.mock("@/lib/utils/encryption", () => ({
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  decrypt: vi.fn((value: string) => value.replace("encrypted:", "")),
}));

describe("upstream-crud", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockResolvedValue([{ value: 2 }]),
      } as unknown as MockSelectChain);

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

    it("should handle decryption errors gracefully", async () => {
      const { listUpstreams } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");
      const { decrypt } = await import("@/lib/utils/encryption");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockResolvedValue([{ value: 1 }]),
      } as unknown as MockSelectChain);

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
});
