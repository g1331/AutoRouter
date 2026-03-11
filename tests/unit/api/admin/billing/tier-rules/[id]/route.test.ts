import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-token"),
}));

class MockBillingTierRuleConflictError extends Error {
  constructor(message: string = "A manual tier rule with the same threshold already exists") {
    super(message);
    this.name = "BillingTierRuleConflictError";
  }
}

const updateBillingTierRuleMock = vi.fn();
const deleteBillingTierRuleMock = vi.fn();
vi.mock("@/lib/services/billing-price-service", () => ({
  BillingTierRuleConflictError: MockBillingTierRuleConflictError,
  updateBillingTierRule: (...args: unknown[]) => updateBillingTierRuleMock(...args),
  deleteBillingTierRule: (...args: unknown[]) => deleteBillingTierRuleMock(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const AUTH_HEADER = "Bearer valid-token";

describe("PUT /api/admin/billing/tier-rules/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 404 when the tier rule does not exist", async () => {
    const { PUT } =
      await import("../../../../../../../src/app/api/admin/billing/tier-rules/[id]/route");

    updateBillingTierRuleMock.mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost/api/admin/billing/tier-rules/missing", {
      method: "PUT",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: "missing" }) });

    expect(res.status).toBe(404);
  });

  it("should update a manual tier rule", async () => {
    const { PUT } =
      await import("../../../../../../../src/app/api/admin/billing/tier-rules/[id]/route");

    updateBillingTierRuleMock.mockResolvedValueOnce({
      id: "rule-1",
      model: "gpt-4.1",
      source: "manual",
      thresholdInputTokens: 128000,
      displayLabel: null,
      inputPricePerMillion: 5,
      outputPricePerMillion: 15,
      cacheReadInputPricePerMillion: null,
      cacheWriteInputPricePerMillion: null,
      note: null,
      isActive: false,
      createdAt: new Date("2026-02-28T00:00:00.000Z"),
      updatedAt: new Date("2026-02-28T00:00:00.000Z"),
    });

    const req = new NextRequest("http://localhost/api/admin/billing/tier-rules/rule-1", {
      method: "PUT",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: "rule-1" }) });

    expect(res.status).toBe(200);
    expect(updateBillingTierRuleMock).toHaveBeenCalledWith("rule-1", {
      thresholdInputTokens: undefined,
      displayLabel: undefined,
      inputPricePerMillion: undefined,
      outputPricePerMillion: undefined,
      cacheReadInputPricePerMillion: undefined,
      cacheWriteInputPricePerMillion: undefined,
      note: undefined,
      isActive: false,
    });
  });

  it("should return 409 when updating a manual tier rule would duplicate a threshold", async () => {
    const { PUT } =
      await import("../../../../../../../src/app/api/admin/billing/tier-rules/[id]/route");

    updateBillingTierRuleMock.mockRejectedValueOnce(new MockBillingTierRuleConflictError());

    const req = new NextRequest("http://localhost/api/admin/billing/tier-rules/rule-1", {
      method: "PUT",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ threshold_input_tokens: 200000 }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: "rule-1" }) });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("same threshold");
  });
});

describe("DELETE /api/admin/billing/tier-rules/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 404 when the manual tier rule is missing", async () => {
    const { DELETE } =
      await import("../../../../../../../src/app/api/admin/billing/tier-rules/[id]/route");

    deleteBillingTierRuleMock.mockResolvedValueOnce(false);

    const req = new NextRequest("http://localhost/api/admin/billing/tier-rules/missing", {
      method: "DELETE",
      headers: { authorization: AUTH_HEADER },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "missing" }) });

    expect(res.status).toBe(404);
  });

  it("should return 204 when a manual tier rule is deleted", async () => {
    const { DELETE } =
      await import("../../../../../../../src/app/api/admin/billing/tier-rules/[id]/route");

    deleteBillingTierRuleMock.mockResolvedValueOnce(true);

    const req = new NextRequest("http://localhost/api/admin/billing/tier-rules/rule-1", {
      method: "DELETE",
      headers: { authorization: AUTH_HEADER },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "rule-1" }) });

    expect(res.status).toBe(204);
  });
});
