import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateApiKey, ApiKeyNotFoundError, LegacyApiKeyError } from "@/lib/services/key-manager";

// Mock the database module
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      apiKeys: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      upstreams: {
        findMany: vi.fn(),
      },
      apiKeyUpstreams: {
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
    delete: vi.fn(() => ({
      where: vi.fn(),
    })),
  },
  apiKeys: { id: "id", keyPrefix: "keyPrefix", createdAt: "createdAt" },
  apiKeyUpstreams: { apiKeyId: "apiKeyId" },
  upstreams: { id: "id" },
}));

// Mock auth utilities
vi.mock("@/lib/utils/auth", () => ({
  hashApiKey: vi.fn().mockResolvedValue("hashed-key"),
  verifyApiKey: vi.fn(),
}));

// Mock encryption utilities
vi.mock("@/lib/utils/encryption", () => ({
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  decrypt: vi.fn((value: string) => value.replace("encrypted:", "")),
  EncryptionError: class EncryptionError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "EncryptionError";
    }
  },
}));

describe("key-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("generateApiKey", () => {
    it("should generate a key with sk-auto- prefix", () => {
      const key = generateApiKey();
      expect(key.startsWith("sk-auto-")).toBe(true);
    });

    it("should generate a key with base64url random part", () => {
      const key = generateApiKey();
      const randomPart = key.slice(8); // Remove 'sk-auto-'

      // base64url characters only: A-Z, a-z, 0-9, -, _
      expect(randomPart).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("should generate unique keys", () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        keys.add(generateApiKey());
      }
      expect(keys.size).toBe(100);
    });

    it("should generate keys with sufficient entropy", () => {
      const key = generateApiKey();
      // 32 bytes = 256 bits of entropy, base64url encoded = ~43 chars
      const randomPart = key.slice(8);
      expect(randomPart.length).toBeGreaterThanOrEqual(40);
    });
  });

  describe("ApiKeyNotFoundError", () => {
    it("should have correct name", () => {
      const error = new ApiKeyNotFoundError("key not found");
      expect(error.name).toBe("ApiKeyNotFoundError");
    });

    it("should have correct message", () => {
      const error = new ApiKeyNotFoundError("API key abc123 not found");
      expect(error.message).toBe("API key abc123 not found");
    });

    it("should be instanceof Error", () => {
      const error = new ApiKeyNotFoundError("test");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("LegacyApiKeyError", () => {
    it("should have correct name", () => {
      const error = new LegacyApiKeyError("legacy key");
      expect(error.name).toBe("LegacyApiKeyError");
    });

    it("should have correct message", () => {
      const error = new LegacyApiKeyError("Cannot reveal legacy key");
      expect(error.message).toBe("Cannot reveal legacy key");
    });

    it("should be instanceof Error", () => {
      const error = new LegacyApiKeyError("test");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("createApiKey", () => {
    it("should throw error when no upstreams specified", async () => {
      const { createApiKey } = await import("@/lib/services/key-manager");

      await expect(
        createApiKey({
          name: "Test Key",
          upstreamIds: [],
        })
      ).rejects.toThrow("At least one upstream must be specified");
    });

    it("should throw error when upstream IDs are invalid", async () => {
      const { db } = await import("@/lib/db");
      const { createApiKey } = await import("@/lib/services/key-manager");

      // Mock: only one upstream exists
      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
        { id: "upstream-1", name: "Valid Upstream" },
      ] as never);

      await expect(
        createApiKey({
          name: "Test Key",
          upstreamIds: ["upstream-1", "invalid-upstream-id"],
        })
      ).rejects.toThrow("Invalid upstream IDs: invalid-upstream-id");
    });

    it("should create API key successfully", async () => {
      const { db } = await import("@/lib/db");
      const { createApiKey } = await import("@/lib/services/key-manager");

      const mockApiKey = {
        id: "key-1",
        keyHash: "hashed-key",
        keyValueEncrypted: "encrypted:sk-auto-test123",
        keyPrefix: "sk-auto-test",
        name: "Test Key",
        description: "Test description",
        isActive: true,
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
        { id: "upstream-1", name: "OpenAI" },
      ] as never);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockApiKey]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const result = await createApiKey({
        name: "Test Key",
        upstreamIds: ["upstream-1"],
        description: "Test description",
      });

      expect(result.name).toBe("Test Key");
      expect(result.keyValue).toMatch(/^sk-auto-/);
      expect(result.upstreamIds).toEqual(["upstream-1"]);
    });

    it("should create API key with expiration date", async () => {
      const { db } = await import("@/lib/db");
      const { createApiKey } = await import("@/lib/services/key-manager");

      const expiresAt = new Date(Date.now() + 86400000);
      const mockApiKey = {
        id: "key-1",
        keyHash: "hashed-key",
        keyValueEncrypted: "encrypted:sk-auto-test123",
        keyPrefix: "sk-auto-test",
        name: "Expiring Key",
        description: null,
        isActive: true,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([
        { id: "upstream-1", name: "OpenAI" },
      ] as never);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockApiKey]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const result = await createApiKey({
        name: "Expiring Key",
        upstreamIds: ["upstream-1"],
        expiresAt,
      });

      expect(result.expiresAt).toEqual(expiresAt);
    });
  });

  describe("deleteApiKey", () => {
    it("should throw ApiKeyNotFoundError when key does not exist", async () => {
      const { db } = await import("@/lib/db");
      const { deleteApiKey } = await import("@/lib/services/key-manager");

      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValueOnce(undefined);

      await expect(deleteApiKey("non-existent-id")).rejects.toThrow(ApiKeyNotFoundError);
    });

    it("should delete API key successfully", async () => {
      const { db } = await import("@/lib/db");
      const { deleteApiKey } = await import("@/lib/services/key-manager");

      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValueOnce({
        id: "key-1",
        keyPrefix: "sk-auto-test",
        name: "Test Key",
      } as never);

      const mockWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.delete).mockReturnValue({
        where: mockWhere,
      } as unknown as ReturnType<typeof db.delete>);

      await expect(deleteApiKey("key-1")).resolves.toBeUndefined();
      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe("listApiKeys", () => {
    it("should return paginated results", async () => {
      const { db } = await import("@/lib/db");
      const { listApiKeys } = await import("@/lib/services/key-manager");

      const mockKeys = [
        {
          id: "key-1",
          keyPrefix: "sk-auto-abc1",
          name: "Key 1",
          description: null,
          isActive: true,
          expiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockResolvedValue([{ value: 1 }]),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce(mockKeys as never);
      vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
        { apiKeyId: "key-1", upstreamId: "upstream-1" },
      ] as never);

      const result = await listApiKeys(1, 20);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it("should clamp page to minimum of 1", async () => {
      const { db } = await import("@/lib/db");
      const { listApiKeys } = await import("@/lib/services/key-manager");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockResolvedValue([{ value: 0 }]),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([]);

      const result = await listApiKeys(-1, 20);

      expect(result.page).toBe(1);
    });

    it("should clamp pageSize to maximum of 100", async () => {
      const { db } = await import("@/lib/db");
      const { listApiKeys } = await import("@/lib/services/key-manager");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockResolvedValue([{ value: 0 }]),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([]);

      const result = await listApiKeys(1, 200);

      expect(result.pageSize).toBe(100);
    });

    it("should return empty result when no keys", async () => {
      const { db } = await import("@/lib/db");
      const { listApiKeys } = await import("@/lib/services/key-manager");

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockResolvedValue([{ value: 0 }]),
      } as unknown as ReturnType<typeof db.select>);

      vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([]);

      const result = await listApiKeys(1, 20);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(1);
    });
  });

  describe("revealApiKey", () => {
    it("should throw ApiKeyNotFoundError when key does not exist", async () => {
      const { db } = await import("@/lib/db");
      const { revealApiKey } = await import("@/lib/services/key-manager");

      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValueOnce(undefined);

      await expect(revealApiKey("non-existent-id")).rejects.toThrow(ApiKeyNotFoundError);
    });

    it("should throw LegacyApiKeyError when keyValueEncrypted is null", async () => {
      const { db } = await import("@/lib/db");
      const { revealApiKey } = await import("@/lib/services/key-manager");

      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValueOnce({
        id: "key-1",
        keyPrefix: "sk-auto-test",
        keyValueEncrypted: null,
        keyHash: "hashed",
        name: "Legacy Key",
      } as never);

      await expect(revealApiKey("key-1")).rejects.toThrow(LegacyApiKeyError);
    });

    it("should reveal API key successfully", async () => {
      const { db } = await import("@/lib/db");
      const { revealApiKey } = await import("@/lib/services/key-manager");
      const { verifyApiKey } = await import("@/lib/utils/auth");

      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValueOnce({
        id: "key-1",
        keyPrefix: "sk-auto-test",
        keyValueEncrypted: "encrypted:sk-auto-secret-key",
        keyHash: "hashed-key",
        name: "Test Key",
      } as never);

      vi.mocked(verifyApiKey).mockResolvedValueOnce(true);

      const result = await revealApiKey("key-1");

      expect(result.keyValue).toBe("sk-auto-secret-key");
      expect(result.keyPrefix).toBe("sk-auto-test");
      expect(result.name).toBe("Test Key");
    });

    it("should throw EncryptionError when verification fails", async () => {
      const { db } = await import("@/lib/db");
      const { revealApiKey } = await import("@/lib/services/key-manager");
      const { verifyApiKey } = await import("@/lib/utils/auth");

      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValueOnce({
        id: "key-1",
        keyPrefix: "sk-auto-test",
        keyValueEncrypted: "encrypted:sk-auto-invalid",
        keyHash: "hashed-key",
        name: "Test Key",
      } as never);

      vi.mocked(verifyApiKey).mockResolvedValueOnce(false);

      await expect(revealApiKey("key-1")).rejects.toThrow(
        "Decrypted API key does not match stored hash"
      );
    });
  });

  describe("getApiKeyById", () => {
    it("should return null when key does not exist", async () => {
      const { db } = await import("@/lib/db");
      const { getApiKeyById } = await import("@/lib/services/key-manager");

      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValueOnce(undefined);

      const result = await getApiKeyById("non-existent-id");
      expect(result).toBeNull();
    });

    it("should return API key with upstream IDs", async () => {
      const { db } = await import("@/lib/db");
      const { getApiKeyById } = await import("@/lib/services/key-manager");

      vi.mocked(db.query.apiKeys.findFirst).mockResolvedValueOnce({
        id: "key-1",
        keyPrefix: "sk-auto-test",
        name: "Test Key",
        description: "Test description",
        isActive: true,
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      vi.mocked(db.query.apiKeyUpstreams.findMany).mockResolvedValueOnce([
        { apiKeyId: "key-1", upstreamId: "upstream-1" },
        { apiKeyId: "key-1", upstreamId: "upstream-2" },
      ] as never);

      const result = await getApiKeyById("key-1");

      expect(result).not.toBeNull();
      expect(result?.name).toBe("Test Key");
      expect(result?.upstreamIds).toEqual(["upstream-1", "upstream-2"]);
    });
  });

  describe("findAndVerifyApiKey", () => {
    it("should return null when no matching prefix found", async () => {
      const { db } = await import("@/lib/db");
      const { findAndVerifyApiKey } = await import("@/lib/services/key-manager");

      vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([]);

      const result = await findAndVerifyApiKey("sk-auto-unknown-key");
      expect(result).toBeNull();
    });

    it("should return API key when verification succeeds", async () => {
      const { db } = await import("@/lib/db");
      const { findAndVerifyApiKey } = await import("@/lib/services/key-manager");
      const { verifyApiKey } = await import("@/lib/utils/auth");

      const mockKey = {
        id: "key-1",
        keyPrefix: "sk-auto-test",
        keyHash: "hashed-key",
        name: "Test Key",
        isActive: true,
      };

      vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([mockKey] as never);
      vi.mocked(verifyApiKey).mockResolvedValueOnce(true);

      const result = await findAndVerifyApiKey("sk-auto-test-full-key");

      expect(result).toEqual(mockKey);
    });

    it("should return null when verification fails", async () => {
      const { db } = await import("@/lib/db");
      const { findAndVerifyApiKey } = await import("@/lib/services/key-manager");
      const { verifyApiKey } = await import("@/lib/utils/auth");

      vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
        {
          id: "key-1",
          keyPrefix: "sk-auto-test",
          keyHash: "hashed-key",
          name: "Test Key",
        },
      ] as never);
      vi.mocked(verifyApiKey).mockResolvedValueOnce(false);

      const result = await findAndVerifyApiKey("sk-auto-test-wrong-key");
      expect(result).toBeNull();
    });

    it("should handle multiple candidates and find correct one", async () => {
      const { db } = await import("@/lib/db");
      const { findAndVerifyApiKey } = await import("@/lib/services/key-manager");
      const { verifyApiKey } = await import("@/lib/utils/auth");

      const mockKeys = [
        { id: "key-1", keyPrefix: "sk-auto-test", keyHash: "hash1", name: "Key 1" },
        { id: "key-2", keyPrefix: "sk-auto-test", keyHash: "hash2", name: "Key 2" },
      ];

      vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce(mockKeys as never);
      vi.mocked(verifyApiKey)
        .mockResolvedValueOnce(false) // First key fails
        .mockResolvedValueOnce(true); // Second key succeeds

      const result = await findAndVerifyApiKey("sk-auto-test-key-2");

      expect(result?.id).toBe("key-2");
    });

    it("should handle bcrypt verification errors gracefully", async () => {
      const { db } = await import("@/lib/db");
      const { findAndVerifyApiKey } = await import("@/lib/services/key-manager");
      const { verifyApiKey } = await import("@/lib/utils/auth");

      vi.mocked(db.query.apiKeys.findMany).mockResolvedValueOnce([
        { id: "key-1", keyPrefix: "sk-auto-test", keyHash: "corrupted", name: "Bad Key" },
      ] as never);
      vi.mocked(verifyApiKey).mockRejectedValueOnce(new Error("bcrypt error"));

      const result = await findAndVerifyApiKey("sk-auto-test-key");
      expect(result).toBeNull();
    });
  });
});
