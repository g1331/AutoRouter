import { describe, it, expect } from "vitest";
import { generateApiKey, ApiKeyNotFoundError, LegacyApiKeyError } from "@/lib/services/key-manager";

describe("key-manager", () => {
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
});
