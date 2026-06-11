import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Route-layer tests for the admin user-management endpoints. The service logic
// itself is exercised against a real database in tests/unit/services/
// user-service.test.ts; here the service is mocked so these tests focus on the
// route concerns: the requireAdmin guard (401 unauthenticated, 403 member),
// request validation, the mapping from service errors to HTTP status codes, and
// the response shape — in particular that no password hash is ever serialized.

vi.mock("@/lib/utils/api-auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/utils/api-auth")>();
  return {
    ...actual,
    requireAdmin: vi.fn(async (request: Request) => {
      const authHeader = request.headers.get("authorization");
      if (authHeader === "Bearer valid-admin-token") {
        return { kind: "admin_token" };
      }
      if (authHeader === "Bearer member-token") {
        return actual.errorResponse("Forbidden", 403);
      }
      return actual.errorResponse("Unauthorized", 401);
    }),
  };
});

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("@/lib/services/user-service", () => {
  class UserNotFoundError extends Error {}
  class UsernameConflictError extends Error {}
  class InvalidUsernameError extends Error {}
  class WeakPasswordError extends Error {}
  class LastActiveAdminError extends Error {}
  class UpstreamAssignmentError extends Error {}
  class ApiKeyOwnershipError extends Error {}
  return {
    listUsers: vi.fn(),
    createUser: vi.fn(),
    getUserById: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    changeUsername: vi.fn(),
    resetPassword: vi.fn(),
    getUserUpstreams: vi.fn(),
    setUserUpstreams: vi.fn(),
    assignApiKeyOwnership: vi.fn(),
    revokeApiKeyOwnership: vi.fn(),
    UserNotFoundError,
    UsernameConflictError,
    InvalidUsernameError,
    WeakPasswordError,
    LastActiveAdminError,
    UpstreamAssignmentError,
    ApiKeyOwnershipError,
  };
});

import * as userService from "@/lib/services/user-service";
import { GET as listUsersRoute, POST as createUserRoute } from "@/app/api/admin/users/route";
import {
  GET as getUserRoute,
  PUT as updateUserRoute,
  DELETE as deleteUserRoute,
} from "@/app/api/admin/users/[id]/route";
import { PUT as changeUsernameRoute } from "@/app/api/admin/users/[id]/username/route";
import { PUT as resetPasswordRoute } from "@/app/api/admin/users/[id]/password/route";
import {
  GET as getUpstreamsRoute,
  PUT as setUpstreamsRoute,
} from "@/app/api/admin/users/[id]/upstreams/route";
import {
  PUT as assignOwnerRoute,
  DELETE as revokeOwnerRoute,
} from "@/app/api/admin/keys/[id]/owner/route";

const ADMIN = "Bearer valid-admin-token";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const KEY_ID = "22222222-2222-4222-8222-222222222222";
const UPSTREAM_ID = "33333333-3333-4333-8333-333333333333";

