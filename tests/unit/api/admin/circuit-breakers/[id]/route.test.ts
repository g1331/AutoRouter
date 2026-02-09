import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/admin/circuit-breakers/[id]/route";
import { db } from "@/lib/db";

// Mock auth validation
vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-admin-token"),
}));

// Mock database
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      upstreams: {
        findFirst: vi.fn(),
      },
      circuitBreakerStates: {
        findFirst: vi.fn(),
      },
    },
  },
  circuitBreakerStates: {},
  upstreams: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ column: a, value: b })),
}));

describe("GET /api/admin/circuit-breakers/{upstreamId}", () => {
  const mockUpstream = {
    id: "upstream-1",
    name: "OpenAI Upstream",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-02"),
  };

  const mockCircuitBreakerState = {
    id: "cb-1",
    upstreamId: "upstream-1",
    state: "open",
    failureCount: 5,
    successCount: 0,
    lastFailureAt: new Date("2024-01-02T10:00:00Z"),
    openedAt: new Date("2024-01-02T10:00:00Z"),
    lastProbeAt: null,
    config: { failureThreshold: 5, successThreshold: 3, openDuration: 60000 },
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
    const request = new Request("http://localhost/api/admin/circuit-breakers/upstream-1", {
      headers: { authorization: "Bearer invalid-token" },
    });

    const response = await GET(request, { params: Promise.resolve({ id: "upstream-1" }) });
    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 404 when upstream does not exist", async () => {
    vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(null);

    const request = new Request("http://localhost/api/admin/circuit-breakers/non-existent", {
      headers: { authorization: "Bearer valid-admin-token" },
    });

    const response = await GET(request, { params: Promise.resolve({ id: "non-existent" }) });
    expect(response.status).toBe(404);

    const data = await response.json();
    expect(data.error).toBe("Upstream not found");
  });

  it("should return default closed state when circuit breaker is not initialized", async () => {
    vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);
    vi.mocked(db.query.circuitBreakerStates.findFirst).mockResolvedValue(null);

    const request = new Request("http://localhost/api/admin/circuit-breakers/upstream-1", {
      headers: { authorization: "Bearer valid-admin-token" },
    });

    const response = await GET(request, { params: Promise.resolve({ id: "upstream-1" }) });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.data).toMatchObject({
      id: "",
      upstream_id: "upstream-1",
      upstream_name: "OpenAI Upstream",
      state: "closed",
      failure_count: 0,
      success_count: 0,
      last_failure_at: null,
      opened_at: null,
      last_probe_at: null,
      config: null,
    });
  });

  it("should return existing circuit breaker state", async () => {
    vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);
    vi.mocked(db.query.circuitBreakerStates.findFirst).mockResolvedValue(mockCircuitBreakerState);

    const request = new Request("http://localhost/api/admin/circuit-breakers/upstream-1", {
      headers: { authorization: "Bearer valid-admin-token" },
    });

    const response = await GET(request, { params: Promise.resolve({ id: "upstream-1" }) });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.data).toMatchObject({
      id: "cb-1",
      upstream_id: "upstream-1",
      upstream_name: "OpenAI Upstream",
      state: "open",
      failure_count: 5,
      success_count: 0,
    });
    expect(data.data.last_failure_at).toBe("2024-01-02T10:00:00.000Z");
    expect(data.data.opened_at).toBe("2024-01-02T10:00:00.000Z");
    expect(data.data.config).toEqual({
      failure_threshold: 5,
      success_threshold: 3,
      open_duration: 60,
    });
  });

  it("should return half_open state correctly", async () => {
    const halfOpenState = {
      ...mockCircuitBreakerState,
      state: "half_open",
      failureCount: 0,
      successCount: 2,
      lastProbeAt: new Date("2024-01-02T11:00:00Z"),
    };

    vi.mocked(db.query.upstreams.findFirst).mockResolvedValue(mockUpstream);
    vi.mocked(db.query.circuitBreakerStates.findFirst).mockResolvedValue(halfOpenState);

    const request = new Request("http://localhost/api/admin/circuit-breakers/upstream-1", {
      headers: { authorization: "Bearer valid-admin-token" },
    });

    const response = await GET(request, { params: Promise.resolve({ id: "upstream-1" }) });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.data.state).toBe("half_open");
    expect(data.data.success_count).toBe(2);
    expect(data.data.last_probe_at).toBe("2024-01-02T11:00:00.000Z");
  });

  it("should handle database errors gracefully", async () => {
    vi.mocked(db.query.upstreams.findFirst).mockRejectedValue(new Error("Database error"));

    const request = new Request("http://localhost/api/admin/circuit-breakers/upstream-1", {
      headers: { authorization: "Bearer valid-admin-token" },
    });

    const response = await GET(request, { params: Promise.resolve({ id: "upstream-1" }) });
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.error).toBe("Internal server error");
  });
});
