import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/admin/circuit-breakers/[id]/force-open/route";
import { db } from "@/lib/db";
import { forceOpen } from "@/lib/services/circuit-breaker";

// Mock admin authorization: the route now calls requireAdmin (the role-aware
// guard) instead of validateAdminAuth. importActual keeps errorResponse and
// getPaginationParams real so response shapes are unchanged; only the gate
// decision is driven by the request token.
vi.mock("@/lib/utils/api-auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/utils/api-auth")>();
  return {
    ...actual,
    requireAdmin: vi.fn(async (request: Request) => {
      const authHeader = request.headers.get("authorization");
      if (authHeader === "Bearer valid-admin-token") {
        return { kind: "admin_token" };
      }
      return actual.errorResponse("Unauthorized", 401);
    }),
  };
});

// Mock circuit breaker service
vi.mock("@/lib/services/circuit-breaker", () => ({
  forceOpen: vi.fn(),
}));

// Mock database
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      upstreams: {
        findFirst: vi.fn(),
      },
    },
  },
  upstreams: {},
}));

describe("POST /api/admin/circuit-breakers/{upstreamId}/force-open", () => {
  const mockUpstream = {
    id: "upstream-1",
    name: "OpenAI Upstream",
    providerType: "openai",
    baseUrl: "https://api.openai.com",
    apiKeyEncrypted: "encrypted-key",
    isDefault: true,
    timeout: 30000,
    isActive: true,
    config: null,
    priority: 0,
    weight: 100,
    healthCheckInterval: 60,
    healthCheckTimeout: 10,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-02"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should return 401 for invalid auth", async () => {
    const request = new Request(
      "http://localhost/api/admin/circuit-breakers/upstream-1/force-open",
      {
        method: "POST",
        headers: { authorization: "Bearer invalid-token" },
      }
    );

    const response = await POST(request, { params: Promise.resolve({ id: "upstream-1" }) });
    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 404 when upstream does not exist", async () => {
    vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

    const request = new Request(
      "http://localhost/api/admin/circuit-breakers/non-existent/force-open",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-admin-token" },
      }
    );

    const response = await POST(request, { params: Promise.resolve({ id: "non-existent" }) });
    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data.error).toBe("Upstream not found");
  });

  it("should force open circuit breaker successfully", async () => {
    vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);
    vi.mocked(forceOpen).mockResolvedValue(undefined);

    const request = new Request(
      "http://localhost/api/admin/circuit-breakers/upstream-1/force-open",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-admin-token" },
      }
    );

    const response = await POST(request, { params: Promise.resolve({ id: "upstream-1" }) });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toMatchObject({
      success: true,
      message: "Circuit breaker forced to OPEN for upstream 'OpenAI Upstream'",
      upstream_id: "upstream-1",
      upstream_name: "OpenAI Upstream",
      action: "force_open",
    });

    // Verify forceOpen was called with correct upstream ID
    expect(forceOpen).toHaveBeenCalledWith("upstream-1");
    expect(forceOpen).toHaveBeenCalledTimes(1);
  });

  it("should handle forceOpen errors gracefully", async () => {
    vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);
    vi.mocked(forceOpen).mockRejectedValue(new Error("Failed to force open"));

    const request = new Request(
      "http://localhost/api/admin/circuit-breakers/upstream-1/force-open",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-admin-token" },
      }
    );

    const response = await POST(request, { params: Promise.resolve({ id: "upstream-1" }) });
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.error).toBe("Internal server error");
  });

  it("should handle database errors gracefully", async () => {
    vi.mocked(db.query.upstreams.findFirst).mockRejectedValue(new Error("Database error"));

    const request = new Request(
      "http://localhost/api/admin/circuit-breakers/upstream-1/force-open",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-admin-token" },
      }
    );

    const response = await POST(request, { params: Promise.resolve({ id: "upstream-1" }) });
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.error).toBe("Internal server error");
  });
});
