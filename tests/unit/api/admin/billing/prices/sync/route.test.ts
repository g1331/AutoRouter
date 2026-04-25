import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-token"),
}));

const executeNowMock = vi.fn();
const getLatestBillingSyncStatusMock = vi.fn();

vi.mock("@/lib/services/background-sync", () => ({
  getBackgroundSyncScheduler: () => ({
    executeNow: (...args: unknown[]) => executeNowMock(...args),
  }),
}));

vi.mock("@/lib/services/billing-price-service", () => ({
  getLatestBillingSyncStatus: (...args: unknown[]) => getLatestBillingSyncStatusMock(...args),
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const AUTH_HEADER = "Bearer valid-token";

describe("POST /api/admin/billing/prices/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 without valid auth", async () => {
    const { POST } = await import("@/app/api/admin/billing/prices/sync/route");
    const req = new NextRequest("http://localhost/api/admin/billing/prices/sync", {
      method: "POST",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("should return sync summary", async () => {
    const { POST } = await import("@/app/api/admin/billing/prices/sync/route");

    executeNowMock.mockResolvedValueOnce({
      taskName: "billing_price_catalog_sync",
      triggerType: "manual",
      status: "success",
      successCount: 10,
      failureCount: 0,
      errorSummary: null,
      startedAt: new Date("2026-02-28T00:00:00.000Z"),
      finishedAt: new Date("2026-02-28T00:00:01.000Z"),
      durationMs: 1000,
      nextRunAt: new Date("2026-02-29T00:00:01.000Z"),
    });
    getLatestBillingSyncStatusMock.mockResolvedValueOnce({
      status: "success",
      source: "litellm",
      successCount: 10,
      failureCount: 0,
      failureReason: null,
      syncedAt: new Date("2026-02-28T00:00:00.000Z"),
    });

    const req = new NextRequest("http://localhost/api/admin/billing/prices/sync", {
      method: "POST",
      headers: { authorization: AUTH_HEADER },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      source: string | null;
      success_count: number;
      failure_count: number;
      failure_reason: string | null;
      synced_at: string;
    };
    expect(body).toEqual({
      status: "success",
      source: "litellm",
      success_count: 10,
      failure_count: 0,
      failure_reason: null,
      synced_at: "2026-02-28T00:00:00.000Z",
    });
    expect(executeNowMock).toHaveBeenCalledWith("billing_price_catalog_sync");
  });

  it("should return 409 when billing price sync is already running", async () => {
    const { POST } = await import("@/app/api/admin/billing/prices/sync/route");

    executeNowMock.mockResolvedValueOnce({
      taskName: "billing_price_catalog_sync",
      triggerType: "manual",
      status: "running",
      successCount: 0,
      failureCount: 0,
      errorSummary: "Task is already running",
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      nextRunAt: null,
    });

    const req = new NextRequest("http://localhost/api/admin/billing/prices/sync", {
      method: "POST",
      headers: { authorization: AUTH_HEADER },
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    expect(getLatestBillingSyncStatusMock).not.toHaveBeenCalled();
  });

  it("should return 500 when sync throws", async () => {
    const { POST } = await import("@/app/api/admin/billing/prices/sync/route");

    executeNowMock.mockRejectedValueOnce(new Error("boom"));
    const req = new NextRequest("http://localhost/api/admin/billing/prices/sync", {
      method: "POST",
      headers: { authorization: AUTH_HEADER },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
