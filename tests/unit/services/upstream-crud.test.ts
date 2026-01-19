import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  maskApiKey,
  UpstreamNotFoundError,
  UpstreamGroupNotFoundError,
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

type PartialUpstreamGroup = {
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
      upstreamGroups: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => Promise.resolve([{ value: 0 }])),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
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
  upstreamGroups: {},
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

  describe("UpstreamGroupNotFoundError", () => {
    it("should have correct name", () => {
      const error = new UpstreamGroupNotFoundError("upstream group not found");
      expect(error.name).toBe("UpstreamGroupNotFoundError");
    });

    it("should have correct message", () => {
      const error = new UpstreamGroupNotFoundError("Upstream group not found: test-id");
      expect(error.message).toBe("Upstream group not found: test-id");
    });

    it("should be instanceof Error", () => {
      const error = new UpstreamGroupNotFoundError("test");
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
          provider: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-test-key",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          groupId: null,
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
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-test-key",
      });

      expect(encrypt).toHaveBeenCalledWith("sk-test-key");
      expect(result.name).toBe("test-upstream");
      expect(result.apiKeyMasked).toBe("sk-***-key");
      expect(result.groupId).toBeNull();
      expect(result.weight).toBe(1);
    });

    it("should create upstream with groupId and weight", async () => {
      const { createUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);
      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue({
        id: "group-id",
        name: "test-group",
      } as unknown as PartialUpstreamGroup);

      const mockReturning = vi.fn().mockResolvedValue([
        {
          id: "test-id",
          name: "test-upstream",
          provider: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-test-key",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          groupId: "group-id",
          weight: 5,
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
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-test-key",
        groupId: "group-id",
        weight: 5,
      });

      expect(result.groupId).toBe("group-id");
      expect(result.weight).toBe(5);
      expect(result.groupName).toBe("test-group");
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
          provider: "openai",
          baseUrl: "https://api.openai.com",
          apiKey: "sk-test-key",
        })
      ).rejects.toThrow("Upstream with name 'test-upstream' already exists");
    });

    it("should throw UpstreamGroupNotFoundError if groupId is invalid", async () => {
      const { createUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);
      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(null);

      await expect(
        createUpstream({
          name: "test-upstream",
          provider: "openai",
          baseUrl: "https://api.openai.com",
          apiKey: "sk-test-key",
          groupId: "invalid-group-id",
        })
      ).rejects.toThrow(UpstreamGroupNotFoundError);
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
          provider: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-test-key",
        } as unknown as PartialUpstream)
        .mockResolvedValueOnce(null);

      const mockReturning = vi.fn().mockResolvedValue([
        {
          id: "test-id",
          name: "updated-upstream",
          provider: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-test-key",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          groupId: null,
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

    it("should update upstream with groupId and weight", async () => {
      const { updateUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce({
        id: "test-id",
        name: "test-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted:sk-test-key",
        groupId: null,
        weight: 1,
      } as unknown as PartialUpstream);

      vi.mocked(db.query.upstreamGroups.findFirst)
        .mockResolvedValueOnce({
          id: "group-id",
          name: "test-group",
        } as unknown as PartialUpstreamGroup)
        .mockResolvedValueOnce({
          id: "group-id",
          name: "test-group",
        } as unknown as PartialUpstreamGroup);

      const mockReturning = vi.fn().mockResolvedValue([
        {
          id: "test-id",
          name: "test-upstream",
          provider: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-test-key",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          groupId: "group-id",
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

      const result = await updateUpstream("test-id", { groupId: "group-id", weight: 10 });

      expect(result.groupId).toBe("group-id");
      expect(result.weight).toBe(10);
      expect(result.groupName).toBe("test-group");
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

    it("should throw UpstreamGroupNotFoundError if groupId is invalid", async () => {
      const { updateUpstream } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce({
        id: "test-id",
        name: "test-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted:sk-test-key",
      } as unknown as PartialUpstream);

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(null);

      await expect(updateUpstream("test-id", { groupId: "invalid-group-id" })).rejects.toThrow(
        UpstreamGroupNotFoundError
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
          provider: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-key-1",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          groupId: null,
          weight: 1,
          group: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "id-2",
          name: "upstream-2",
          provider: "anthropic",
          baseUrl: "https://api.anthropic.com",
          apiKeyEncrypted: "encrypted:sk-key-2",
          isDefault: true,
          timeout: 60,
          isActive: true,
          config: null,
          groupId: "group-id",
          weight: 5,
          group: { id: "group-id", name: "test-group" },
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
      expect(result.items[0].groupId).toBeNull();
      expect(result.items[0].groupName).toBeNull();
      expect(result.items[1].groupId).toBe("group-id");
      expect(result.items[1].groupName).toBe("test-group");
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
          provider: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "invalid-encrypted",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          groupId: null,
          weight: 1,
          group: null,
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
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted:sk-test-key",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        groupId: "group-id",
        weight: 3,
        group: { id: "group-id", name: "test-group" },
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as PartialUpstream);

      const result = await getUpstreamById("test-id");

      expect(result).not.toBeNull();
      expect(result?.name).toBe("test-upstream");
      expect(result?.apiKeyMasked).toBe("sk-***-key");
      expect(result?.groupId).toBe("group-id");
      expect(result?.weight).toBe(3);
      expect(result?.groupName).toBe("test-group");
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

  // ========================================
  // Upstream Group CRUD Tests
  // ========================================

  describe("createUpstreamGroup", () => {
    it("should create upstream group with default values", async () => {
      const { createUpstreamGroup } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(null);

      const mockReturning = vi.fn().mockResolvedValue([
        {
          id: "group-id",
          name: "test-group",
          provider: "openai",
          strategy: "round_robin",
          healthCheckInterval: 30,
          healthCheckTimeout: 10,
          isActive: true,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: mockReturning,
        }),
      } as unknown as MockInsertChain);

      const result = await createUpstreamGroup({
        name: "test-group",
        provider: "openai",
      });

      expect(result.name).toBe("test-group");
      expect(result.provider).toBe("openai");
      expect(result.strategy).toBe("round_robin");
      expect(result.healthCheckInterval).toBe(30);
      expect(result.healthCheckTimeout).toBe(10);
      expect(result.isActive).toBe(true);
    });

    it("should create upstream group with custom values", async () => {
      const { createUpstreamGroup } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(null);

      const mockReturning = vi.fn().mockResolvedValue([
        {
          id: "group-id",
          name: "weighted-group",
          provider: "anthropic",
          strategy: "weighted",
          healthCheckInterval: 60,
          healthCheckTimeout: 15,
          isActive: true,
          config: '{"failoverRetries":3}',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: mockReturning,
        }),
      } as unknown as MockInsertChain);

      const result = await createUpstreamGroup({
        name: "weighted-group",
        provider: "anthropic",
        strategy: "weighted",
        healthCheckInterval: 60,
        healthCheckTimeout: 15,
        config: '{"failoverRetries":3}',
      });

      expect(result.name).toBe("weighted-group");
      expect(result.strategy).toBe("weighted");
      expect(result.healthCheckInterval).toBe(60);
      expect(result.healthCheckTimeout).toBe(15);
      expect(result.config).toBe('{"failoverRetries":3}');
    });

    it("should throw error if group name already exists", async () => {
      const { createUpstreamGroup } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue({
        id: "existing-id",
        name: "test-group",
      } as unknown as PartialUpstreamGroup);

      await expect(
        createUpstreamGroup({
          name: "test-group",
          provider: "openai",
        })
      ).rejects.toThrow("Upstream group with name 'test-group' already exists");
    });
  });

  describe("updateUpstreamGroup", () => {
    it("should update upstream group", async () => {
      const { updateUpstreamGroup } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst)
        .mockResolvedValueOnce({
          id: "group-id",
          name: "test-group",
          provider: "openai",
          strategy: "round_robin",
        } as unknown as PartialUpstreamGroup)
        .mockResolvedValueOnce(null);

      const mockReturning = vi.fn().mockResolvedValue([
        {
          id: "group-id",
          name: "updated-group",
          provider: "openai",
          strategy: "weighted",
          healthCheckInterval: 30,
          healthCheckTimeout: 10,
          isActive: true,
          config: null,
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

      const result = await updateUpstreamGroup("group-id", {
        name: "updated-group",
        strategy: "weighted",
      });

      expect(result.name).toBe("updated-group");
      expect(result.strategy).toBe("weighted");
    });

    it("should throw UpstreamGroupNotFoundError if group does not exist", async () => {
      const { updateUpstreamGroup } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(null);

      await expect(
        updateUpstreamGroup("nonexistent-id", { name: "new-name" })
      ).rejects.toThrow(UpstreamGroupNotFoundError);
    });

    it("should throw error if new name already exists", async () => {
      const { updateUpstreamGroup } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst)
        .mockResolvedValueOnce({
          id: "group-id",
          name: "test-group",
        } as unknown as PartialUpstreamGroup)
        .mockResolvedValueOnce({
          id: "other-group-id",
          name: "existing-name",
        } as unknown as PartialUpstreamGroup);

      await expect(
        updateUpstreamGroup("group-id", { name: "existing-name" })
      ).rejects.toThrow("Upstream group with name 'existing-name' already exists");
    });
  });

  describe("deleteUpstreamGroup", () => {
    it("should delete upstream group", async () => {
      const { deleteUpstreamGroup } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue({
        id: "group-id",
        name: "test-group",
      } as unknown as PartialUpstreamGroup);

      const mockWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.delete).mockReturnValue({
        where: mockWhere,
      } as unknown as MockDeleteChain);

      await deleteUpstreamGroup("group-id");

      expect(mockWhere).toHaveBeenCalled();
    });

    it("should throw UpstreamGroupNotFoundError if group does not exist", async () => {
      const { deleteUpstreamGroup } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(null);

      await expect(deleteUpstreamGroup("nonexistent-id")).rejects.toThrow(
        UpstreamGroupNotFoundError
      );
    });
  });

  describe("listUpstreamGroups", () => {
    it("should list upstream groups with pagination", async () => {
      const { listUpstreamGroups } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockResolvedValue([{ value: 2 }]),
      } as unknown as MockSelectChain);

      vi.mocked(db.query.upstreamGroups.findMany).mockResolvedValue([
        {
          id: "group-1",
          name: "openai-group",
          provider: "openai",
          strategy: "round_robin",
          healthCheckInterval: 30,
          healthCheckTimeout: 10,
          isActive: true,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "group-2",
          name: "anthropic-group",
          provider: "anthropic",
          strategy: "weighted",
          healthCheckInterval: 60,
          healthCheckTimeout: 15,
          isActive: true,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as unknown as PartialUpstreamGroup[]);

      const result = await listUpstreamGroups(1, 20);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(1);
      expect(result.items[0].name).toBe("openai-group");
      expect(result.items[1].name).toBe("anthropic-group");
    });
  });

  describe("getUpstreamGroupById", () => {
    it("should return upstream group by id", async () => {
      const { getUpstreamGroupById } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue({
        id: "group-id",
        name: "test-group",
        provider: "openai",
        strategy: "round_robin",
        healthCheckInterval: 30,
        healthCheckTimeout: 10,
        isActive: true,
        config: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as unknown as PartialUpstreamGroup);

      const result = await getUpstreamGroupById("group-id");

      expect(result).not.toBeNull();
      expect(result?.name).toBe("test-group");
      expect(result?.strategy).toBe("round_robin");
    });

    it("should return null if group not found", async () => {
      const { getUpstreamGroupById } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(null);

      const result = await getUpstreamGroupById("nonexistent-id");

      expect(result).toBeNull();
    });
  });

  describe("getUpstreamGroupByName", () => {
    it("should return upstream group by name", async () => {
      const { getUpstreamGroupByName } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue({
        id: "group-id",
        name: "test-group",
        provider: "openai",
      } as unknown as PartialUpstreamGroup);

      const result = await getUpstreamGroupByName("test-group");

      expect(result).not.toBeNull();
      expect(result?.name).toBe("test-group");
    });

    it("should return null if group not found", async () => {
      const { getUpstreamGroupByName } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(null);

      const result = await getUpstreamGroupByName("nonexistent");

      expect(result).toBeNull();
    });
  });

  // ========================================
  // Group Membership Tests
  // ========================================

  describe("addUpstreamToGroup", () => {
    it("should add upstream to group with default weight", async () => {
      const { addUpstreamToGroup } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");
      const { decrypt } = await import("@/lib/utils/encryption");

      vi.mocked(decrypt).mockImplementation((value: string) => value.replace("encrypted:", ""));

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue({
        id: "upstream-id",
        name: "test-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted:sk-test-key",
      } as unknown as PartialUpstream);

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue({
        id: "group-id",
        name: "test-group",
      } as unknown as PartialUpstreamGroup);

      const mockReturning = vi.fn().mockResolvedValue([
        {
          id: "upstream-id",
          name: "test-upstream",
          provider: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-test-key",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          groupId: "group-id",
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

      const result = await addUpstreamToGroup("upstream-id", "group-id");

      expect(result.groupId).toBe("group-id");
      expect(result.weight).toBe(1);
      expect(result.groupName).toBe("test-group");
    });

    it("should add upstream to group with custom weight", async () => {
      const { addUpstreamToGroup } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");
      const { decrypt } = await import("@/lib/utils/encryption");

      vi.mocked(decrypt).mockImplementation((value: string) => value.replace("encrypted:", ""));

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue({
        id: "upstream-id",
        name: "test-upstream",
      } as unknown as PartialUpstream);

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue({
        id: "group-id",
        name: "test-group",
      } as unknown as PartialUpstreamGroup);

      const mockReturning = vi.fn().mockResolvedValue([
        {
          id: "upstream-id",
          name: "test-upstream",
          provider: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-test-key",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          groupId: "group-id",
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

      const result = await addUpstreamToGroup("upstream-id", "group-id", 10);

      expect(result.weight).toBe(10);
    });

    it("should throw UpstreamNotFoundError if upstream does not exist", async () => {
      const { addUpstreamToGroup } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      await expect(addUpstreamToGroup("nonexistent-id", "group-id")).rejects.toThrow(
        UpstreamNotFoundError
      );
    });

    it("should throw UpstreamGroupNotFoundError if group does not exist", async () => {
      const { addUpstreamToGroup } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue({
        id: "upstream-id",
        name: "test-upstream",
      } as unknown as PartialUpstream);

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(null);

      await expect(addUpstreamToGroup("upstream-id", "nonexistent-group")).rejects.toThrow(
        UpstreamGroupNotFoundError
      );
    });
  });

  describe("removeUpstreamFromGroup", () => {
    it("should remove upstream from group", async () => {
      const { removeUpstreamFromGroup } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");
      const { decrypt } = await import("@/lib/utils/encryption");

      vi.mocked(decrypt).mockImplementation((value: string) => value.replace("encrypted:", ""));

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue({
        id: "upstream-id",
        name: "test-upstream",
        groupId: "group-id",
        weight: 5,
      } as unknown as PartialUpstream);

      const mockReturning = vi.fn().mockResolvedValue([
        {
          id: "upstream-id",
          name: "test-upstream",
          provider: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-test-key",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          groupId: null,
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

      const result = await removeUpstreamFromGroup("upstream-id");

      expect(result.groupId).toBeNull();
      expect(result.weight).toBe(1);
      expect(result.groupName).toBeNull();
    });

    it("should throw UpstreamNotFoundError if upstream does not exist", async () => {
      const { removeUpstreamFromGroup } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

      await expect(removeUpstreamFromGroup("nonexistent-id")).rejects.toThrow(
        UpstreamNotFoundError
      );
    });
  });

  describe("getUpstreamsInGroup", () => {
    it("should return all upstreams in a group", async () => {
      const { getUpstreamsInGroup } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");
      const { decrypt } = await import("@/lib/utils/encryption");

      vi.mocked(decrypt).mockImplementation((value: string) => value.replace("encrypted:", ""));

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue({
        id: "group-id",
        name: "test-group",
      } as unknown as PartialUpstreamGroup);

      vi.mocked(db.query.upstreams.findMany).mockResolvedValue([
        {
          id: "upstream-1",
          name: "upstream-1",
          provider: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-key-1",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          groupId: "group-id",
          weight: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "upstream-2",
          name: "upstream-2",
          provider: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-key-2",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          groupId: "group-id",
          weight: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as unknown as PartialUpstream[]);

      const result = await getUpstreamsInGroup("group-id");

      expect(result).toHaveLength(2);
      expect(result[0].groupId).toBe("group-id");
      expect(result[0].groupName).toBe("test-group");
      expect(result[1].groupId).toBe("group-id");
      expect(result[1].groupName).toBe("test-group");
    });

    it("should throw UpstreamGroupNotFoundError if group does not exist", async () => {
      const { getUpstreamsInGroup } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreamGroups.findFirst).mockResolvedValue(null);

      await expect(getUpstreamsInGroup("nonexistent-id")).rejects.toThrow(
        UpstreamGroupNotFoundError
      );
    });
  });

  describe("getStandaloneUpstreams", () => {
    it("should return all upstreams without a group", async () => {
      const { getStandaloneUpstreams } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");
      const { decrypt } = await import("@/lib/utils/encryption");

      vi.mocked(decrypt).mockImplementation((value: string) => value.replace("encrypted:", ""));

      vi.mocked(db.query.upstreams.findMany).mockResolvedValue([
        {
          id: "upstream-1",
          name: "standalone-1",
          provider: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-key-1",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          groupId: null,
          weight: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "upstream-2",
          name: "standalone-2",
          provider: "anthropic",
          baseUrl: "https://api.anthropic.com",
          apiKeyEncrypted: "encrypted:sk-key-2",
          isDefault: true,
          timeout: 90,
          isActive: true,
          config: null,
          groupId: null,
          weight: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as unknown as PartialUpstream[]);

      const result = await getStandaloneUpstreams();

      expect(result).toHaveLength(2);
      expect(result[0].groupId).toBeNull();
      expect(result[0].groupName).toBeNull();
      expect(result[1].groupId).toBeNull();
      expect(result[1].groupName).toBeNull();
    });

    it("should return empty array if no standalone upstreams exist", async () => {
      const { getStandaloneUpstreams } = await import("@/lib/services/upstream-crud");
      const { db } = await import("@/lib/db");

      vi.mocked(db.query.upstreams.findMany).mockResolvedValue([]);

      const result = await getStandaloneUpstreams();

      expect(result).toHaveLength(0);
    });
  });
});
