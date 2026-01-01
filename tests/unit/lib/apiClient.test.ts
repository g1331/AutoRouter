import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchJson } from "@/lib/apiClient";

describe("apiClient", () => {
  const mockFetch = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    mockFetch.mockClear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("fetchJson", () => {
    it("fetches JSON data successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: "test" }),
      });

      const result = await fetchJson("/test");

      expect(mockFetch).toHaveBeenCalledWith("/api/test", undefined);
      expect(result).toEqual({ data: "test" });
    });

    it("uses /api as base URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await fetchJson("/users/1");

      expect(mockFetch).toHaveBeenCalledWith("/api/users/1", undefined);
    });

    it("passes init options to fetch", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ created: true }),
      });

      await fetchJson("/create", {
        method: "POST",
        body: JSON.stringify({ name: "test" }),
        headers: { "Content-Type": "application/json" },
      });

      expect(mockFetch).toHaveBeenCalledWith("/api/create", {
        method: "POST",
        body: JSON.stringify({ name: "test" }),
        headers: { "Content-Type": "application/json" },
      });
    });

    it("throws error on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(fetchJson("/not-found")).rejects.toThrow("Request failed with status 404");
    });

    it("throws error on 500 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(fetchJson("/server-error")).rejects.toThrow("Request failed with status 500");
    });

    it("throws error on 400 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      await expect(fetchJson("/bad-request")).rejects.toThrow("Request failed with status 400");
    });

    it("returns typed data", async () => {
      interface User {
        id: number;
        name: string;
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 1, name: "John" }),
      });

      const result = await fetchJson<User>("/users/1");

      expect(result.id).toBe(1);
      expect(result.name).toBe("John");
    });
  });
});
