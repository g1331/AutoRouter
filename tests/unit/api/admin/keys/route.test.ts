import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader: string | null) => authHeader === "Bearer test-admin-token"),
}));

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
      })
    );
  });
});
