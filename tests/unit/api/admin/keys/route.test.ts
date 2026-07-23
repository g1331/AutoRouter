import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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
      if (authHeader === "Bearer test-admin-token") {
        return { kind: "admin_token" };
      }
      return actual.errorResponse("Unauthorized", 401);
    }),
  };
});

const mockCreateApiKey = vi.fn();
const mockUpdateApiKey = vi.fn();

class ApiKeyNotFoundError extends Error {}

vi.mock("@/lib/services/key-manager", () => ({
  createApiKey: (...args: unknown[]) => mockCreateApiKey(...args),
  updateApiKey: (...args: unknown[]) => mockUpdateApiKey(...args),
  listApiKeys: vi.fn(),
  getApiKeyById: vi.fn(),
  deleteApiKey: vi.fn(),
  ApiKeyNotFoundError,
}));

const QUOTA_RULE = { period_type: "rolling" as const, limit: 15, period_hours: 6 };
const KEY_ID = "11111111-1111-4111-8111-111111111111";
const UPSTREAM_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

function buildServiceApiKey(overrides?: Record<string, unknown>) {
  return {
    id: KEY_ID,
    keyPrefix: "sk-auto-test",
    keyValue: "sk-auto-test-full",
    name: "Quota Key",
    description: "quota aware",
    accessMode: "restricted" as const,
    upstreamIds: [UPSTREAM_ID],
    allowedModels: ["gpt-4.1"],
    spendingRules: [QUOTA_RULE],
    rpmLimit: 60,
    tpmLimit: 120000,
    spendingRuleStatuses: [
      {
        periodType: "rolling" as const,
        periodHours: 6,
        currentSpending: 8,
        spendingLimit: 15,
        percentUsed: 53.3,
        isExceeded: false,
        resetsAt: null,
        estimatedRecoveryAt: new Date("2024-01-01T06:00:00.000Z"),
      },
    ],
    isQuotaExceeded: false,
    isActive: true,
    disabledByAdmin: false,
    expiresAt: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("admin keys routes spending rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST /api/admin/keys should pass spending_rules into createApiKey and return quota fields", async () => {
    const { POST } = await import("@/app/api/admin/keys/route");
    mockCreateApiKey.mockResolvedValueOnce(buildServiceApiKey());

    const request = new NextRequest("http://localhost:3000/api/admin/keys", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Quota Key",
        access_mode: "restricted",
        upstream_ids: [UPSTREAM_ID],
        allowed_models: ["gpt-4.1"],
        spending_rules: [QUOTA_RULE],
        rpm_limit: 60,
        tpm_limit: 120000,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(mockCreateApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Quota Key",
        accessMode: "restricted",
        upstreamIds: [UPSTREAM_ID],
        allowedModels: ["gpt-4.1"],
        spendingRules: [QUOTA_RULE],
        rpmLimit: 60,
        tpmLimit: 120000,
      })
    );
    expect(data).toEqual(
      expect.objectContaining({
        spending_rules: [QUOTA_RULE],
        spending_rule_statuses: [
          expect.objectContaining({
            period_type: "rolling",
            period_hours: 6,
            current_spending: 8,
            spending_limit: 15,
            estimated_recovery_at: "2024-01-01T06:00:00.000Z",
          }),
        ],
        is_quota_exceeded: false,
        rpm_limit: 60,
        tpm_limit: 120000,
      })
    );
  });

  it("POST /api/admin/keys should reject rolling rules without period_hours", async () => {
    const { POST } = await import("@/app/api/admin/keys/route");

    const request = new NextRequest("http://localhost:3000/api/admin/keys", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Broken Quota Key",
        access_mode: "restricted",
        upstream_ids: [UPSTREAM_ID],
        spending_rules: [{ period_type: "rolling", limit: 15 }],
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("period_hours");
    expect(mockCreateApiKey).not.toHaveBeenCalled();
  });

  it("POST /api/admin/keys should reject invalid rate limits", async () => {
    const { POST } = await import("@/app/api/admin/keys/route");

    const request = new NextRequest("http://localhost:3000/api/admin/keys", {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Broken Rate Key",
        access_mode: "restricted",
        upstream_ids: [UPSTREAM_ID],
        rpm_limit: 0,
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mockCreateApiKey).not.toHaveBeenCalled();
  });

  it("GET /api/admin/keys passes the search param through to listApiKeys", async () => {
    const { GET } = await import("@/app/api/admin/keys/route");
    const { listApiKeys } = await import("@/lib/services/key-manager");
    vi.mocked(listApiKeys).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    } as never);

    const request = new NextRequest(
      "http://localhost:3000/api/admin/keys?page=1&page_size=10&search=%20prod%20",
      { headers: { authorization: "Bearer test-admin-token" } }
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(listApiKeys).toHaveBeenCalledWith(1, 10, { search: "prod", unowned: true });
  });

  it("GET /api/admin/keys omits the search filter when the param is absent", async () => {
    const { GET } = await import("@/app/api/admin/keys/route");
    const { listApiKeys } = await import("@/lib/services/key-manager");
    vi.mocked(listApiKeys).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    } as never);

    const request = new NextRequest("http://localhost:3000/api/admin/keys?page=1&page_size=10", {
      headers: { authorization: "Bearer test-admin-token" },
    });

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(listApiKeys).toHaveBeenCalledWith(1, 10, { unowned: true });
  });

  it("GET /api/admin/keys with owner_scope=all lists owned keys too", async () => {
    const { GET } = await import("@/app/api/admin/keys/route");
    const { listApiKeys } = await import("@/lib/services/key-manager");
    vi.mocked(listApiKeys).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    } as never);

    const request = new NextRequest(
      "http://localhost:3000/api/admin/keys?page=1&page_size=10&owner_scope=all",
      { headers: { authorization: "Bearer test-admin-token" } }
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(listApiKeys).toHaveBeenCalledWith(1, 10, { unowned: false });
  });

  it("GET /api/admin/keys with user_id scopes to that owner and ignores owner_scope", async () => {
    const { GET } = await import("@/app/api/admin/keys/route");
    const { listApiKeys } = await import("@/lib/services/key-manager");
    vi.mocked(listApiKeys).mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    } as never);

    const request = new NextRequest(
      `http://localhost:3000/api/admin/keys?page=1&page_size=10&user_id=${USER_ID}`,
      { headers: { authorization: "Bearer test-admin-token" } }
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(listApiKeys).toHaveBeenCalledWith(1, 10, { userId: USER_ID });
  });

  it("GET /api/admin/keys rejects an unknown owner_scope with 400", async () => {
    const { GET } = await import("@/app/api/admin/keys/route");
    const { listApiKeys } = await import("@/lib/services/key-manager");

    const request = new NextRequest(
      "http://localhost:3000/api/admin/keys?page=1&page_size=10&owner_scope=owned",
      { headers: { authorization: "Bearer test-admin-token" } }
    );

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(listApiKeys).not.toHaveBeenCalled();
  });

  it("GET /api/admin/keys rejects a non-uuid user_id with 400", async () => {
    const { GET } = await import("@/app/api/admin/keys/route");
    const { listApiKeys } = await import("@/lib/services/key-manager");

    const request = new NextRequest("http://localhost:3000/api/admin/keys?user_id=not-a-uuid", {
      headers: { authorization: "Bearer test-admin-token" },
    });

    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(listApiKeys).not.toHaveBeenCalled();
  });

  it("PUT /api/admin/keys/[id] should pass spending_rules into updateApiKey and return quota fields", async () => {
    const { PUT } = await import("@/app/api/admin/keys/[id]/route");
    mockUpdateApiKey.mockResolvedValueOnce(
      buildServiceApiKey({
        spendingRuleStatuses: [
          {
            periodType: "rolling" as const,
            periodHours: 6,
            currentSpending: 15,
            spendingLimit: 15,
            percentUsed: 100,
            isExceeded: true,
            resetsAt: null,
            estimatedRecoveryAt: new Date("2024-01-01T08:00:00.000Z"),
          },
        ],
        isQuotaExceeded: true,
      })
    );

    const request = new NextRequest(`http://localhost:3000/api/admin/keys/${KEY_ID}`, {
      method: "PUT",
      headers: {
        authorization: "Bearer test-admin-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        access_mode: "restricted",
        upstream_ids: [UPSTREAM_ID],
        allowed_models: ["gpt-4.1"],
        spending_rules: [QUOTA_RULE],
        rpm_limit: 60,
        tpm_limit: 120000,
      }),
    });

    const response = await PUT(request, {
      params: Promise.resolve({ id: KEY_ID }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockUpdateApiKey).toHaveBeenCalledWith(
      KEY_ID,
      expect.objectContaining({
        accessMode: "restricted",
        upstreamIds: [UPSTREAM_ID],
        allowedModels: ["gpt-4.1"],
        spendingRules: [QUOTA_RULE],
        rpmLimit: 60,
        tpmLimit: 120000,
      })
    );
    expect(data).toEqual(
      expect.objectContaining({
        spending_rules: [QUOTA_RULE],
        spending_rule_statuses: [
          expect.objectContaining({
            current_spending: 15,
            spending_limit: 15,
            is_exceeded: true,
            estimated_recovery_at: "2024-01-01T08:00:00.000Z",
          }),
        ],
        is_quota_exceeded: true,
        rpm_limit: 60,
        tpm_limit: 120000,
      })
    );
  });

  it("PUT /api/admin/keys/[id] disabling a key imposes the admin lock", async () => {
    const { PUT } = await import("@/app/api/admin/keys/[id]/route");
    mockUpdateApiKey.mockResolvedValueOnce(
      buildServiceApiKey({ isActive: false, disabledByAdmin: true })
    );

    const request = new NextRequest(`http://localhost:3000/api/admin/keys/${KEY_ID}`, {
      method: "PUT",
      headers: {
        authorization: "Bearer test-admin-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ is_active: false }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: KEY_ID }) });

    expect(response.status).toBe(200);
    expect(mockUpdateApiKey).toHaveBeenCalledWith(
      KEY_ID,
      expect.objectContaining({ isActive: false, disabledByAdmin: true })
    );
  });

  it("PUT /api/admin/keys/[id] enabling a key clears the admin lock", async () => {
    const { PUT } = await import("@/app/api/admin/keys/[id]/route");
    mockUpdateApiKey.mockResolvedValueOnce(
      buildServiceApiKey({ isActive: true, disabledByAdmin: false })
    );

    const request = new NextRequest(`http://localhost:3000/api/admin/keys/${KEY_ID}`, {
      method: "PUT",
      headers: {
        authorization: "Bearer test-admin-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ is_active: true }),
    });

    const response = await PUT(request, { params: Promise.resolve({ id: KEY_ID }) });

    expect(response.status).toBe(200);
    expect(mockUpdateApiKey).toHaveBeenCalledWith(
      KEY_ID,
      expect.objectContaining({ isActive: true, disabledByAdmin: false })
    );
  });
});
