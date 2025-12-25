import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { encrypt, decrypt, generateEncryptionKey, EncryptionError } from "@/lib/utils/encryption";

describe("encryption utilities", () => {
  const testEncryptionKey = "dGVzdGtleXRlc3RrZXl0ZXN0a2V5dGVzdGtleXRlc3Q="; // 32 bytes base64

  beforeAll(() => {
    vi.stubEnv("ENCRYPTION_KEY", testEncryptionKey);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  describe("generateEncryptionKey", () => {
    it("should generate a valid base64 key", () => {
      const key = generateEncryptionKey();
      expect(key).toBeDefined();
      expect(typeof key).toBe("string");

      // Should be valid base64
      const decoded = Buffer.from(key, "base64");
      expect(decoded.length).toBe(32);
    });

    it("should generate unique keys", () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe("encrypt and decrypt", () => {
    it("should encrypt and decrypt a simple string", () => {
      const plaintext = "Hello, World!";
      const encrypted = encrypt(plaintext);

      expect(encrypted).toBeDefined();
      expect(encrypted).not.toBe(plaintext);

      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should encrypt and decrypt an API key", () => {
      const apiKey = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz123456";
      const encrypted = encrypt(apiKey);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(apiKey);
    });

    it("should encrypt and decrypt unicode strings", () => {
      const plaintext = "你好世界 🌍 Привет мир";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should encrypt and decrypt empty string", () => {
      const plaintext = "";
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should produce different ciphertext for same plaintext (due to random IV)", () => {
      const plaintext = "test message";
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same value
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });

    it("should produce Fernet-compatible token format", () => {
      const plaintext = "test";
      const encrypted = encrypt(plaintext);

      // Fernet tokens are base64 encoded
      // Decode and check version byte (0x80)
      const decoded = Buffer.from(encrypted, "base64");
      expect(decoded[0]).toBe(0x80);
    });
  });

  describe("decrypt error handling", () => {
    it("should throw EncryptionError for invalid token", () => {
      expect(() => decrypt("not-a-valid-token")).toThrow(EncryptionError);
    });

    it("should throw EncryptionError for too short token", () => {
      const shortToken = Buffer.alloc(20).toString("base64");
      expect(() => decrypt(shortToken)).toThrow(EncryptionError);
    });

    it("should throw EncryptionError for tampered ciphertext", () => {
      const plaintext = "secret data";
      const encrypted = encrypt(plaintext);

      // Tamper with the encrypted data
      const decoded = Buffer.from(encrypted, "base64");
      decoded[30] = decoded[30] ^ 0xff; // Flip bits in ciphertext
      const tampered = decoded.toString("base64");

      expect(() => decrypt(tampered)).toThrow(EncryptionError);
    });

    it("should throw EncryptionError for wrong version byte", () => {
      const plaintext = "test";
      const encrypted = encrypt(plaintext);

      // Change version byte
      const decoded = Buffer.from(encrypted, "base64");
      decoded[0] = 0x00;
      const modified = decoded.toString("base64");

      expect(() => decrypt(modified)).toThrow(EncryptionError);
    });
  });
});