function makeRequest(authHeader: string | null, body?: unknown): NextRequest {
  const headers = new Headers();
  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  const init: { headers: Headers; method?: string; body?: string } = { headers };
  if (body !== undefined) {
    init.method = "POST";
    init.body = JSON.stringify(body);
    headers.set("content-type", "application/json");
  }
  return new NextRequest("http://localhost/api/admin/users", init);
}

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: USER_ID,
    username: "alice",
    displayName: "Alice",
    role: "member",
    isActive: true,
    apiKeyCount: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin user routes — guard", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await listUsersRoute(makeRequest(null));
    expect(res.status).toBe(401);
    expect(userService.listUsers).not.toHaveBeenCalled();
  });

  it("rejects a member with 403", async () => {
    const res = await listUsersRoute(makeRequest("Bearer member-token"));
    expect(res.status).toBe(403);
    expect(userService.listUsers).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/users", () => {
  it("returns a paginated user list for an admin", async () => {
    vi.mocked(userService.listUsers).mockResolvedValue({
      items: [makeUser()],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      activeAdminTotal: 2,
    } as never);

    const res = await listUsersRoute(makeRequest(ADMIN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.items[0].username).toBe("alice");
    expect(body.items[0]).not.toHaveProperty("password_hash");
    expect(body.items[0]).not.toHaveProperty("passwordHash");
    // The table-wide active-admin total is surfaced for the last-admin guardrail.
    expect(body.active_admin_total).toBe(2);
  });
});

describe("POST /api/admin/users", () => {
  it("creates a user and never serializes a password hash", async () => {
    vi.mocked(userService.createUser).mockResolvedValue(makeUser() as never);

    const res = await createUserRoute(
      makeRequest(ADMIN, { username: "alice", password: "password123", display_name: "Alice" })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.username).toBe("alice");
    expect(body).not.toHaveProperty("password_hash");
    expect(body).not.toHaveProperty("passwordHash");
    expect(userService.createUser).toHaveBeenCalledWith({
      username: "alice",
      password: "password123",
      displayName: "Alice",
      role: undefined,
    });
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await createUserRoute(makeRequest(ADMIN, { username: "alice" }));
    expect(res.status).toBe(400);
    expect(userService.createUser).not.toHaveBeenCalled();
  });

  it("maps a username conflict to 409", async () => {
    vi.mocked(userService.createUser).mockRejectedValue(
      new userService.UsernameConflictError("taken")
    );
    const res = await createUserRoute(
      makeRequest(ADMIN, { username: "alice", password: "password123", display_name: "Alice" })
    );
    expect(res.status).toBe(409);
  });

  it("maps a weak password to 400", async () => {
    vi.mocked(userService.createUser).mockRejectedValue(
      new userService.WeakPasswordError("too short")
    );
    const res = await createUserRoute(
      makeRequest(ADMIN, { username: "alice", password: "x", display_name: "Alice" })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a whitespace-only username at the schema layer with 400", async () => {
    const res = await createUserRoute(
      makeRequest(ADMIN, { username: "   ", password: "password123", display_name: "Alice" })
    );
    expect(res.status).toBe(400);
    expect(userService.createUser).not.toHaveBeenCalled();
  });

  it("maps an invalid username from the service to 400", async () => {
    vi.mocked(userService.createUser).mockRejectedValue(
      new userService.InvalidUsernameError("Username must not be empty")
    );
    const res = await createUserRoute(
      makeRequest(ADMIN, { username: "alice", password: "password123", display_name: "Alice" })
    );
    expect(res.status).toBe(400);
  });
});

describe("GET/PUT/DELETE /api/admin/users/[id]", () => {
  it("returns 404 for a missing user", async () => {
    vi.mocked(userService.getUserById).mockResolvedValue(null);
    const res = await getUserRoute(makeRequest(ADMIN), ctx(USER_ID));
    expect(res.status).toBe(404);
  });

  it("updates a user", async () => {
    vi.mocked(userService.updateUser).mockResolvedValue(makeUser({ displayName: "New" }) as never);
    const res = await updateUserRoute(makeRequest(ADMIN, { display_name: "New" }), ctx(USER_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.display_name).toBe("New");
  });

  it("maps the last-active-admin lock to 409 on update", async () => {
    vi.mocked(userService.updateUser).mockRejectedValue(
      new userService.LastActiveAdminError("last admin")
    );
    const res = await updateUserRoute(makeRequest(ADMIN, { role: "member" }), ctx(USER_ID));
    expect(res.status).toBe(409);
  });

  it("returns 400 when the update body is empty", async () => {
    const res = await updateUserRoute(makeRequest(ADMIN, {}), ctx(USER_ID));
    expect(res.status).toBe(400);
    expect(userService.updateUser).not.toHaveBeenCalled();
  });

  it("deletes a user with 204", async () => {
    vi.mocked(userService.deleteUser).mockResolvedValue(undefined);
    const res = await deleteUserRoute(makeRequest(ADMIN), ctx(USER_ID));
    expect(res.status).toBe(204);
  });

  it("maps the last-active-admin lock to 409 on delete", async () => {
    vi.mocked(userService.deleteUser).mockRejectedValue(
      new userService.LastActiveAdminError("last admin")
    );
    const res = await deleteUserRoute(makeRequest(ADMIN), ctx(USER_ID));
    expect(res.status).toBe(409);
  });

  it("maps a missing user to 404 on delete", async () => {
    vi.mocked(userService.deleteUser).mockRejectedValue(
      new userService.UserNotFoundError("missing")
    );
    const res = await deleteUserRoute(makeRequest(ADMIN), ctx(USER_ID));
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/admin/users/[id]/username", () => {
  it("changes the username", async () => {
    vi.mocked(userService.changeUsername).mockResolvedValue(makeUser({ username: "bob" }) as never);
    const res = await changeUsernameRoute(makeRequest(ADMIN, { username: "bob" }), ctx(USER_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.username).toBe("bob");
  });

  it("maps a conflict to 409", async () => {
    vi.mocked(userService.changeUsername).mockRejectedValue(
      new userService.UsernameConflictError("taken")
    );
    const res = await changeUsernameRoute(makeRequest(ADMIN, { username: "bob" }), ctx(USER_ID));
    expect(res.status).toBe(409);
  });
});

describe("PUT /api/admin/users/[id]/password", () => {
  it("resets the password with 204", async () => {
    vi.mocked(userService.resetPassword).mockResolvedValue(undefined);
    const res = await resetPasswordRoute(
      makeRequest(ADMIN, { password: "newpassword123" }),
      ctx(USER_ID)
    );
    expect(res.status).toBe(204);
  });

  it("maps a weak password to 400", async () => {
    vi.mocked(userService.resetPassword).mockRejectedValue(
      new userService.WeakPasswordError("too short")
    );
    const res = await resetPasswordRoute(makeRequest(ADMIN, { password: "x" }), ctx(USER_ID));
    expect(res.status).toBe(400);
  });
});

describe("GET/PUT /api/admin/users/[id]/upstreams", () => {
  it("returns the available upstream ids", async () => {
    vi.mocked(userService.getUserById).mockResolvedValue(makeUser() as never);
    vi.mocked(userService.getUserUpstreams).mockResolvedValue(["up-1", "up-2"]);
    const res = await getUpstreamsRoute(makeRequest(ADMIN), ctx(USER_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.upstream_ids).toEqual(["up-1", "up-2"]);
  });

  it("replaces the available upstream set", async () => {
    vi.mocked(userService.setUserUpstreams).mockResolvedValue([UPSTREAM_ID]);
    const res = await setUpstreamsRoute(
      makeRequest(ADMIN, { upstream_ids: [UPSTREAM_ID] }),
      ctx(USER_ID)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.upstream_ids).toEqual([UPSTREAM_ID]);
  });

  it("maps unknown upstream ids to 400", async () => {
    vi.mocked(userService.setUserUpstreams).mockRejectedValue(
      new userService.UpstreamAssignmentError("invalid")
    );
    const res = await setUpstreamsRoute(
      makeRequest(ADMIN, { upstream_ids: [UPSTREAM_ID] }),
      ctx(USER_ID)
    );
    expect(res.status).toBe(400);
  });

  it("maps a missing user to 404", async () => {
    vi.mocked(userService.setUserUpstreams).mockRejectedValue(
      new userService.UserNotFoundError("missing")
    );
    const res = await setUpstreamsRoute(makeRequest(ADMIN, { upstream_ids: [] }), ctx(USER_ID));
    expect(res.status).toBe(404);
  });
});

describe("PUT/DELETE /api/admin/keys/[id]/owner", () => {
  it("assigns ownership with 204", async () => {
    vi.mocked(userService.assignApiKeyOwnership).mockResolvedValue(undefined);
    const res = await assignOwnerRoute(makeRequest(ADMIN, { user_id: USER_ID }), ctx(KEY_ID));
    expect(res.status).toBe(204);
    expect(userService.assignApiKeyOwnership).toHaveBeenCalledWith(KEY_ID, USER_ID);
  });

  it("maps a missing user to 404 on assign", async () => {
    vi.mocked(userService.assignApiKeyOwnership).mockRejectedValue(
      new userService.UserNotFoundError("missing")
    );
    const res = await assignOwnerRoute(makeRequest(ADMIN, { user_id: USER_ID }), ctx(KEY_ID));
    expect(res.status).toBe(404);
  });

  it("revokes ownership with 204", async () => {
    vi.mocked(userService.revokeApiKeyOwnership).mockResolvedValue(undefined);
    const res = await revokeOwnerRoute(makeRequest(ADMIN), ctx(KEY_ID));
    expect(res.status).toBe(204);
    expect(userService.revokeApiKeyOwnership).toHaveBeenCalledWith(KEY_ID);
  });

  it("maps a missing key to 404 on revoke", async () => {
    vi.mocked(userService.revokeApiKeyOwnership).mockRejectedValue(
      new userService.ApiKeyOwnershipError("missing")
    );
    const res = await revokeOwnerRoute(makeRequest(ADMIN), ctx(KEY_ID));
    expect(res.status).toBe(404);
  });
});
