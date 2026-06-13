import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

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
    displayName: "display_name",
  },
}));

// requireUser is mocked to drive the four principal cases; errorResponse stays
// real so the 401/404 shapes match production.
const mockRequireUser = vi.fn();
vi.mock("@/lib/utils/api-auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/utils/api-auth")>();
  return {
    ...actual,
    requireUser: (...args: unknown[]) => mockRequireUser(...args),
  };
});

import { GET } from "@/app/api/auth/me/route";

function meRequest(): NextRequest {
  return new NextRequest("http://localhost/api/auth/me");
}

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the profile for a user principal, loading the display name", async () => {
    mockRequireUser.mockResolvedValue({
      kind: "user",
      userId: "u1",
      role: "member",
      username: "alice",
    });
    mockLimit.mockResolvedValue([{ displayName: "Alice" }]);

    const response = await GET(meRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      kind: "user",
      id: "u1",
      username: "alice",
      displayName: "Alice",
      role: "member",
    });
  });

  it("reports the ADMIN_TOKEN super-admin without a DB lookup", async () => {
    mockRequireUser.mockResolvedValue({ kind: "admin_token" });

    const response = await GET(meRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ kind: "admin_token", role: "admin" });
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it("propagates the 401 from requireUser when unauthenticated", async () => {
    mockRequireUser.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const response = await GET(meRequest());
    expect(response.status).toBe(401);
    expect(mockLimit).not.toHaveBeenCalled();
  });

  it("returns 404 when the user row disappeared between checks", async () => {
    mockRequireUser.mockResolvedValue({
      kind: "user",
      userId: "u1",
      role: "member",
      username: "alice",
    });
    mockLimit.mockResolvedValue([]);

    const response = await GET(meRequest());
    expect(response.status).toBe(404);
  });
});
