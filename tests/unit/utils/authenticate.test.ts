import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// verifyUserToken is mocked so these tests exercise authenticate's own logic
// (token extraction, ADMIN_TOKEN compare, DB lookup, role/active resolution)
// without depending on real JWT key material.
const mockVerifyUserToken = vi.fn();
vi.mock("@/lib/utils/jwt", () => ({
  verifyUserToken: (...args: unknown[]) => mockVerifyUserToken(...args),
}));

// mockSelect captures the selected columns so a test can guard against silently
// dropping a column the auth decision depends on; mockLimit yields the rows.
const mockSelect = vi.fn(() => ({
  from: () => ({
    where: () => ({
      limit: (...args: unknown[]) => mockLimit(...args),
    }),
  }),
}));
const mockLimit = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock("@/lib/utils/config", () => ({
  config: { adminToken: "test-admin-token", dbType: "postgres" },
  validateAdminToken: (token: string | null) => token === "test-admin-token",
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { authenticate, requireAdmin, requireUser } from "@/lib/utils/api-auth";
import { config } from "@/lib/utils/config";

function makeRequest(authHeader: string | null): NextRequest {
  const headers = new Headers();
  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  return new NextRequest("http://localhost/api/admin/x", { headers });
}

describe("authenticate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null without an Authorization header", async () => {
    expect(await authenticate(makeRequest(null))).toBeNull();
    expect(mockVerifyUserToken).not.toHaveBeenCalled();
  });

  it("recognizes a Bearer ADMIN_TOKEN as super-admin without a DB lookup", async () => {
    const principal = await authenticate(makeRequest("Bearer test-admin-token"));
    expect(principal).toEqual({ kind: "admin_token" });
    expect(mockVerifyUserToken).not.toHaveBeenCalled();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("accepts a raw (non-Bearer) ADMIN_TOKEN", async () => {
    const principal = await authenticate(makeRequest("test-admin-token"));
    expect(principal).toEqual({ kind: "admin_token" });
    expect(mockVerifyUserToken).not.toHaveBeenCalled();
  });

  it("does not treat any token as admin_token when ADMIN_TOKEN is unconfigured", async () => {
    mockVerifyUserToken.mockResolvedValue(null);
    const original = config.adminToken;
    (config as { adminToken?: string }).adminToken = "";
    try {
      expect(await authenticate(makeRequest("Bearer anything"))).toBeNull();
    } finally {
      (config as { adminToken?: string }).adminToken = original;
    }
  });

  it("resolves a valid JWT to a user principal and selects the expected columns", async () => {
    mockVerifyUserToken.mockResolvedValue({ userId: "u1", role: "admin" });
    mockLimit.mockResolvedValue([{ id: "u1", role: "admin", username: "alice", isActive: true }]);
    const principal = await authenticate(makeRequest("Bearer jwt"));
    expect(principal).toEqual({
      kind: "user",
      userId: "u1",
      role: "admin",
      username: "alice",
    });
    // Guard against silently dropping a column the auth decision depends on.
    expect(Object.keys(mockSelect.mock.calls[0][0] as object)).toEqual([
      "id",
      "role",
      "username",
      "isActive",
    ]);
  });

  it("uses the DB role over the JWT payload role (demotion takes effect)", async () => {
    mockVerifyUserToken.mockResolvedValue({ userId: "u1", role: "admin" });
    mockLimit.mockResolvedValue([{ id: "u1", role: "member", username: "bob", isActive: true }]);
    const principal = await authenticate(makeRequest("Bearer jwt"));
    expect(principal).toMatchObject({ kind: "user", role: "member" });
  });

  it("rejects a token for a deactivated user", async () => {
    mockVerifyUserToken.mockResolvedValue({ userId: "u1", role: "member" });
    mockLimit.mockResolvedValue([{ id: "u1", role: "member", username: "bob", isActive: false }]);
    expect(await authenticate(makeRequest("Bearer jwt"))).toBeNull();
  });

  it("rejects a token for a deleted user", async () => {
    mockVerifyUserToken.mockResolvedValue({ userId: "u1", role: "member" });
    mockLimit.mockResolvedValue([]);
    expect(await authenticate(makeRequest("Bearer jwt"))).toBeNull();
  });

  it("rejects an invalid or expired JWT without a DB lookup", async () => {
    mockVerifyUserToken.mockResolvedValue(null);
    expect(await authenticate(makeRequest("Bearer bad"))).toBeNull();
    expect(mockSelect).not.toHaveBeenCalled();
  });
});

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes the ADMIN_TOKEN super-admin", async () => {
    const result = await requireAdmin(makeRequest("Bearer test-admin-token"));
    expect(result).toEqual({ kind: "admin_token" });
  });

  it("passes an admin user", async () => {
    mockVerifyUserToken.mockResolvedValue({ userId: "u1", role: "admin" });
    mockLimit.mockResolvedValue([{ id: "u1", role: "admin", username: "a", isActive: true }]);
    const result = await requireAdmin(makeRequest("Bearer jwt"));
    expect(result).toMatchObject({ kind: "user", role: "admin" });
  });

  it("rejects a member with 403", async () => {
    mockVerifyUserToken.mockResolvedValue({ userId: "u1", role: "member" });
    mockLimit.mockResolvedValue([{ id: "u1", role: "member", username: "m", isActive: true }]);
    const result = await requireAdmin(makeRequest("Bearer jwt"));
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(403);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const result = await requireAdmin(makeRequest(null));
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("rejects a demoted admin's stale token with 403", async () => {
    mockVerifyUserToken.mockResolvedValue({ userId: "u1", role: "admin" });
    mockLimit.mockResolvedValue([{ id: "u1", role: "member", username: "m", isActive: true }]);
    const result = await requireAdmin(makeRequest("Bearer jwt"));
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(403);
  });

  it("returns 500 when the user lookup throws", async () => {
    mockVerifyUserToken.mockResolvedValue({ userId: "u1", role: "member" });
    mockLimit.mockRejectedValue(new Error("db down"));
    const result = await requireAdmin(makeRequest("Bearer jwt"));
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(500);
  });
});

describe("requireUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes a member user and carries the userId", async () => {
    mockVerifyUserToken.mockResolvedValue({ userId: "u1", role: "member" });
    mockLimit.mockResolvedValue([{ id: "u1", role: "member", username: "m", isActive: true }]);
    const result = await requireUser(makeRequest("Bearer jwt"));
    expect(result).toMatchObject({ kind: "user", userId: "u1", role: "member" });
  });

  it("passes an admin user and carries the userId", async () => {
    mockVerifyUserToken.mockResolvedValue({ userId: "u9", role: "admin" });
    mockLimit.mockResolvedValue([{ id: "u9", role: "admin", username: "adm", isActive: true }]);
    const result = await requireUser(makeRequest("Bearer jwt"));
    expect(result).toMatchObject({ kind: "user", userId: "u9", role: "admin" });
  });

  it("passes the ADMIN_TOKEN super-admin", async () => {
    const result = await requireUser(makeRequest("Bearer test-admin-token"));
    expect(result).toEqual({ kind: "admin_token" });
  });

  it("rejects an unauthenticated request with 401", async () => {
    const result = await requireUser(makeRequest(null));
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("returns 500 when the user lookup throws", async () => {
    mockVerifyUserToken.mockResolvedValue({ userId: "u1", role: "member" });
    mockLimit.mockRejectedValue(new Error("db down"));
    const result = await requireUser(makeRequest("Bearer jwt"));
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(500);
  });
});
