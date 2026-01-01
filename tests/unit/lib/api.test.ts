import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApiClient, ApiError, UnauthorizedError } from "@/lib/api";

describe("api", () => {
  const mockFetch = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    mockFetch.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("ApiError", () => {
    it("creates error with message and status", () => {
      const error = new ApiError("Test error", 400);

      expect(error.message).toBe("Test error");
      expect(error.status).toBe(400);
      expect(error.name).toBe("ApiError");
    });

    it("creates error with detail", () => {
      const error = new ApiError("Test error", 400, { field: "test" });

      expect(error.detail).toEqual({ field: "test" });
    });
  });

  describe("UnauthorizedError", () => {
    it("creates error with default message", () => {
      const error = new UnauthorizedError();

      expect(error.message).toBe("认证已过期或无效");
      expect(error.status).toBe(401);
      expect(error.name).toBe("UnauthorizedError");
    });

    it("creates error with custom message", () => {
      const error = new UnauthorizedError("Custom message");

      expect(error.message).toBe("Custom message");
    });
  });

  describe("createApiClient", () => {
    const mockGetToken = vi.fn();
    const mockOnUnauthorized = vi.fn();

    beforeEach(() => {
      mockGetToken.mockClear();
      mockOnUnauthorized.mockClear();
    });

    it("creates client with get, post, put, delete methods", () => {
      const client = createApiClient({
        getToken: mockGetToken,
        onUnauthorized: mockOnUnauthorized,
      });

      expect(typeof client.get).toBe("function");
      expect(typeof client.post).toBe("function");
      expect(typeof client.put).toBe("function");
      expect(typeof client.delete).toBe("function");
    });

    describe("GET request", () => {
      it("makes GET request with token", async () => {
        mockGetToken.mockReturnValue("test-token");
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: "test" }),
        });

        const client = createApiClient({
          getToken: mockGetToken,
          onUnauthorized: mockOnUnauthorized,
        });

        const result = await client.get("/test");

        expect(mockFetch).toHaveBeenCalledWith("/api/test", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-token",
          },
        });
        expect(result).toEqual({ data: "test" });
      });

      it("makes GET request without token when not available", async () => {
        mockGetToken.mockReturnValue(null);
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: "test" }),
        });

        const client = createApiClient({
          getToken: mockGetToken,
          onUnauthorized: mockOnUnauthorized,
        });

        await client.get("/test");

        expect(mockFetch).toHaveBeenCalledWith("/api/test", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });
      });
    });

    describe("POST request", () => {
      it("makes POST request with body", async () => {
        mockGetToken.mockReturnValue("test-token");
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 1 }),
        });

        const client = createApiClient({
          getToken: mockGetToken,
          onUnauthorized: mockOnUnauthorized,
        });

        const result = await client.post("/create", { name: "test" });

        expect(mockFetch).toHaveBeenCalledWith("/api/create", {
          method: "POST",
          body: JSON.stringify({ name: "test" }),
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-token",
          },
        });
        expect(result).toEqual({ id: 1 });
      });

      it("makes POST request without body", async () => {
        mockGetToken.mockReturnValue("test-token");
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ success: true }),
        });

        const client = createApiClient({
          getToken: mockGetToken,
          onUnauthorized: mockOnUnauthorized,
        });

        await client.post("/action");

        expect(mockFetch).toHaveBeenCalledWith("/api/action", {
          method: "POST",
          body: undefined,
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-token",
          },
        });
      });
    });

    describe("PUT request", () => {
      it("makes PUT request with body", async () => {
        mockGetToken.mockReturnValue("test-token");
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ updated: true }),
        });

        const client = createApiClient({
          getToken: mockGetToken,
          onUnauthorized: mockOnUnauthorized,
        });

        const result = await client.put("/update/1", { name: "updated" });

        expect(mockFetch).toHaveBeenCalledWith("/api/update/1", {
          method: "PUT",
          body: JSON.stringify({ name: "updated" }),
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-token",
          },
        });
        expect(result).toEqual({ updated: true });
      });
    });

    describe("DELETE request", () => {
      it("makes DELETE request", async () => {
        mockGetToken.mockReturnValue("test-token");
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 204,
        });

        const client = createApiClient({
          getToken: mockGetToken,
          onUnauthorized: mockOnUnauthorized,
        });

        const result = await client.delete("/item/1");

        expect(mockFetch).toHaveBeenCalledWith("/api/item/1", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer test-token",
          },
        });
        expect(result).toBeNull();
      });
    });

    describe("Error handling", () => {
      it("throws UnauthorizedError and calls onUnauthorized on 401", async () => {
        mockGetToken.mockReturnValue("expired-token");
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
        });

        const client = createApiClient({
          getToken: mockGetToken,
          onUnauthorized: mockOnUnauthorized,
        });

        await expect(client.get("/protected")).rejects.toThrow(UnauthorizedError);
        expect(mockOnUnauthorized).toHaveBeenCalled();
      });

      it("throws ApiError with JSON error detail on non-2xx response", async () => {
        mockGetToken.mockReturnValue("test-token");
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: "Bad Request",
          json: () => Promise.resolve({ detail: "Validation failed" }),
        });

        const client = createApiClient({
          getToken: mockGetToken,
          onUnauthorized: mockOnUnauthorized,
        });

        try {
          await client.get("/bad-request");
          expect.fail("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(ApiError);
          expect((error as ApiError).status).toBe(400);
          expect((error as ApiError).message).toBe("Validation failed");
        }
      });

      it("throws ApiError with error object when detail is not string", async () => {
        mockGetToken.mockReturnValue("test-token");
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 422,
          statusText: "Unprocessable Entity",
          json: () => Promise.resolve({ detail: { errors: ["field1", "field2"] } }),
        });

        const client = createApiClient({
          getToken: mockGetToken,
          onUnauthorized: mockOnUnauthorized,
        });

        try {
          await client.post("/validate", { bad: "data" });
          expect.fail("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(ApiError);
          expect((error as ApiError).status).toBe(422);
          expect((error as ApiError).message).toBe("请求失败");
          expect((error as ApiError).detail).toEqual({ errors: ["field1", "field2"] });
        }
      });

      it("throws ApiError with statusText when JSON parse fails", async () => {
        mockGetToken.mockReturnValue("test-token");
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          json: () => Promise.reject(new Error("Invalid JSON")),
        });

        const client = createApiClient({
          getToken: mockGetToken,
          onUnauthorized: mockOnUnauthorized,
        });

        try {
          await client.get("/error");
          expect.fail("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(ApiError);
          expect((error as ApiError).status).toBe(500);
          expect((error as ApiError).detail).toBe("Internal Server Error");
        }
      });

      it("throws ApiError on network error", async () => {
        mockGetToken.mockReturnValue("test-token");
        mockFetch.mockRejectedValueOnce(new Error("Network failure"));

        const client = createApiClient({
          getToken: mockGetToken,
          onUnauthorized: mockOnUnauthorized,
        });

        try {
          await client.get("/network-fail");
          expect.fail("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(ApiError);
          expect((error as ApiError).status).toBe(0);
          expect((error as ApiError).message).toBe("Network failure");
        }
      });

      it("throws ApiError with default message on non-Error network failure", async () => {
        mockGetToken.mockReturnValue("test-token");
        mockFetch.mockRejectedValueOnce("string error");

        const client = createApiClient({
          getToken: mockGetToken,
          onUnauthorized: mockOnUnauthorized,
        });

        try {
          await client.get("/network-fail");
          expect.fail("Should have thrown");
        } catch (error) {
          expect(error).toBeInstanceOf(ApiError);
          expect((error as ApiError).message).toBe("网络请求失败");
        }
      });
    });

    describe("204 No Content", () => {
      it("returns null for 204 response", async () => {
        mockGetToken.mockReturnValue("test-token");
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 204,
        });

        const client = createApiClient({
          getToken: mockGetToken,
          onUnauthorized: mockOnUnauthorized,
        });

        const result = await client.delete("/item/1");

        expect(result).toBeNull();
      });
    });

    describe("Custom headers", () => {
      it("merges custom headers with default headers", async () => {
        mockGetToken.mockReturnValue("test-token");
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: "test" }),
        });

        const client = createApiClient({
          getToken: mockGetToken,
          onUnauthorized: mockOnUnauthorized,
        });

        await client.get("/test", {
          headers: { "X-Custom-Header": "custom-value" },
        });

        expect(mockFetch).toHaveBeenCalledWith("/api/test", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Custom-Header": "custom-value",
            Authorization: "Bearer test-token",
          },
        });
      });
    });
  });
});
