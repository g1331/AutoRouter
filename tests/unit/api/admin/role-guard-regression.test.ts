import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Regression guard for the admin route auth migration (task group 5): every
// /api/admin/* route now delegates to the real requireAdmin guard instead of an
// inline validateAdminAuth check. This suite exercises a representative route
// (stats/overview) end-to-end with the REAL requireAdmin — only its underlying
// dependencies (JWT verification, the user lookup, the ADMIN_TOKEN config) and
// the route's own service are mocked — to confirm the three identity classes:
// the ADMIN_TOKEN super-admin and an admin user pass (behavior unchanged), a
// member is rejected with 403, and an unauthenticated request with 401. The
// pure role logic itself is covered in tests/unit/utils/authenticate.test.ts;
// this suite proves a real route wires the guard up and propagates its result.

const mockVerifyUserToken = vi.fn();
vi.mock("@/lib/utils/jwt", () => ({
  verifyUserToken: (...args: unknown[]) => mockVerifyUserToken(...args),
  verifyAdminSessionToken: vi.fn().mockResolvedValue(false),
}));

const mockLimit = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: (...args: unknown[]) => mockLimit(...args),
        }),
      }),
    }),
  },
  users: {
    id: "id",
    role: "role",
    username: "username",
    isActive: "is_active",
  },
}));

vi.mock("@/lib/utils/config", () => ({
  config: { adminToken: "test-admin-token", dbType: "postgres" },
  validateAdminToken: (token: string | null) => token === "test-admin-token",
}));

const mockGetOverviewStats = vi.fn();
vi.mock("@/lib/services/stats-service", () => ({
  getOverviewStats: (...args: unknown[]) => mockGetOverviewStats(...args),
}));

vi.mock("@/lib/utils/api-transformers", () => ({
  transformStatsOverviewToApi: vi.fn(() => ({ ok: true })),
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { GET } from "@/app/api/admin/stats/overview/route";

function makeRequest(authHeader: string | null): NextRequest {
  const headers = new Headers();
  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  return new NextRequest("http://localhost/api/admin/stats/overview", { headers });
}

describe("admin route role-guard regression (stats/overview as representative)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOverviewStats.mockResolvedValue({});
  });

  it("allows the ADMIN_TOKEN super-admin without a DB lookup (behavior unchanged)", async () => {
    const response = await GET(makeRequest("Bearer test-admin-token"));
    expect(response.status).toBe(200);
    expect(mockGetOverviewStats).toHaveBeenCalled();
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it("allows an admin user", async () => {
    mockVerifyUserToken.mockResolvedValue({ userId: "u1", role: "admin" });
    mockLimit.mockResolvedValue([{ id: "u1", role: "admin", username: "a", isActive: true }]);
    const response = await GET(makeRequest("Bearer admin-jwt"));
    expect(response.status).toBe(200);
    expect(mockGetOverviewStats).toHaveBeenCalled();
  });

  it("rejects a member with 403 and never reaches the business logic", async () => {
    mockVerifyUserToken.mockResolvedValue({ userId: "u2", role: "member" });
    mockLimit.mockResolvedValue([{ id: "u2", role: "member", username: "m", isActive: true }]);
    const response = await GET(makeRequest("Bearer member-jwt"));
    expect(response.status).toBe(403);
    expect(mockGetOverviewStats).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request with 401", async () => {
    const response = await GET(makeRequest(null));
    expect(response.status).toBe(401);
    expect(mockGetOverviewStats).not.toHaveBeenCalled();
  });
});
