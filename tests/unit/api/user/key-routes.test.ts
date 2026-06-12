import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Route-layer tests for the self-service API key endpoints. The ownership,
// upstream-subset, and tighten-only rules run against a real database in
// tests/unit/services/user-key-service.test.ts; here the service is mocked so
// these tests focus on the route concerns: the requireUser guard (401
// unauthenticated, 403 for the ADMIN_TOKEN super-admin), the forced owner
// scope from the principal, the schema stripping any attempted user_id /
// access_mode fields, the snake_case body mapping, and the error-to-status
// mapping (KeyOwnershipError → 404, UpstreamNotAllowedError → 403,
// SpendingRuleRelaxationError → 400).

vi.mock("@/lib/utils/api-auth", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/utils/api-auth")>();
  return {
    ...actual,
    requireUser: vi.fn(async (request: Request) => {
      const authHeader = request.headers.get("authorization");
      if (authHeader === "Bearer member-token") {
        return { kind: "user", userId: SELF_ID, role: "member", username: "alice" };
      }
      if (authHeader === "Bearer valid-admin-token") {
        return { kind: "admin_token" };
      }
      return actual.errorResponse("Unauthorized", 401);
    }),
  };
});

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock("@/lib/services/user-key-service", () => {
  class KeyOwnershipError extends Error {}
  class UpstreamNotAllowedError extends Error {}
  class SpendingRuleRelaxationError extends Error {}
  return {
    listOwnApiKeys: vi.fn(),
    createOwnApiKey: vi.fn(),
    updateOwnApiKey: vi.fn(),
    deleteOwnApiKey: vi.fn(),
    KeyOwnershipError,
    UpstreamNotAllowedError,
    SpendingRuleRelaxationError,
  };
});

import * as userKeyService from "@/lib/services/user-key-service";
import {
  KeyOwnershipError,
  UpstreamNotAllowedError,
  SpendingRuleRelaxationError,
} from "@/lib/services/user-key-service";
import { GET as listRoute, POST as createRoute } from "@/app/api/user/keys/route";
import { PUT as updateRoute, DELETE as deleteRoute } from "@/app/api/user/keys/[id]/route";

const SELF_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const KEY_ID = "33333333-3333-4333-8333-333333333333";
const UPSTREAM_ID = "44444444-4444-4444-8444-444444444444";
const MEMBER = "Bearer member-token";
const ADMIN_TOKEN = "Bearer valid-admin-token";

