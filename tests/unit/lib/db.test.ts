import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock postgres module
const mockEnd = vi.fn().mockResolvedValue(undefined);
const mockPostgres = vi.fn(() => ({ end: mockEnd }));

vi.mock("postgres", () => ({
  default: mockPostgres,
}));

// Mock drizzle-orm
const mockDrizzle = vi.fn(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: mockDrizzle,
}));

describe("lib/db", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    mockPostgres.mockClear();
    mockDrizzle.mockClear();
    mockEnd.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("db proxy", () => {
    it("exports db proxy object", async () => {
      process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

      const { db } = await import("@/lib/db");

      expect(db).toBeDefined();
      expect(typeof db).toBe("object");
    });

    it("lazily initializes database on first access", async () => {
      process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

      const { db } = await import("@/lib/db");

      // Access a property to trigger lazy initialization
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        db.select;
      } catch {
        // Expected if drizzle mock doesn't have select
      }

      expect(mockPostgres).toHaveBeenCalled();
      expect(mockDrizzle).toHaveBeenCalled();
    });

    it("throws error when DATABASE_URL is not set", async () => {
      delete process.env.DATABASE_URL;

      const { db } = await import("@/lib/db");

      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        db.select;
      }).toThrow("DATABASE_URL environment variable is not set");
    });
  });

  describe("closeDatabase", () => {
    it("exports closeDatabase function", async () => {
      process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

      const { closeDatabase } = await import("@/lib/db");

      expect(typeof closeDatabase).toBe("function");
    });

    it("closes database connection when client exists", async () => {
      process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

      const { db, closeDatabase } = await import("@/lib/db");

      // Access to initialize
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        db.select;
      } catch {
        // Expected
      }

      await closeDatabase();

      expect(mockEnd).toHaveBeenCalled();
    });

    it("does nothing when no client exists", async () => {
      process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

      const { closeDatabase } = await import("@/lib/db");

      // Call closeDatabase without initializing db first
      await closeDatabase();

      // mockEnd should not be called since client was never initialized
      expect(mockEnd).not.toHaveBeenCalled();
    });
  });

  describe("schema exports", () => {
    it("re-exports schema", async () => {
      process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

      const exports = await import("@/lib/db");

      // Should have schema exports
      expect(exports).toHaveProperty("apiKeys");
      expect(exports).toHaveProperty("upstreams");
      expect(exports).toHaveProperty("requestLogs");
    });
  });

  describe("postgres connection options", () => {
    it("creates postgres client with correct options", async () => {
      process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

      const { db } = await import("@/lib/db");

      // Access to trigger initialization
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        db.select;
      } catch {
        // Expected
      }

      expect(mockPostgres).toHaveBeenCalledWith("postgresql://test:test@localhost:5432/test", {
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
      });
    });
  });
});
