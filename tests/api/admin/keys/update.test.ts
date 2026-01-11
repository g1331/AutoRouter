import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the auth utilities
vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn(),
}));

// Mock the key-manager service
vi.mock("@/lib/services/key-manager", () => ({
  updateApiKey: vi.fn(),
  ApiKeyNotFoundError: class ApiKeyNotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ApiKeyNotFoundError";
    }
  },
}));

describe("PUT /api/admin/keys/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    const { validateAdminAuth } = await import("@/lib/utils/auth");
    const { PUT } = await import("@/app/api/admin/keys/[id]/route");

    vi.mocked(validateAdminAuth).mockReturnValue(false);

    const request = new NextRequest("http://localhost:3000/api/admin/keys/key-1", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Updated Name" }),
    });

    const context = { params: Promise.resolve({ id: "key-1" }) };
    const response = await PUT(request, context);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 400 for validation errors", async () => {
    const { validateAdminAuth } = await import("@/lib/utils/auth");
    const { PUT } = await import("@/app/api/admin/keys/[id]/route");

    vi.mocked(validateAdminAuth).mockReturnValue(true);

    const request = new NextRequest("http://localhost:3000/api/admin/keys/key-1", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "" }), // Empty name should fail validation
    });

    const context = { params: Promise.resolve({ id: "key-1" }) };
    const response = await PUT(request, context);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Validation error");
  });

  it("should return 404 when API key not found", async () => {
    const { validateAdminAuth } = await import("@/lib/utils/auth");
    const { updateApiKey, ApiKeyNotFoundError } = await import("@/lib/services/key-manager");
    const { PUT } = await import("@/app/api/admin/keys/[id]/route");

    vi.mocked(validateAdminAuth).mockReturnValue(true);
    vi.mocked(updateApiKey).mockRejectedValue(new ApiKeyNotFoundError("API key not found"));

    const request = new NextRequest("http://localhost:3000/api/admin/keys/non-existent", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Updated Name" }),
    });

    const context = { params: Promise.resolve({ id: "non-existent" }) };
    const response = await PUT(request, context);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("API key not found");
  });

  it("should successfully update API key name", async () => {
    const { validateAdminAuth } = await import("@/lib/utils/auth");
    const { updateApiKey } = await import("@/lib/services/key-manager");
    const { PUT } = await import("@/app/api/admin/keys/[id]/route");

    const mockUpdatedKey = {
      id: "key-1",
      keyPrefix: "sk-auto-test",
      name: "Updated Name",
      description: "Test description",
      upstreamIds: ["upstream-1"],
      isActive: true,
      expiresAt: null,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-02T00:00:00Z"),
    };

    vi.mocked(validateAdminAuth).mockReturnValue(true);
    vi.mocked(updateApiKey).mockResolvedValue(mockUpdatedKey);

    const request = new NextRequest("http://localhost:3000/api/admin/keys/key-1", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Updated Name" }),
    });

    const context = { params: Promise.resolve({ id: "key-1" }) };
    const response = await PUT(request, context);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      id: "key-1",
      key_prefix: "sk-auto-test",
      name: "Updated Name",
      description: "Test description",
      upstream_ids: ["upstream-1"],
      is_active: true,
      expires_at: null,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-02T00:00:00.000Z",
    });
  });

  it("should successfully update API key description", async () => {
    const { validateAdminAuth } = await import("@/lib/utils/auth");
    const { updateApiKey } = await import("@/lib/services/key-manager");
    const { PUT } = await import("@/app/api/admin/keys/[id]/route");

    const mockUpdatedKey = {
      id: "key-1",
      keyPrefix: "sk-auto-test",
      name: "Test Key",
      description: "Updated description",
      upstreamIds: ["upstream-1"],
      isActive: true,
      expiresAt: null,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-02T00:00:00Z"),
    };

    vi.mocked(validateAdminAuth).mockReturnValue(true);
    vi.mocked(updateApiKey).mockResolvedValue(mockUpdatedKey);

    const request = new NextRequest("http://localhost:3000/api/admin/keys/key-1", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ description: "Updated description" }),
    });

    const context = { params: Promise.resolve({ id: "key-1" }) };
    const response = await PUT(request, context);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.description).toBe("Updated description");
  });

  it("should successfully update upstream permissions", async () => {
    const { validateAdminAuth } = await import("@/lib/utils/auth");
    const { updateApiKey } = await import("@/lib/services/key-manager");
    const { PUT } = await import("@/app/api/admin/keys/[id]/route");

    const mockUpdatedKey = {
      id: "key-1",
      keyPrefix: "sk-auto-test",
      name: "Test Key",
      description: null,
      upstreamIds: ["upstream-1", "upstream-2"],
      isActive: true,
      expiresAt: null,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-02T00:00:00Z"),
    };

    vi.mocked(validateAdminAuth).mockReturnValue(true);
    vi.mocked(updateApiKey).mockResolvedValue(mockUpdatedKey);

    const request = new NextRequest("http://localhost:3000/api/admin/keys/key-1", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ upstream_ids: ["upstream-1", "upstream-2"] }),
    });

    const context = { params: Promise.resolve({ id: "key-1" }) };
    const response = await PUT(request, context);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.upstream_ids).toEqual(["upstream-1", "upstream-2"]);
    expect(updateApiKey).toHaveBeenCalledWith("key-1", {
      upstreamIds: ["upstream-1", "upstream-2"],
    });
  });

  it("should successfully update isActive status", async () => {
    const { validateAdminAuth } = await import("@/lib/utils/auth");
    const { updateApiKey } = await import("@/lib/services/key-manager");
    const { PUT } = await import("@/app/api/admin/keys/[id]/route");

    const mockUpdatedKey = {
      id: "key-1",
      keyPrefix: "sk-auto-test",
      name: "Test Key",
      description: null,
      upstreamIds: ["upstream-1"],
      isActive: false,
      expiresAt: null,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-02T00:00:00Z"),
    };

    vi.mocked(validateAdminAuth).mockReturnValue(true);
    vi.mocked(updateApiKey).mockResolvedValue(mockUpdatedKey);

    const request = new NextRequest("http://localhost:3000/api/admin/keys/key-1", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ is_active: false }),
    });

    const context = { params: Promise.resolve({ id: "key-1" }) };
    const response = await PUT(request, context);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.is_active).toBe(false);
    expect(updateApiKey).toHaveBeenCalledWith("key-1", { isActive: false });
  });

  it("should successfully update expiration date", async () => {
    const { validateAdminAuth } = await import("@/lib/utils/auth");
    const { updateApiKey } = await import("@/lib/services/key-manager");
    const { PUT } = await import("@/app/api/admin/keys/[id]/route");

    const expiresAt = new Date("2024-12-31T23:59:59Z");
    const mockUpdatedKey = {
      id: "key-1",
      keyPrefix: "sk-auto-test",
      name: "Test Key",
      description: null,
      upstreamIds: ["upstream-1"],
      isActive: true,
      expiresAt,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-02T00:00:00Z"),
    };

    vi.mocked(validateAdminAuth).mockReturnValue(true);
    vi.mocked(updateApiKey).mockResolvedValue(mockUpdatedKey);

    const request = new NextRequest("http://localhost:3000/api/admin/keys/key-1", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ expires_at: "2024-12-31T23:59:59Z" }),
    });

    const context = { params: Promise.resolve({ id: "key-1" }) };
    const response = await PUT(request, context);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.expires_at).toBe("2024-12-31T23:59:59.000Z");
  });

  it("should successfully clear expiration date with null", async () => {
    const { validateAdminAuth } = await import("@/lib/utils/auth");
    const { updateApiKey } = await import("@/lib/services/key-manager");
    const { PUT } = await import("@/app/api/admin/keys/[id]/route");

    const mockUpdatedKey = {
      id: "key-1",
      keyPrefix: "sk-auto-test",
      name: "Test Key",
      description: null,
      upstreamIds: ["upstream-1"],
      isActive: true,
      expiresAt: null,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-02T00:00:00Z"),
    };

    vi.mocked(validateAdminAuth).mockReturnValue(true);
    vi.mocked(updateApiKey).mockResolvedValue(mockUpdatedKey);

    const request = new NextRequest("http://localhost:3000/api/admin/keys/key-1", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ expires_at: null }),
    });

    const context = { params: Promise.resolve({ id: "key-1" }) };
    const response = await PUT(request, context);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.expires_at).toBeNull();
    expect(updateApiKey).toHaveBeenCalledWith("key-1", { expiresAt: null });
  });

  it("should successfully update multiple fields at once", async () => {
    const { validateAdminAuth } = await import("@/lib/utils/auth");
    const { updateApiKey } = await import("@/lib/services/key-manager");
    const { PUT } = await import("@/app/api/admin/keys/[id]/route");

    const mockUpdatedKey = {
      id: "key-1",
      keyPrefix: "sk-auto-test",
      name: "Updated Name",
      description: "Updated description",
      upstreamIds: ["upstream-1", "upstream-2"],
      isActive: false,
      expiresAt: null,
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-02T00:00:00Z"),
    };

    vi.mocked(validateAdminAuth).mockReturnValue(true);
    vi.mocked(updateApiKey).mockResolvedValue(mockUpdatedKey);

    const request = new NextRequest("http://localhost:3000/api/admin/keys/key-1", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Updated Name",
        description: "Updated description",
        upstream_ids: ["upstream-1", "upstream-2"],
        is_active: false,
      }),
    });

    const context = { params: Promise.resolve({ id: "key-1" }) };
    const response = await PUT(request, context);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.name).toBe("Updated Name");
    expect(data.description).toBe("Updated description");
    expect(data.upstream_ids).toEqual(["upstream-1", "upstream-2"]);
    expect(data.is_active).toBe(false);
    expect(updateApiKey).toHaveBeenCalledWith("key-1", {
      name: "Updated Name",
      description: "Updated description",
      upstreamIds: ["upstream-1", "upstream-2"],
      isActive: false,
    });
  });

  it("should return 500 for generic errors", async () => {
    const { validateAdminAuth } = await import("@/lib/utils/auth");
    const { updateApiKey } = await import("@/lib/services/key-manager");
    const { PUT } = await import("@/app/api/admin/keys/[id]/route");

    vi.mocked(validateAdminAuth).mockReturnValue(true);
    vi.mocked(updateApiKey).mockRejectedValue(new Error("Database connection failed"));

    const request = new NextRequest("http://localhost:3000/api/admin/keys/key-1", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Updated Name" }),
    });

    const context = { params: Promise.resolve({ id: "key-1" }) };
    const response = await PUT(request, context);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("Database connection failed");
  });

  it("should return correct response format with snake_case fields", async () => {
    const { validateAdminAuth } = await import("@/lib/utils/auth");
    const { updateApiKey } = await import("@/lib/services/key-manager");
    const { PUT } = await import("@/app/api/admin/keys/[id]/route");

    const mockUpdatedKey = {
      id: "key-1",
      keyPrefix: "sk-auto-test",
      name: "Test Key",
      description: "Test description",
      upstreamIds: ["upstream-1"],
      isActive: true,
      expiresAt: new Date("2024-12-31T23:59:59Z"),
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-02T00:00:00Z"),
    };

    vi.mocked(validateAdminAuth).mockReturnValue(true);
    vi.mocked(updateApiKey).mockResolvedValue(mockUpdatedKey);

    const request = new NextRequest("http://localhost:3000/api/admin/keys/key-1", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Test Key" }),
    });

    const context = { params: Promise.resolve({ id: "key-1" }) };
    const response = await PUT(request, context);

    expect(response.status).toBe(200);
    const data = await response.json();

    // Verify snake_case field names
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("key_prefix");
    expect(data).toHaveProperty("name");
    expect(data).toHaveProperty("description");
    expect(data).toHaveProperty("upstream_ids");
    expect(data).toHaveProperty("is_active");
    expect(data).toHaveProperty("expires_at");
    expect(data).toHaveProperty("created_at");
    expect(data).toHaveProperty("updated_at");

    // Verify no camelCase fields
    expect(data).not.toHaveProperty("keyPrefix");
    expect(data).not.toHaveProperty("upstreamIds");
    expect(data).not.toHaveProperty("isActive");
    expect(data).not.toHaveProperty("expiresAt");
    expect(data).not.toHaveProperty("createdAt");
    expect(data).not.toHaveProperty("updatedAt");
  });
});
