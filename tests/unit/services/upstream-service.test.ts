import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { maskApiKey, UpstreamNotFoundError } from "@/lib/services/upstream-service";

// Mock the database module
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      upstreams: {
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
}));

// Mock encryption module
vi.mock("@/lib/utils/encryption", () => ({
  encrypt: vi.fn((value: string) => `encrypted:${value}`),
  decrypt: vi.fn((value: string) => value.replace("encrypted:", "")),
}));

describe("upstream-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("maskApiKey", () => {
    it("should mask standard API key with sk- prefix", () => {
      const key = "sk-1234567890abcdef";
      const masked = maskApiKey(key);
      expect(masked).toBe("sk-***cdef");
    });

    it("should mask API key without sk- prefix", () => {
      const key = "api-1234567890abcdef";
      const masked = maskApiKey(key);
      expect(masked).toBe("ap***cdef");
    });

    it("should return *** for short keys", () => {
      const key = "short";
      const masked = maskApiKey(key);
      expect(masked).toBe("***");
    });

    it("should return *** for keys with length <= 7", () => {
      const key = "1234567";
      const masked = maskApiKey(key);
      expect(masked).toBe("***");
    });

    it("should handle exactly 8 character keys", () => {
      const key = "12345678";
      const masked = maskApiKey(key);
      // prefix: "12", suffix: "5678"
      expect(masked).toBe("12***5678");
    });

    it("should handle Anthropic API key format", () => {
      const key = "sk-ant-api03-1234567890abcdefghij";
      const masked = maskApiKey(key);
      expect(masked).toBe("sk-***ghij");
    });

    it("should handle empty string", () => {
      const key = "";
      const masked = maskApiKey(key);
      expect(masked).toBe("***");
    });

    it("should preserve sk- prefix for OpenAI keys", () => {
      const key = "sk-proj-abcdefghijklmnop";
      const masked = maskApiKey(key);
      expect(masked).toMatch(/^sk-\*\*\*/);
      expect(masked).toMatch(/mnop$/);
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

    it("should be catchable as Error", () => {
      try {
        throw new UpstreamNotFoundError("test error");
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect((e as Error).message).toBe("test error");
      }
    });
  });

  describe("testUpstreamConnection", () => {
    const mockFetch = vi.fn();

    beforeEach(() => {
      vi.clearAllMocks();
      global.fetch = mockFetch;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should successfully test OpenAI connection", async () => {
      const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: vi.fn().mockResolvedValue(""),
      });

      const result = await testUpstreamConnection({
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-test-key-12345678",
        timeout: 10,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("Connection successful");
      expect(result.statusCode).toBe(200);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.errorType).toBeUndefined();
      expect(result.testedAt).toBeInstanceOf(Date);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/models",
        expect.objectContaining({
          method: "GET",
          headers: {
            Authorization: "Bearer sk-test-key-12345678",
          },
        })
      );
    });

    it("should successfully test Anthropic connection", async () => {
      const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: vi.fn().mockResolvedValue(""),
      });

      const result = await testUpstreamConnection({
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        apiKey: "sk-ant-api03-test-key",
        timeout: 10,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("Connection successful");
      expect(result.statusCode).toBe(200);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.errorType).toBeUndefined();
      expect(result.testedAt).toBeInstanceOf(Date);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.anthropic.com/v1/models",
        expect.objectContaining({
          method: "GET",
          headers: {
            "x-api-key": "sk-ant-api03-test-key",
            "anthropic-version": "2023-06-01",
          },
        })
      );
    });

    it("should accept 201 status as successful", async () => {
      const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

      mockFetch.mockResolvedValueOnce({
        status: 201,
        text: vi.fn().mockResolvedValue(""),
      });

      const result = await testUpstreamConnection({
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-test-key",
        timeout: 10,
      });

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(201);
    });

    it("should handle invalid API key with 401 status", async () => {
      const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

      mockFetch.mockResolvedValueOnce({
        status: 401,
        text: vi.fn().mockResolvedValue(JSON.stringify({ error: "Invalid API key" })),
      });

      const result = await testUpstreamConnection({
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-invalid-key",
        timeout: 10,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Authentication failed - invalid API key");
      expect(result.statusCode).toBe(401);
      expect(result.errorType).toBe("authentication");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.errorDetails).toContain("HTTP 401");
      expect(result.testedAt).toBeInstanceOf(Date);
    });

    it("should handle 403 forbidden status", async () => {
      const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

      mockFetch.mockResolvedValueOnce({
        status: 403,
        text: vi.fn().mockResolvedValue("Forbidden"),
      });

      const result = await testUpstreamConnection({
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        apiKey: "sk-ant-invalid",
        timeout: 10,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Authentication failed - invalid API key");
      expect(result.statusCode).toBe(403);
      expect(result.errorType).toBe("authentication");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("should handle network errors (DNS failure, connection refused)", async () => {
      const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

      mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

      const result = await testUpstreamConnection({
        provider: "openai",
        baseUrl: "https://invalid.example.com",
        apiKey: "sk-test-key",
        timeout: 10,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Network error - could not reach upstream");
      expect(result.statusCode).toBeNull();
      expect(result.latencyMs).toBeNull();
      expect(result.errorType).toBe("network");
      expect(result.errorDetails).toBe("fetch failed");
      expect(result.testedAt).toBeInstanceOf(Date);
    });

    it("should handle timeout errors", async () => {
      const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await testUpstreamConnection({
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-test-key",
        timeout: 5,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Request timed out after 5 seconds");
      expect(result.statusCode).toBeNull();
      expect(result.latencyMs).toBeNull();
      expect(result.errorType).toBe("timeout");
      expect(result.errorDetails).toBe("Request exceeded 5s timeout");
      expect(result.testedAt).toBeInstanceOf(Date);
    });

    it("should handle invalid base URL format", async () => {
      const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

      const result = await testUpstreamConnection({
        provider: "openai",
        baseUrl: "not-a-valid-url",
        apiKey: "sk-test-key",
        timeout: 10,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Invalid base URL format");
      expect(result.statusCode).toBeNull();
      expect(result.latencyMs).toBeNull();
      expect(result.errorType).toBe("network");
      expect(result.errorDetails).toContain("not a valid URL");
      expect(result.testedAt).toBeInstanceOf(Date);
    });

    it("should handle 404 endpoint not found error", async () => {
      const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

      mockFetch.mockResolvedValueOnce({
        status: 404,
        text: vi.fn().mockResolvedValue("Not Found"),
      });

      const result = await testUpstreamConnection({
        provider: "openai",
        baseUrl: "https://api.openai.com/wrong",
        apiKey: "sk-test-key",
        timeout: 10,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Endpoint not found - check base URL");
      expect(result.statusCode).toBe(404);
      expect(result.errorType).toBe("invalid_response");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.errorDetails).toContain("404");
      expect(result.errorDetails).toContain("base URL may be incorrect");
    });

    it("should handle 500 server errors", async () => {
      const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

      mockFetch.mockResolvedValueOnce({
        status: 500,
        text: vi.fn().mockResolvedValue("Internal Server Error"),
      });

      const result = await testUpstreamConnection({
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-test-key",
        timeout: 10,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Upstream server error");
      expect(result.statusCode).toBe(500);
      expect(result.errorType).toBe("invalid_response");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.errorDetails).toContain("HTTP 500");
    });

    it("should handle 503 service unavailable", async () => {
      const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

      mockFetch.mockResolvedValueOnce({
        status: 503,
        text: vi.fn().mockResolvedValue("Service Unavailable"),
      });

      const result = await testUpstreamConnection({
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        apiKey: "sk-ant-test",
        timeout: 10,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Upstream server error");
      expect(result.statusCode).toBe(503);
      expect(result.errorType).toBe("invalid_response");
    });

    it("should handle unsupported provider", async () => {
      const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

      const result = await testUpstreamConnection({
        provider: "unsupported-provider",
        baseUrl: "https://api.example.com",
        apiKey: "test-key",
        timeout: 10,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Unsupported provider: unsupported-provider");
      expect(result.statusCode).toBeNull();
      expect(result.latencyMs).toBeNull();
      expect(result.errorType).toBe("unknown");
      expect(result.errorDetails).toContain("Provider must be");
    });

    it("should handle unexpected status codes", async () => {
      const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

      mockFetch.mockResolvedValueOnce({
        status: 418,
        text: vi.fn().mockResolvedValue("I'm a teapot"),
      });

      const result = await testUpstreamConnection({
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-test-key",
        timeout: 10,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Unexpected response: HTTP 418");
      expect(result.statusCode).toBe(418);
      expect(result.errorType).toBe("unknown");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("should normalize base URL by removing trailing slash", async () => {
      const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

      mockFetch.mockResolvedValueOnce({
        status: 200,
        text: vi.fn().mockResolvedValue(""),
      });

      await testUpstreamConnection({
        provider: "openai",
        baseUrl: "https://api.openai.com/",
        apiKey: "sk-test-key",
        timeout: 10,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/models",
        expect.any(Object)
      );
    });

    it("should use default timeout of 10 seconds when not specified", async () => {
      const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await testUpstreamConnection({
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-test-key",
      });

      expect(result.message).toBe("Request timed out after 10 seconds");
      expect(result.errorDetails).toBe("Request exceeded 10s timeout");
    });

    it("should handle response text parsing errors gracefully", async () => {
      const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

      mockFetch.mockResolvedValueOnce({
        status: 401,
        text: vi.fn().mockRejectedValue(new Error("Failed to read body")),
      });

      const result = await testUpstreamConnection({
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-invalid-key",
        timeout: 10,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Authentication failed - invalid API key");
      expect(result.statusCode).toBe(401);
      expect(result.errorType).toBe("authentication");
      expect(result.errorDetails).toBe("HTTP 401");
    });

    it("should handle unknown error types", async () => {
      const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

      mockFetch.mockRejectedValueOnce("unexpected error string");

      const result = await testUpstreamConnection({
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-test-key",
        timeout: 10,
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("Test failed with unexpected error");
      expect(result.statusCode).toBeNull();
      expect(result.latencyMs).toBeNull();
      expect(result.errorType).toBe("unknown");
      expect(result.errorDetails).toBe("unexpected error string");
    });

    it("should measure latency accurately for successful requests", async () => {
      const { testUpstreamConnection } = await import("@/lib/services/upstream-service");

      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                status: 200,
                text: vi.fn().mockResolvedValue(""),
              });
            }, 50);
          })
      );

      const result = await testUpstreamConnection({
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-test-key",
        timeout: 10,
      });

      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(50);
      expect(result.latencyMs).toBeLessThan(200);
    });
  });

  describe("createUpstream", () => {
    it("should throw error when upstream name already exists", async () => {
      const { db } = await import("@/lib/db");
      const { createUpstream } = await import("@/lib/services/upstream-service");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce({
        id: "existing-id",
        name: "test-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted:sk-test",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        createUpstream({
          name: "test-upstream",
          provider: "openai",
          baseUrl: "https://api.openai.com",
          apiKey: "sk-test",
        })
      ).rejects.toThrow("Upstream with name 'test-upstream' already exists");
    });

    it("should create upstream with encrypted API key", async () => {
      const { db } = await import("@/lib/db");
      const { createUpstream } = await import("@/lib/services/upstream-service");
      const { encrypt } = await import("@/lib/utils/encryption");

      const mockUpstream = {
        id: "new-id",
        name: "new-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted:sk-newkey",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce(undefined);
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockUpstream]),
        }),
      } as unknown as ReturnType<typeof db.insert>);

      const result = await createUpstream({
        name: "new-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-newkey",
      });

      expect(encrypt).toHaveBeenCalledWith("sk-newkey");
      expect(result.name).toBe("new-upstream");
      expect(result.apiKeyMasked).toBe("sk-***wkey");
    });

    it("should set default timeout to 60 when not provided", async () => {
      const { db } = await import("@/lib/db");
      const { createUpstream } = await import("@/lib/services/upstream-service");

      const mockUpstream = {
        id: "new-id",
        name: "test",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted:sk-test",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce(undefined);
      const mockValues = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockUpstream]),
      });
      vi.mocked(db.insert).mockReturnValue({
        values: mockValues,
      } as unknown as ReturnType<typeof db.insert>);

      await createUpstream({
        name: "test",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKey: "sk-test",
      });

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 60,
        })
      );
    });
  });

  describe("updateUpstream", () => {
    it("should throw UpstreamNotFoundError when upstream does not exist", async () => {
      const { db } = await import("@/lib/db");
      const { updateUpstream } = await import("@/lib/services/upstream-service");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce(undefined);

      await expect(updateUpstream("non-existent-id", { name: "new-name" })).rejects.toThrow(
        UpstreamNotFoundError
      );
    });

    it("should throw error when new name conflicts with existing upstream", async () => {
      const { db } = await import("@/lib/db");
      const { updateUpstream } = await import("@/lib/services/upstream-service");

      // First call: find existing upstream by ID
      vi.mocked(db.query.upstreams.findFirst)
        .mockResolvedValueOnce({
          id: "upstream-1",
          name: "original-name",
          provider: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-test",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        // Second call: check name conflict
        .mockResolvedValueOnce({
          id: "upstream-2",
          name: "conflicting-name",
          provider: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-test2",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

      await expect(updateUpstream("upstream-1", { name: "conflicting-name" })).rejects.toThrow(
        "Upstream with name 'conflicting-name' already exists"
      );
    });

    it("should update upstream successfully", async () => {
      const { db } = await import("@/lib/db");
      const { updateUpstream } = await import("@/lib/services/upstream-service");

      const existingUpstream = {
        id: "upstream-1",
        name: "original-name",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted:sk-test",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedUpstream = {
        ...existingUpstream,
        name: "updated-name",
        updatedAt: new Date(),
      };

      vi.mocked(db.query.upstreams.findFirst)
        .mockResolvedValueOnce(existingUpstream)
        .mockResolvedValueOnce(undefined); // No name conflict

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedUpstream]),
          }),
        }),
      } as unknown as ReturnType<typeof db.update>);

      const result = await updateUpstream("upstream-1", { name: "updated-name" });

      expect(result.name).toBe("updated-name");
    });
  });

  describe("deleteUpstream", () => {
    it("should throw UpstreamNotFoundError when upstream does not exist", async () => {
      const { db } = await import("@/lib/db");
      const { deleteUpstream } = await import("@/lib/services/upstream-service");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce(undefined);

      await expect(deleteUpstream("non-existent-id")).rejects.toThrow(UpstreamNotFoundError);
    });

    it("should delete upstream successfully", async () => {
      const { db } = await import("@/lib/db");
      const { deleteUpstream } = await import("@/lib/services/upstream-service");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce({
        id: "upstream-1",
        name: "test-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted:sk-test",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const mockWhere = vi.fn().mockResolvedValue(undefined);
      vi.mocked(db.delete).mockReturnValue({
        where: mockWhere,
      } as unknown as ReturnType<typeof db.delete>);

      await expect(deleteUpstream("upstream-1")).resolves.toBeUndefined();
      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe("getUpstreamById", () => {
    it("should return null when upstream not found", async () => {
      const { db } = await import("@/lib/db");
      const { getUpstreamById } = await import("@/lib/services/upstream-service");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce(undefined);

      const result = await getUpstreamById("non-existent-id");
      expect(result).toBeNull();
    });

    it("should return upstream with masked API key", async () => {
      const { db } = await import("@/lib/db");
      const { getUpstreamById } = await import("@/lib/services/upstream-service");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce({
        id: "upstream-1",
        name: "test-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted:sk-test-key-12345",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await getUpstreamById("upstream-1");

      expect(result).not.toBeNull();
      expect(result?.name).toBe("test-upstream");
      expect(result?.apiKeyMasked).toBe("sk-***2345");
    });

    it("should handle decryption error gracefully", async () => {
      const { db } = await import("@/lib/db");
      const { getUpstreamById } = await import("@/lib/services/upstream-service");
      const { decrypt } = await import("@/lib/utils/encryption");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce({
        id: "upstream-1",
        name: "test-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "invalid-encrypted-data",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.mocked(decrypt).mockImplementationOnce(() => {
        throw new Error("Decryption failed");
      });

      const result = await getUpstreamById("upstream-1");

      expect(result).not.toBeNull();
      expect(result?.apiKeyMasked).toBe("***error***");
    });
  });

  describe("loadActiveUpstreams", () => {
    it("should return empty array when no active upstreams", async () => {
      const { db } = await import("@/lib/db");
      const { loadActiveUpstreams } = await import("@/lib/services/upstream-service");

      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce([]);

      const result = await loadActiveUpstreams();
      expect(result).toEqual([]);
    });

    it("should return all active upstreams", async () => {
      const { db } = await import("@/lib/db");
      const { loadActiveUpstreams } = await import("@/lib/services/upstream-service");

      const mockUpstreams = [
        {
          id: "upstream-1",
          name: "openai",
          provider: "openai",
          baseUrl: "https://api.openai.com",
          apiKeyEncrypted: "encrypted:sk-1",
          isDefault: true,
          timeout: 60,
          isActive: true,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "upstream-2",
          name: "anthropic",
          provider: "anthropic",
          baseUrl: "https://api.anthropic.com",
          apiKeyEncrypted: "encrypted:sk-2",
          isDefault: false,
          timeout: 60,
          isActive: true,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.mocked(db.query.upstreams.findMany).mockResolvedValueOnce(mockUpstreams);

      const result = await loadActiveUpstreams();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("openai");
      expect(result[1].name).toBe("anthropic");
    });
  });

  describe("getDefaultUpstream", () => {
    it("should return null when no default upstream", async () => {
      const { db } = await import("@/lib/db");
      const { getDefaultUpstream } = await import("@/lib/services/upstream-service");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce(undefined);

      const result = await getDefaultUpstream();
      expect(result).toBeNull();
    });

    it("should return the default upstream", async () => {
      const { db } = await import("@/lib/db");
      const { getDefaultUpstream } = await import("@/lib/services/upstream-service");

      const mockUpstream = {
        id: "upstream-1",
        name: "default-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted:sk-default",
        isDefault: true,
        timeout: 60,
        isActive: true,
        config: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce(mockUpstream);

      const result = await getDefaultUpstream();
      expect(result).not.toBeNull();
      expect(result?.name).toBe("default-upstream");
      expect(result?.isDefault).toBe(true);
    });
  });

  describe("getUpstreamByName", () => {
    it("should return null when upstream not found", async () => {
      const { db } = await import("@/lib/db");
      const { getUpstreamByName } = await import("@/lib/services/upstream-service");

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce(undefined);

      const result = await getUpstreamByName("non-existent");
      expect(result).toBeNull();
    });

    it("should return upstream by name", async () => {
      const { db } = await import("@/lib/db");
      const { getUpstreamByName } = await import("@/lib/services/upstream-service");

      const mockUpstream = {
        id: "upstream-1",
        name: "test-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted:sk-test",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(db.query.upstreams.findFirst).mockResolvedValueOnce(mockUpstream);

      const result = await getUpstreamByName("test-upstream");
      expect(result).not.toBeNull();
      expect(result?.name).toBe("test-upstream");
    });
  });

  describe("getDecryptedApiKey", () => {
    it("should decrypt the API key", async () => {
      const { getDecryptedApiKey } = await import("@/lib/services/upstream-service");
      const { decrypt } = await import("@/lib/utils/encryption");

      const mockUpstream = {
        id: "upstream-1",
        name: "test-upstream",
        provider: "openai",
        baseUrl: "https://api.openai.com",
        apiKeyEncrypted: "encrypted:sk-secret-key",
        isDefault: false,
        timeout: 60,
        isActive: true,
        config: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = getDecryptedApiKey(mockUpstream);

      expect(decrypt).toHaveBeenCalledWith("encrypted:sk-secret-key");
      expect(result).toBe("sk-secret-key");
    });
  });
});
