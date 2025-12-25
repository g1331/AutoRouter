import { describe, it, expect } from "vitest";
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
});
