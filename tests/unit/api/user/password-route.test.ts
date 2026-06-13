import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Route-layer tests for the self-service password change endpoint. The
// current-password verification and strength rule run against a real database
// in tests/unit/services/user-service.test.ts; here the service is mocked so
// these tests focus on the route concerns: the requireMember guard, the forced
// target (always the authenticated principal), and the error-to-status mapping
// (InvalidCredentialsError → 400, WeakPasswordError → 400).

vi.mock("@/lib/utils/api-auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/utils/api-auth")>();
  return {
    ...actual,
    requireMember: vi.fn(async (request: Request) => {
      const authHeader = request.headers.get("authorization");
      if (authHeader === "Bearer member-token") {
        return { kind: "user", userId: SELF_ID, role: "member", username: "alice" };
      }
      if (authHeader === "Bearer valid-admin-token") {
        return actual.errorResponse("Admin token has no personal data scope", 403);
      }
      return actual.errorResponse("Unauthorized", 401);
    }),
  };
});

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("@/lib/services/user-service", () => {
  class InvalidCredentialsError extends Error {}
  class WeakPasswordError extends Error {}
  return {
    changeOwnPassword: vi.fn(),
    InvalidCredentialsError,
    WeakPasswordError,
  };
});

import * as userService from "@/lib/services/user-service";
import { InvalidCredentialsError, WeakPasswordError } from "@/lib/services/user-service";
import { PUT as passwordRoute } from "@/app/api/user/password/route";

const SELF_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER = "Bearer member-token";
const ADMIN_TOKEN = "Bearer valid-admin-token";

function makeRequest(authHeader: string | null, body?: unknown): NextRequest {
  const headers = new Headers();
  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  return new NextRequest("http://localhost/api/user/password", {
    headers,
    method: "PUT",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PUT /api/user/password", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await passwordRoute(makeRequest(null, {}));
    expect(res.status).toBe(401);
    expect(userService.changeOwnPassword).not.toHaveBeenCalled();
  });

  it("rejects the ADMIN_TOKEN identity with 403", async () => {
    const res = await passwordRoute(makeRequest(ADMIN_TOKEN, {}));
    expect(res.status).toBe(403);
    expect(userService.changeOwnPassword).not.toHaveBeenCalled();
  });

  it("changes the caller's own password and returns 204", async () => {
    vi.mocked(userService.changeOwnPassword).mockResolvedValue(undefined);

    const res = await passwordRoute(
      makeRequest(MEMBER, { current_password: "password123", new_password: "newpassword123" })
    );
    expect(res.status).toBe(204);
    expect(userService.changeOwnPassword).toHaveBeenCalledWith(
      SELF_ID,
      "password123",
      "newpassword123"
    );
  });

  it("rejects a body missing the passwords with 400", async () => {
    const res = await passwordRoute(makeRequest(MEMBER, { current_password: "password123" }));
    expect(res.status).toBe(400);
    expect(userService.changeOwnPassword).not.toHaveBeenCalled();
  });

  it("maps InvalidCredentialsError to 400", async () => {
    vi.mocked(userService.changeOwnPassword).mockRejectedValue(
      new InvalidCredentialsError("Current password is incorrect")
    );

    const res = await passwordRoute(
      makeRequest(MEMBER, { current_password: "wrong", new_password: "newpassword123" })
    );
    expect(res.status).toBe(400);
  });

  it("maps WeakPasswordError to 400", async () => {
    vi.mocked(userService.changeOwnPassword).mockRejectedValue(
      new WeakPasswordError("Password does not meet the minimum length requirement")
    );

    const res = await passwordRoute(
      makeRequest(MEMBER, { current_password: "password123", new_password: "short" })
    );
    expect(res.status).toBe(400);
  });
});
