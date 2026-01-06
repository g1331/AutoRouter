import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  hashApiKey,
  verifyApiKey,
  extractApiKey,
  getKeyPrefix,
  generateApiKey,
} from "@/lib/utils/auth";

describe("auth utilities", () => {
  describe("hashApiKey", () => {
    it("should hash an API key", async () => {
      const key = "sk-auto-testkey123456789012345678901234";
      const hash = await hashApiKey(key);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(key);
      expect(hash.startsWith("$2")).toBe(true); // bcrypt hash prefix
    });

    it("should generate different hashes for the same key", async () => {
      const key = "sk-auto-testkey123456789012345678901234";
      const hash1 = await hashApiKey(key);
      const hash2 = await hashApiKey(key);

      expect(hash1).not.toBe(hash2); // bcrypt uses random salt
    });
  });

  describe("verifyApiKey", () => {
    it("should verify a correct API key", async () => {
      const key = "sk-auto-testkey123456789012345678901234";
      const hash = await hashApiKey(key);

      const isValid = await verifyApiKey(key, hash);
      expect(isValid).toBe(true);
    });

    it("should reject an incorrect API key", async () => {
      const key = "sk-auto-testkey123456789012345678901234";
      const wrongKey = "sk-auto-wrongkey12345678901234567890";
      const hash = await hashApiKey(key);

      const isValid = await verifyApiKey(wrongKey, hash);
      expect(isValid).toBe(false);
    });

    it("should handle invalid hash gracefully", async () => {
      const key = "sk-auto-testkey123456789012345678901234";

      const isValid = await verifyApiKey(key, "invalid-hash");
      expect(isValid).toBe(false);
    });
  });

  describe("extractApiKey", () => {
    it("should extract key from Bearer token", () => {
      const key = extractApiKey("Bearer sk-auto-mykey123");
      expect(key).toBe("sk-auto-mykey123");
    });

    it("should extract key from bearer token (lowercase)", () => {
      const key = extractApiKey("bearer sk-auto-mykey123");
      expect(key).toBe("sk-auto-mykey123");
    });

    it("should handle raw key without Bearer prefix", () => {
      const key = extractApiKey("sk-auto-mykey123");
      expect(key).toBe("sk-auto-mykey123");
    });

    it("should return null for null input", () => {
      const key = extractApiKey(null);
      expect(key).toBeNull();
    });

    it("should trim whitespace", () => {
      const key = extractApiKey("Bearer  sk-auto-mykey123  ");
      expect(key).toBe("sk-auto-mykey123");
    });
  });

  describe("getKeyPrefix", () => {
    it("should return first 12 characters", () => {
      const key = "sk-auto-testkey123456789012345678901234";
      const prefix = getKeyPrefix(key);
      expect(prefix).toBe("sk-auto-test");
      expect(prefix.length).toBe(12);
    });

    it("should handle short keys", () => {
      const key = "short";
      const prefix = getKeyPrefix(key);
      expect(prefix).toBe("short");
    });
  });

  describe("generateApiKey", () => {
    it("should generate a key with correct format", () => {
      const key = generateApiKey();
      expect(key.startsWith("sk-auto-")).toBe(true);
    });

    it("should generate a key with correct length", () => {
      const key = generateApiKey();
      // sk-auto- (8) + 32 random chars = 40
      expect(key.length).toBe(40);
    });

    it("should generate unique keys", () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1).not.toBe(key2);
    });

    it("should only contain valid characters", () => {
      const key = generateApiKey();
      const randomPart = key.slice(8);
      expect(randomPart).toMatch(/^[a-zA-Z0-9]+$/);
    });
  });

  describe("validateAdminAuth", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should return false when no admin token configured", async () => {
      // Reset modules to test with no ADMIN_TOKEN
      delete process.env.ADMIN_TOKEN;
      const { validateAdminAuth: freshValidateAdminAuth } = await import("@/lib/utils/auth");

      const result = freshValidateAdminAuth("Bearer some-token");
      expect(result).toBe(false);
    });

    it("should validate correct admin token", async () => {
      process.env.ADMIN_TOKEN = "test-admin-token";
      const { validateAdminAuth: freshValidateAdminAuth } = await import("@/lib/utils/auth");

      const result = freshValidateAdminAuth("Bearer test-admin-token");
      expect(result).toBe(true);
    });

    it("should reject incorrect admin token", async () => {
      process.env.ADMIN_TOKEN = "test-admin-token";
      const { validateAdminAuth: freshValidateAdminAuth } = await import("@/lib/utils/auth");

      const result = freshValidateAdminAuth("Bearer wrong-token");
      expect(result).toBe(false);
    });

    it("should handle null auth header", async () => {
      process.env.ADMIN_TOKEN = "test-admin-token";
      const { validateAdminAuth: freshValidateAdminAuth } = await import("@/lib/utils/auth");

      const result = freshValidateAdminAuth(null);
      expect(result).toBe(false);
    });

    it("should handle raw token without Bearer prefix", async () => {
      process.env.ADMIN_TOKEN = "test-admin-token";
      const { validateAdminAuth: freshValidateAdminAuth } = await import("@/lib/utils/auth");

      const result = freshValidateAdminAuth("test-admin-token");
      expect(result).toBe(true);
    });
  });

  describe("revealApiKey", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should throw error for null encrypted key", async () => {
      process.env.ALLOW_KEY_REVEAL = "true";
      const { revealApiKey: freshRevealApiKey } = await import("@/lib/utils/auth");

      await expect(freshRevealApiKey(null, "somehash")).rejects.toThrow(
        "Cannot reveal legacy bcrypt-only key"
      );
    });

    it("should throw error when key reveal is disabled", async () => {
      // ALLOW_KEY_REVEAL defaults to false, ensure it's not set
      delete process.env.ALLOW_KEY_REVEAL;
      const { revealApiKey: freshRevealApiKey } = await import("@/lib/utils/auth");

      await expect(freshRevealApiKey("encrypted-value", "somehash")).rejects.toThrow(
        "Key reveal is disabled"
      );
    });
  });
});
