import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("config utilities", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Set minimum required config
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("loadConfig", () => {
    it("should load default values when no env vars set", async () => {
      const { config } = await import("@/lib/utils/config");

      expect(config.environment).toBe("test");
      expect(config.port).toBe(3000);
      expect(config.allowKeyReveal).toBe(false);
      expect(config.debugLogHeaders).toBe(false);
      expect(config.logRetentionDays).toBe(90);
    });

    it("should parse PORT as number", async () => {
      process.env.PORT = "8080";
      const { config } = await import("@/lib/utils/config");

      expect(config.port).toBe(8080);
    });

    it("should parse ALLOW_KEY_REVEAL as boolean", async () => {
      process.env.ALLOW_KEY_REVEAL = "true";
      const { config } = await import("@/lib/utils/config");

      expect(config.allowKeyReveal).toBe(true);
    });

    it("should parse CORS_ORIGINS as array", async () => {
      process.env.CORS_ORIGINS = "http://localhost:3000,https://example.com";
      const { config } = await import("@/lib/utils/config");

      expect(config.corsOrigins).toEqual(["http://localhost:3000", "https://example.com"]);
    });

    it("should default CORS_ORIGINS to localhost", async () => {
      delete process.env.CORS_ORIGINS;
      const { config } = await import("@/lib/utils/config");

      expect(config.corsOrigins).toEqual(["http://localhost:3000"]);
    });

    it("should throw error for invalid DATABASE_URL", async () => {
      process.env.DATABASE_URL = "mysql://invalid";

      await expect(import("@/lib/utils/config")).rejects.toThrow("Configuration validation failed");
    });

    it("should accept valid PostgreSQL DATABASE_URL", async () => {
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
      const { config } = await import("@/lib/utils/config");

      expect(config.databaseUrl).toBe("postgresql://user:pass@localhost:5432/db");
    });

    it("should accept postgres:// protocol", async () => {
      process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";
      const { config } = await import("@/lib/utils/config");

      expect(config.databaseUrl).toBe("postgres://user:pass@localhost:5432/db");
    });

    it("should parse LOG_RETENTION_DAYS as number", async () => {
      process.env.LOG_RETENTION_DAYS = "30";
      const { config } = await import("@/lib/utils/config");

      expect(config.logRetentionDays).toBe(30);
    });

    it("should load ADMIN_TOKEN", async () => {
      process.env.ADMIN_TOKEN = "my-secret-admin-token";
      const { config } = await import("@/lib/utils/config");

      expect(config.adminToken).toBe("my-secret-admin-token");
    });

    it("should parse DEBUG_LOG_HEADERS as boolean", async () => {
      process.env.DEBUG_LOG_HEADERS = "true";
      const { config } = await import("@/lib/utils/config");

      expect(config.debugLogHeaders).toBe(true);
    });
  });

  describe("isAdminConfigured", () => {
    it("should return true when ADMIN_TOKEN is set", async () => {
      process.env.ADMIN_TOKEN = "test-token";
      const { isAdminConfigured } = await import("@/lib/utils/config");

      expect(isAdminConfigured()).toBe(true);
    });

    it("should return false when ADMIN_TOKEN is not set", async () => {
      delete process.env.ADMIN_TOKEN;
      const { isAdminConfigured } = await import("@/lib/utils/config");

      expect(isAdminConfigured()).toBe(false);
    });
  });

  describe("validateAdminToken", () => {
    it("should return true for correct token", async () => {
      process.env.ADMIN_TOKEN = "correct-token";
      const { validateAdminToken } = await import("@/lib/utils/config");

      expect(validateAdminToken("correct-token")).toBe(true);
    });

    it("should return false for incorrect token", async () => {
      process.env.ADMIN_TOKEN = "correct-token";
      const { validateAdminToken } = await import("@/lib/utils/config");

      expect(validateAdminToken("wrong-token")).toBe(false);
    });

    it("should return false for null token", async () => {
      process.env.ADMIN_TOKEN = "correct-token";
      const { validateAdminToken } = await import("@/lib/utils/config");

      expect(validateAdminToken(null)).toBe(false);
    });

    it("should return false when no admin token configured", async () => {
      delete process.env.ADMIN_TOKEN;
      const { validateAdminToken } = await import("@/lib/utils/config");

      expect(validateAdminToken("any-token")).toBe(false);
    });
  });

  describe("environment detection", () => {
    it("should use ENVIRONMENT over NODE_ENV when both set", async () => {
      process.env.ENVIRONMENT = "production";
      process.env.NODE_ENV = "development";
      const { config } = await import("@/lib/utils/config");

      expect(config.environment).toBe("production");
    });

    it("should fallback to NODE_ENV when ENVIRONMENT not set", async () => {
      delete process.env.ENVIRONMENT;
      process.env.NODE_ENV = "production";
      const { config } = await import("@/lib/utils/config");

      expect(config.environment).toBe("production");
    });

    it("should default to development when no env set", async () => {
      delete process.env.ENVIRONMENT;
      delete process.env.NODE_ENV;
      const { config } = await import("@/lib/utils/config");

      expect(config.environment).toBe("development");
    });
  });
});