function makeRequest(
  url: string,
  authHeader: string | null,
  init?: { method?: string; body?: unknown }
): NextRequest {
  const headers = new Headers();
  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  return new NextRequest(url, {
    headers,
    method: init?.method ?? "GET",
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

function makeContext(id: string = KEY_ID) {
  return { params: Promise.resolve({ id }) };
}

function makeKeyItem() {
  return {
    id: KEY_ID,
    keyPrefix: "sk-auto-abc",
    name: "my key",
    description: null,
    accessMode: "restricted" as const,
    upstreamIds: [UPSTREAM_ID],
    allowedModels: null,
    spendingRules: null,
    spendingRuleStatuses: [],
    isQuotaExceeded: false,
    isActive: true,
    expiresAt: null,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
  };
}

function makeCreateResult() {
  return { ...makeKeyItem(), keyValue: "sk-auto-abc-full-secret" };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("user key routes — guard", () => {
  it.each([
    ["GET /keys", () => listRoute(makeRequest("http://localhost/api/user/keys", null))],
    [
      "POST /keys",
      () =>
        createRoute(
          makeRequest("http://localhost/api/user/keys", null, { method: "POST", body: {} })
        ),
    ],
    [
      "PUT /keys/[id]",
      () =>
        updateRoute(
          makeRequest(`http://localhost/api/user/keys/${KEY_ID}`, null, {
            method: "PUT",
            body: {},
          }),
          makeContext()
        ),
    ],
    [
      "DELETE /keys/[id]",
      () =>
        deleteRoute(
          makeRequest(`http://localhost/api/user/keys/${KEY_ID}`, null, { method: "DELETE" }),
          makeContext()
        ),
    ],
  ])("rejects an unauthenticated request to %s with 401", async (_name, invoke) => {
    const res = await invoke();
    expect(res.status).toBe(401);
  });

  it.each([
    ["GET /keys", () => listRoute(makeRequest("http://localhost/api/user/keys", ADMIN_TOKEN))],
    [
      "POST /keys",
      () =>
        createRoute(
          makeRequest("http://localhost/api/user/keys", ADMIN_TOKEN, { method: "POST", body: {} })
        ),
    ],
    [
      "PUT /keys/[id]",
      () =>
        updateRoute(
          makeRequest(`http://localhost/api/user/keys/${KEY_ID}`, ADMIN_TOKEN, {
            method: "PUT",
            body: {},
          }),
          makeContext()
        ),
    ],
    [
      "DELETE /keys/[id]",
      () =>
        deleteRoute(
          makeRequest(`http://localhost/api/user/keys/${KEY_ID}`, ADMIN_TOKEN, {
            method: "DELETE",
          }),
          makeContext()
        ),
    ],
  ])("rejects the ADMIN_TOKEN identity on %s with 403", async (_name, invoke) => {
    const res = await invoke();
    expect(res.status).toBe(403);
    expect(userKeyService.listOwnApiKeys).not.toHaveBeenCalled();
    expect(userKeyService.createOwnApiKey).not.toHaveBeenCalled();
    expect(userKeyService.updateOwnApiKey).not.toHaveBeenCalled();
    expect(userKeyService.deleteOwnApiKey).not.toHaveBeenCalled();
  });
});

describe("GET /api/user/keys", () => {
  it("lists the caller's keys with pagination in snake_case", async () => {
    vi.mocked(userKeyService.listOwnApiKeys).mockResolvedValue({
      items: [makeKeyItem()],
      total: 1,
      page: 2,
      pageSize: 5,
      totalPages: 1,
    });

    const res = await listRoute(
      makeRequest("http://localhost/api/user/keys?page=2&page_size=5", MEMBER)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBe(2);
    expect(body.page_size).toBe(5);
    expect(body.items[0]).toMatchObject({
      id: KEY_ID,
      key_prefix: "sk-auto-abc",
      access_mode: "restricted",
      upstream_ids: [UPSTREAM_ID],
    });
    expect(userKeyService.listOwnApiKeys).toHaveBeenCalledWith(SELF_ID, 2, 5);
  });
});

describe("POST /api/user/keys", () => {
  it("creates a key owned by the caller and returns the key value once", async () => {
    vi.mocked(userKeyService.createOwnApiKey).mockResolvedValue(makeCreateResult());

    const res = await createRoute(
      makeRequest("http://localhost/api/user/keys", MEMBER, {
        method: "POST",
        body: {
          name: "my key",
          upstream_ids: [UPSTREAM_ID],
          spending_rules: [{ period_type: "daily", limit: 5 }],
        },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.key_value).toBe("sk-auto-abc-full-secret");
    expect(userKeyService.createOwnApiKey).toHaveBeenCalledWith(SELF_ID, {
      name: "my key",
      upstreamIds: [UPSTREAM_ID],
      description: null,
      spendingRules: [{ period_type: "daily", limit: 5 }],
    });
  });

  it("strips attempted user_id and access_mode fields instead of honoring them", async () => {
    vi.mocked(userKeyService.createOwnApiKey).mockResolvedValue(makeCreateResult());

    const res = await createRoute(
      makeRequest("http://localhost/api/user/keys", MEMBER, {
        method: "POST",
        body: {
          name: "my key",
          upstream_ids: [UPSTREAM_ID],
          user_id: OTHER_ID,
          access_mode: "unrestricted",
        },
      })
    );
    expect(res.status).toBe(201);
    // The service input carries no owner or access-mode field at all; both are
    // forced server-side inside the service.
    expect(userKeyService.createOwnApiKey).toHaveBeenCalledWith(SELF_ID, {
      name: "my key",
      upstreamIds: [UPSTREAM_ID],
      description: null,
      spendingRules: null,
    });
  });

  it("rejects a body without upstream_ids with 400", async () => {
    const res = await createRoute(
      makeRequest("http://localhost/api/user/keys", MEMBER, {
        method: "POST",
        body: { name: "my key" },
      })
    );
    expect(res.status).toBe(400);
    expect(userKeyService.createOwnApiKey).not.toHaveBeenCalled();
  });

  it("maps UpstreamNotAllowedError to 403", async () => {
    vi.mocked(userKeyService.createOwnApiKey).mockRejectedValue(
      new UpstreamNotAllowedError("Upstreams not granted to this user")
    );

    const res = await createRoute(
      makeRequest("http://localhost/api/user/keys", MEMBER, {
        method: "POST",
        body: { name: "my key", upstream_ids: [UPSTREAM_ID] },
      })
    );
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/user/keys/[id]", () => {
  it("maps the snake_case body onto the service input", async () => {
    vi.mocked(userKeyService.updateOwnApiKey).mockResolvedValue(makeKeyItem());

    const res = await updateRoute(
      makeRequest(`http://localhost/api/user/keys/${KEY_ID}`, MEMBER, {
        method: "PUT",
        body: {
          name: "renamed",
          is_active: false,
          upstream_ids: [UPSTREAM_ID],
          spending_rules: [{ period_type: "daily", limit: 1 }],
          user_id: OTHER_ID,
          access_mode: "unrestricted",
        },
      }),
      makeContext()
    );
    expect(res.status).toBe(200);
    expect(userKeyService.updateOwnApiKey).toHaveBeenCalledWith(SELF_ID, KEY_ID, {
      name: "renamed",
      isActive: false,
      upstreamIds: [UPSTREAM_ID],
      spendingRules: [{ period_type: "daily", limit: 1 }],
    });
  });

  it("maps KeyOwnershipError to a non-revealing 404", async () => {
    vi.mocked(userKeyService.updateOwnApiKey).mockRejectedValue(
      new KeyOwnershipError(`API key not found: ${KEY_ID}`)
    );

    const res = await updateRoute(
      makeRequest(`http://localhost/api/user/keys/${KEY_ID}`, MEMBER, {
        method: "PUT",
        body: { name: "renamed" },
      }),
      makeContext()
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    // The response must not leak the probed key id.
    expect(body.error).toBe("API key not found");
  });

  it("maps UpstreamNotAllowedError to 403", async () => {
    vi.mocked(userKeyService.updateOwnApiKey).mockRejectedValue(
      new UpstreamNotAllowedError("Upstreams not granted to this user")
    );

    const res = await updateRoute(
      makeRequest(`http://localhost/api/user/keys/${KEY_ID}`, MEMBER, {
        method: "PUT",
        body: { upstream_ids: [UPSTREAM_ID] },
      }),
      makeContext()
    );
    expect(res.status).toBe(403);
  });

  it("maps SpendingRuleRelaxationError to 400", async () => {
    vi.mocked(userKeyService.updateOwnApiKey).mockRejectedValue(
      new SpendingRuleRelaxationError("Existing spending rules cannot be cleared")
    );

    const res = await updateRoute(
      makeRequest(`http://localhost/api/user/keys/${KEY_ID}`, MEMBER, {
        method: "PUT",
        body: { spending_rules: null },
      }),
      makeContext()
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/user/keys/[id]", () => {
  it("deletes the caller's key and returns 204", async () => {
    vi.mocked(userKeyService.deleteOwnApiKey).mockResolvedValue(undefined);

    const res = await deleteRoute(
      makeRequest(`http://localhost/api/user/keys/${KEY_ID}`, MEMBER, { method: "DELETE" }),
      makeContext()
    );
    expect(res.status).toBe(204);
    expect(userKeyService.deleteOwnApiKey).toHaveBeenCalledWith(SELF_ID, KEY_ID);
  });

  it("maps KeyOwnershipError to a non-revealing 404", async () => {
    vi.mocked(userKeyService.deleteOwnApiKey).mockRejectedValue(
      new KeyOwnershipError(`API key not found: ${KEY_ID}`)
    );

    const res = await deleteRoute(
      makeRequest(`http://localhost/api/user/keys/${KEY_ID}`, MEMBER, { method: "DELETE" }),
      makeContext()
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("API key not found");
  });
});
