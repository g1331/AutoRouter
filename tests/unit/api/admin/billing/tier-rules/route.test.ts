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

class MockBillingTierRuleValidationError extends Error {
  constructor(message: string = "Model must not be empty") {
    super(message);
    this.name = "BillingTierRuleValidationError";
  }
}

const listBillingTierRulesMock = vi.fn();
const createBillingTierRuleMock = vi.fn();
vi.mock("@/lib/services/billing-price-service", () => ({
  BillingTierRuleConflictError: MockBillingTierRuleConflictError,
  BillingTierRuleValidationError: MockBillingTierRuleValidationError,
  listBillingTierRules: (...args: unknown[]) => listBillingTierRulesMock(...args),
  createBillingTierRule: (...args: unknown[]) => createBillingTierRuleMock(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const AUTH_HEADER = "Bearer valid-token";

describe("GET /api/admin/billing/tier-rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 without valid auth", async () => {
    const { GET } = await import("../../../../../../src/app/api/admin/billing/tier-rules/route");
    const req = new NextRequest("http://localhost/api/admin/billing/tier-rules");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("should list tier rules with filters", async () => {
    const { GET } = await import("../../../../../../src/app/api/admin/billing/tier-rules/route");

    listBillingTierRulesMock.mockResolvedValueOnce([
      {
        id: "rule-1",
        model: "gpt-4.1",
        source: "litellm",
        thresholdInputTokens: 128000,
        displayLabel: null,
        inputPricePerMillion: 5,
        outputPricePerMillion: 15,
        cacheReadInputPricePerMillion: null,
        cacheWriteInputPricePerMillion: null,
        note: null,
        isActive: true,
        createdAt: new Date("2026-02-28T00:00:00.000Z"),
        updatedAt: new Date("2026-02-28T00:00:00.000Z"),
      },
    ]);

    const req = new NextRequest(
      "http://localhost/api/admin/billing/tier-rules?model=gpt-4.1&source=litellm&active_only=true",
      { headers: { authorization: AUTH_HEADER } }
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(listBillingTierRulesMock).toHaveBeenCalledWith({
      model: "gpt-4.1",
      source: "litellm",
      activeOnly: true,
    });

    const body = (await res.json()) as {
      items: Array<{ model: string; threshold_input_tokens: number }>;
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.items[0].model).toBe("gpt-4.1");
    expect(body.items[0].threshold_input_tokens).toBe(128000);
  });
});

describe("POST /api/admin/billing/tier-rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 on validation error", async () => {
    const { POST } = await import("../../../../../../src/app/api/admin/billing/tier-rules/route");
    const req = new NextRequest("http://localhost/api/admin/billing/tier-rules", {
      method: "POST",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ model: "", threshold_input_tokens: 0 }),
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Validation error");
  });

  it("should reject whitespace-only model names before persistence", async () => {
    const { POST } = await import("../../../../../../src/app/api/admin/billing/tier-rules/route");
    const req = new NextRequest("http://localhost/api/admin/billing/tier-rules", {
      method: "POST",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({
        model: "   ",
        threshold_input_tokens: 128000,
        input_price_per_million: 5,
        output_price_per_million: 15,
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(createBillingTierRuleMock).not.toHaveBeenCalled();
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Validation error");
  });

  it("should create a manual tier rule", async () => {
    const { POST } = await import("../../../../../../src/app/api/admin/billing/tier-rules/route");

    createBillingTierRuleMock.mockResolvedValueOnce({
      id: "rule-1",
      model: "gpt-4.1",
      source: "manual",
      thresholdInputTokens: 128000,
      displayLabel: null,
      inputPricePerMillion: 5,
      outputPricePerMillion: 15,
      cacheReadInputPricePerMillion: null,
      cacheWriteInputPricePerMillion: null,
      note: "manual override",
      isActive: true,
      createdAt: new Date("2026-02-28T00:00:00.000Z"),
      updatedAt: new Date("2026-02-28T00:00:00.000Z"),
    });

    const req = new NextRequest("http://localhost/api/admin/billing/tier-rules", {
      method: "POST",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1",
        threshold_input_tokens: 128000,
        input_price_per_million: 5,
        output_price_per_million: 15,
        note: "manual override",
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(createBillingTierRuleMock).toHaveBeenCalledWith({
      model: "gpt-4.1",
      thresholdInputTokens: 128000,
      displayLabel: null,
      inputPricePerMillion: 5,
      outputPricePerMillion: 15,
      cacheReadInputPricePerMillion: null,
      cacheWriteInputPricePerMillion: null,
      note: "manual override",
    });

    const body = (await res.json()) as { source: string; threshold_input_tokens: number };
    expect(body.source).toBe("manual");
    expect(body.threshold_input_tokens).toBe(128000);
  });

  it("should return 409 when a duplicate threshold already exists", async () => {
    const { POST } = await import("../../../../../../src/app/api/admin/billing/tier-rules/route");

    createBillingTierRuleMock.mockRejectedValueOnce(new MockBillingTierRuleConflictError());

    const req = new NextRequest("http://localhost/api/admin/billing/tier-rules", {
      method: "POST",
      headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1",
        threshold_input_tokens: 128000,
        input_price_per_million: 5,
        output_price_per_million: 15,
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("same threshold");
  });
});
