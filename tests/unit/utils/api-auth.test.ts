import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse, getPaginationParams, withAdminAuth } from "@/lib/utils/api-auth";

// Mock auth module
vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn(),
}));

import { validateAdminAuth } from "@/lib/utils/auth";
const mockValidateAdminAuth = validateAdminAuth as ReturnType<typeof vi.fn>;

// Helper to create mock request with just URL (getPaginationParams only uses request.url)
function createMockRequest(url: string) {
  return { url } as NextRequest;
}

describe("api-auth utilities", () => {
  describe("errorResponse", () => {
    it("should return JSON response with error message", () => {
      const response = errorResponse("Test error", 400);

      expect(response.status).toBe(400);
    });

    it("should default to status 400", () => {
      const response = errorResponse("Bad request");

      expect(response.status).toBe(400);
    });

    it("should return 401 for unauthorized", () => {
      const response = errorResponse("Unauthorized", 401);

      expect(response.status).toBe(401);
    });

    it("should return 500 for server error", () => {
      const response = errorResponse("Internal server error", 500);

      expect(response.status).toBe(500);
    });

    it("should return 404 for not found", () => {
      const response = errorResponse("Not found", 404);

      expect(response.status).toBe(404);
    });
  });

  describe("getPaginationParams", () => {
    it("should parse page and page_size from query params", () => {
      const request = createMockRequest("http://localhost/api?page=2&page_size=50");

      const result = getPaginationParams(request);

      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(50);
    });

    it("should default to page 1 and pageSize 20", () => {
      const request = createMockRequest("http://localhost/api");

      const result = getPaginationParams(request);

      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
    });

    it("should clamp page to minimum of 1", () => {
      const request = createMockRequest("http://localhost/api?page=-5");

      const result = getPaginationParams(request);

      expect(result.page).toBe(1);
    });

    it("should clamp page to minimum of 1 for zero", () => {
      const request = createMockRequest("http://localhost/api?page=0");

      const result = getPaginationParams(request);

      expect(result.page).toBe(1);
    });

    it("should clamp pageSize to maximum of 100", () => {
      const request = createMockRequest("http://localhost/api?page_size=200");

      const result = getPaginationParams(request);

      expect(result.pageSize).toBe(100);
    });

    it("should clamp pageSize to minimum of 1", () => {
      const request = createMockRequest("http://localhost/api?page_size=0");

      const result = getPaginationParams(request);

      expect(result.pageSize).toBe(1);
    });

    it("should handle invalid page value", () => {
      const request = createMockRequest("http://localhost/api?page=invalid");

      const result = getPaginationParams(request);

      expect(result.page).toBe(1);
    });

    it("should handle invalid page_size value", () => {
      const request = createMockRequest("http://localhost/api?page_size=invalid");

      const result = getPaginationParams(request);

      expect(result.pageSize).toBe(20);
    });

    it("should handle both params together", () => {
      const request = createMockRequest("http://localhost/api?page=5&page_size=25");

      const result = getPaginationParams(request);

      expect(result.page).toBe(5);
      expect(result.pageSize).toBe(25);
    });

    it("should handle float values by truncating", () => {
      const request = createMockRequest("http://localhost/api?page=2.8&page_size=30.5");

      const result = getPaginationParams(request);

      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(30);
    });
  });

  describe("withAdminAuth", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    const mockHandler = vi.fn().mockResolvedValue(NextResponse.json({ success: true }));

    it("calls handler when auth is valid", async () => {
      mockValidateAdminAuth.mockReturnValue(true);

      const wrappedHandler = withAdminAuth(mockHandler);
      const request = new NextRequest("http://localhost/api/test", {
        headers: { authorization: "Bearer valid-token" },
      });

      const response = await wrappedHandler(request, {});

      expect(mockHandler).toHaveBeenCalledWith(request, {});
      expect(response.status).toBe(200);
    });

    it("returns 401 when auth is invalid", async () => {
      mockValidateAdminAuth.mockReturnValue(false);

      const wrappedHandler = withAdminAuth(mockHandler);
      const request = new NextRequest("http://localhost/api/test");

      const response = await wrappedHandler(request, {});
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe("Unauthorized");
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it("passes authorization header to validateAdminAuth", async () => {
      mockValidateAdminAuth.mockReturnValue(true);

      const wrappedHandler = withAdminAuth(mockHandler);
      const request = new NextRequest("http://localhost/api/test", {
        headers: { authorization: "Bearer test-token" },
      });

      await wrappedHandler(request, {});

      expect(mockValidateAdminAuth).toHaveBeenCalledWith("Bearer test-token");
    });

    it("passes null when no authorization header", async () => {
      mockValidateAdminAuth.mockReturnValue(false);

      const wrappedHandler = withAdminAuth(mockHandler);
      const request = new NextRequest("http://localhost/api/test");

      await wrappedHandler(request, {});

      expect(mockValidateAdminAuth).toHaveBeenCalledWith(null);
    });

    it("passes context to handler", async () => {
      mockValidateAdminAuth.mockReturnValue(true);

      const wrappedHandler = withAdminAuth(mockHandler);
      const context = { params: { id: "123" } };
      const request = new NextRequest("http://localhost/api/test", {
        headers: { authorization: "Bearer token" },
      });

      await wrappedHandler(request, context);

      expect(mockHandler).toHaveBeenCalledWith(request, context);
    });
  });
});
