import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/admin/circuit-breakers/route";
import { db, circuitBreakerStates, upstreams } from "@/lib/db";
import { eq, desc, sql } from "drizzle-orm";

// Mock auth validation
vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-admin-token"),
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ column: a, value: b })),
  desc: vi.fn((col) => ({ column: col, direction: "desc" })),
  sql: vi.fn((strings, ...values) => ({ raw: strings.join("?"), values })),
}));

// Mock database with chainable query builder
const createMockQueryBuilder = () => {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    innerJoin: vi.fn(() => builder),
    orderBy: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    offset: vi.fn(() => Promise.resolve([])),
    select: vi.fn(() => builder),
  };
  return builder;
};

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => createMockQueryBuilder()),
  },
  circuitBreakerStates: {
    id: "id",
    upstreamId: "upstream_id",
    state: "state",
    failureCount: "failure_count",
    successCount: "success_count",
    lastFailureAt: "last_failure_at",
    openedAt: "opened_at",
    lastProbeAt: "last_probe_at",
    config: "config",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  upstreams: {
    id: "id",
    name: "name",
  },
}));

describe("GET /api/admin/circuit-breakers", () => {
  const mockCircuitBreakerStates = [
    {
      cb: {
        id: "cb-1",
        upstreamId: "upstream-1",
        state: "closed",
        failureCount: 0,
        successCount: 5,
        lastFailureAt: null,
        openedAt: null,
        lastProbeAt: null,
        config: { failureThreshold: 5, successThreshold: 3, openDuration: 60000 },
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-01"),
      },
      upstreamName: "OpenAI Upstream",
    },
    {
      cb: {
        id: "cb-2",
        upstreamId: "upstream-2",
        state: "open",
        failureCount: 5,
        successCount: 0,
        lastFailureAt: new Date("2024-01-02T10:00:00Z"),
        openedAt: new Date("2024-01-02T10:00:00Z"),
        lastProbeAt: null,
        config: null,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-02"),
      },
      upstreamName: "Anthropic Upstream",
    },
    {
      cb: {
        id: "cb-3",
        upstreamId: "upstream-3",
        state: "half_open",
        failureCount: 0,
        successCount: 1,
        lastFailureAt: null,
        openedAt: new Date("2024-01-02T09:00:00Z"),
        lastProbeAt: new Date("2024-01-02T10:30:00Z"),
        config: null,
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-02"),
      },
      upstreamName: "Google Upstream",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("should return 401 for invalid auth", async () => {
    const request = new Request("http://localhost/api/admin/circuit-breakers", {
      headers: { authorization: "Bearer invalid-token" },
    });

    const response = await GET(request);
    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 401 for missing auth", async () => {
    const request = new Request("http://localhost/api/admin/circuit-breakers");

    const response = await GET(request);
    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("should return all circuit breaker states with upstream names", async () => {
    // Mock count query returning [{ count: 3 }]
    const mockCountBuilder = {
      from: vi.fn(() => Promise.resolve([{ count: 3 }])),
    };

    // Mock data query
    const mockDataBuilder = {
      select: vi.fn(() => mockDataBuilder),
      from: vi.fn(() => mockDataBuilder),
      innerJoin: vi.fn(() => mockDataBuilder),
      where: vi.fn(() => mockDataBuilder),
      orderBy: vi.fn(() => mockDataBuilder),
      limit: vi.fn(() => mockDataBuilder),
      offset: vi.fn(() => Promise.resolve(mockCircuitBreakerStates)),
    };

    // First call (count) returns count builder, second call (data) returns data builder
    vi.mocked(db.select)
      .mockReturnValueOnce(mockCountBuilder as unknown as ReturnType<typeof db.select>)
      .mockReturnValueOnce(mockDataBuilder as unknown as ReturnType<typeof db.select>);

    const request = new Request("http://localhost/api/admin/circuit-breakers", {
      headers: { authorization: "Bearer valid-admin-token" },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.data).toHaveLength(3);
    expect(data.pagination.total).toBe(3);

    // Verify first item
    expect(data.data[0]).toMatchObject({
      id: "cb-1",
      upstream_id: "upstream-1",
      upstream_name: "OpenAI Upstream",
      state: "closed",
      failure_count: 0,
      success_count: 5,
    });

    // Verify second item (open state)
    expect(data.data[1]).toMatchObject({
      id: "cb-2",
      upstream_id: "upstream-2",
      upstream_name: "Anthropic Upstream",
      state: "open",
      failure_count: 5,
      success_count: 0,
    });
    expect(data.data[1].last_failure_at).toBe("2024-01-02T10:00:00.000Z");
    expect(data.data[1].opened_at).toBe("2024-01-02T10:00:00.000Z");

    // Verify third item (half_open state)
    expect(data.data[2]).toMatchObject({
      id: "cb-3",
      upstream_id: "upstream-3",
      upstream_name: "Google Upstream",
      state: "half_open",
      failure_count: 0,
      success_count: 1,
    });
    expect(data.data[2].last_probe_at).toBe("2024-01-02T10:30:00.000Z");
  });

  it("should filter by state parameter", async () => {
    const openStates = mockCircuitBreakerStates.filter((row) => row.cb.state === "open");

    // Mock count query with where method
    const mockCountBuilder = {
      from: vi.fn(() => mockCountBuilder),
      where: vi.fn(() => mockCountBuilder),
      then: vi.fn((resolve) => Promise.resolve([{ count: 1 }]).then(resolve)),
    };

    // Mock data query
    const mockDataBuilder = {
      select: vi.fn(() => mockDataBuilder),
      from: vi.fn(() => mockDataBuilder),
      innerJoin: vi.fn(() => mockDataBuilder),
      where: vi.fn(() => mockDataBuilder),
      orderBy: vi.fn(() => mockDataBuilder),
      limit: vi.fn(() => mockDataBuilder),
      offset: vi.fn(() => Promise.resolve(openStates)),
    };

    vi.mocked(db.select)
      .mockReturnValueOnce(mockCountBuilder as unknown as ReturnType<typeof db.select>)
      .mockReturnValueOnce(mockDataBuilder as unknown as ReturnType<typeof db.select>);

    const request = new Request("http://localhost/api/admin/circuit-breakers?state=open", {
      headers: { authorization: "Bearer valid-admin-token" },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.data).toHaveLength(1);
    expect(data.data[0].state).toBe("open");
    expect(data.data[0].upstream_id).toBe("upstream-2");
  });

  it("should support pagination", async () => {
    // Mock count query
    const mockCountBuilder = {
      from: vi.fn(() => Promise.resolve([{ count: 3 }])),
    };

    // Mock data query
    const mockDataBuilder = {
      select: vi.fn(() => mockDataBuilder),
      from: vi.fn(() => mockDataBuilder),
      innerJoin: vi.fn(() => mockDataBuilder),
      where: vi.fn(() => mockDataBuilder),
      orderBy: vi.fn(() => mockDataBuilder),
      limit: vi.fn(() => mockDataBuilder),
      offset: vi.fn(() => Promise.resolve(mockCircuitBreakerStates.slice(0, 2))),
    };

    vi.mocked(db.select)
      .mockReturnValueOnce(mockCountBuilder as unknown as ReturnType<typeof db.select>)
      .mockReturnValueOnce(mockDataBuilder as unknown as ReturnType<typeof db.select>);

    const request = new Request("http://localhost/api/admin/circuit-breakers?page=1&page_size=2", {
      headers: { authorization: "Bearer valid-admin-token" },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.data).toHaveLength(2);
    expect(data.pagination.page).toBe(1);
    expect(data.pagination.pageSize).toBe(2);
    expect(data.pagination.total).toBe(3);
  });

  it("should return empty array when no circuit breaker states exist", async () => {
    // Mock count query
    const mockCountBuilder = {
      from: vi.fn(() => Promise.resolve([{ count: 0 }])),
    };

    // Mock data query
    const mockDataBuilder = {
      select: vi.fn(() => mockDataBuilder),
      from: vi.fn(() => mockDataBuilder),
      innerJoin: vi.fn(() => mockDataBuilder),
      where: vi.fn(() => mockDataBuilder),
      orderBy: vi.fn(() => mockDataBuilder),
      limit: vi.fn(() => mockDataBuilder),
      offset: vi.fn(() => Promise.resolve([])),
    };

    vi.mocked(db.select)
      .mockReturnValueOnce(mockCountBuilder as unknown as ReturnType<typeof db.select>)
      .mockReturnValueOnce(mockDataBuilder as unknown as ReturnType<typeof db.select>);

    const request = new Request("http://localhost/api/admin/circuit-breakers", {
      headers: { authorization: "Bearer valid-admin-token" },
    });

    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.data).toEqual([]);
    expect(data.pagination.total).toBe(0);
  });

  it("should handle database errors gracefully", async () => {
    // Mock count query to throw error
    const mockCountBuilder = {
      from: vi.fn(() => Promise.reject(new Error("Database error"))),
    };

    vi.mocked(db.select).mockReturnValue(
      mockCountBuilder as unknown as ReturnType<typeof db.select>
    );

    const request = new Request("http://localhost/api/admin/circuit-breakers", {
      headers: { authorization: "Bearer valid-admin-token" },
    });

    const response = await GET(request);
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.error).toBe("Internal server error");
  });
});
