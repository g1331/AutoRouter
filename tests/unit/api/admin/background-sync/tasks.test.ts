import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { listTaskStatesMock, executeNowMock, updateTaskConfigMock, getTaskDefinitionMock } =
  vi.hoisted(() => ({
    listTaskStatesMock: vi.fn(),
    executeNowMock: vi.fn(),
    updateTaskConfigMock: vi.fn(),
    getTaskDefinitionMock: vi.fn(),
  }));

vi.mock("@/lib/utils/auth", () => ({
  validateAdminAuth: vi.fn((authHeader) => authHeader === "Bearer valid-token"),
}));

vi.mock("@/lib/services/background-sync", () => ({
  getBackgroundSyncScheduler: () => ({
    listTaskStates: (...args: unknown[]) => listTaskStatesMock(...args),
    executeNow: (...args: unknown[]) => executeNowMock(...args),
    updateTaskConfig: (...args: unknown[]) => updateTaskConfigMock(...args),
    getTaskDefinition: (...args: unknown[]) => getTaskDefinitionMock(...args),
  }),
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const AUTH_HEADER = "Bearer valid-token";

describe("Admin background sync tasks API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated list requests", async () => {
    const { GET } = await import("@/app/api/admin/background-sync/tasks/route");
    const req = new NextRequest("http://localhost/api/admin/background-sync/tasks", {
      method: "GET",
    });

    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("lists background sync task states", async () => {
    const { GET } = await import("@/app/api/admin/background-sync/tasks/route");

    listTaskStatesMock.mockResolvedValueOnce([
      {
        taskName: "billing_price_catalog_sync",
        displayName: "Price catalog sync",
        enabled: true,
        intervalSeconds: 86_400,
        startupDelaySeconds: 60,
        isRunning: false,
        lastStartedAt: new Date("2026-04-25T00:00:00.000Z"),
        lastFinishedAt: new Date("2026-04-25T00:00:01.000Z"),
        lastSuccessAt: new Date("2026-04-25T00:00:01.000Z"),
        lastFailedAt: null,
        lastStatus: "success",
        lastError: null,
        lastDurationMs: 1_000,
        lastSuccessCount: 12,
        lastFailureCount: 0,
        nextRunAt: new Date("2026-04-26T00:00:01.000Z"),
        updatedAt: new Date("2026-04-25T00:00:01.000Z"),
      },
    ]);

    const req = new NextRequest("http://localhost/api/admin/background-sync/tasks", {
      method: "GET",
      headers: { authorization: AUTH_HEADER },
    });
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      items: [
        {
          task_name: "billing_price_catalog_sync",
          display_name: "Price catalog sync",
          enabled: true,
          interval_seconds: 86_400,
          startup_delay_seconds: 60,
          is_running: false,
          last_started_at: "2026-04-25T00:00:00.000Z",
          last_finished_at: "2026-04-25T00:00:01.000Z",
          last_success_at: "2026-04-25T00:00:01.000Z",
          last_failed_at: null,
          last_status: "success",
          last_error: null,
          last_duration_ms: 1_000,
          last_success_count: 12,
          last_failure_count: 0,
          next_run_at: "2026-04-26T00:00:01.000Z",
          updated_at: "2026-04-25T00:00:01.000Z",
        },
      ],
      total: 1,
    });
  });

  it("returns 401 for unauthenticated config update requests", async () => {
    const { PATCH } = await import("@/app/api/admin/background-sync/tasks/[taskName]/route");
    const req = new NextRequest(
      "http://localhost/api/admin/background-sync/tasks/billing_price_catalog_sync",
      {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      }
    );

    const res = await PATCH(req, {
      params: Promise.resolve({ taskName: "billing_price_catalog_sync" }),
    });

    expect(res.status).toBe(401);
  });

  it("updates a known background sync task config", async () => {
    const { PATCH } = await import("@/app/api/admin/background-sync/tasks/[taskName]/route");

    getTaskDefinitionMock.mockReturnValueOnce({ taskName: "billing_price_catalog_sync" });
    updateTaskConfigMock.mockResolvedValueOnce({
      taskName: "billing_price_catalog_sync",
      displayName: "Price catalog sync",
      enabled: false,
      intervalSeconds: 7_200,
      startupDelaySeconds: 60,
      isRunning: false,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastSuccessAt: null,
      lastFailedAt: null,
      lastStatus: null,
      lastError: null,
      lastDurationMs: null,
      lastSuccessCount: 0,
      lastFailureCount: 0,
      nextRunAt: null,
      updatedAt: new Date("2026-04-25T00:00:00.000Z"),
    });

    const req = new NextRequest(
      "http://localhost/api/admin/background-sync/tasks/billing_price_catalog_sync",
      {
        method: "PATCH",
        headers: { authorization: AUTH_HEADER },
        body: JSON.stringify({ enabled: false, interval_seconds: 7_200 }),
      }
    );
    const res = await PATCH(req, {
      params: Promise.resolve({ taskName: "billing_price_catalog_sync" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(updateTaskConfigMock).toHaveBeenCalledWith("billing_price_catalog_sync", {
      enabled: false,
      intervalSeconds: 7_200,
    });
    expect(body).toMatchObject({
      task_name: "billing_price_catalog_sync",
      enabled: false,
      interval_seconds: 7_200,
      next_run_at: null,
    });
  });

  it("returns 400 for invalid config update payloads", async () => {
    const { PATCH } = await import("@/app/api/admin/background-sync/tasks/[taskName]/route");

    getTaskDefinitionMock.mockReturnValueOnce({ taskName: "billing_price_catalog_sync" });
    const req = new NextRequest(
      "http://localhost/api/admin/background-sync/tasks/billing_price_catalog_sync",
      {
        method: "PATCH",
        headers: { authorization: AUTH_HEADER },
        body: JSON.stringify({ interval_seconds: 59 }),
      }
    );
    const res = await PATCH(req, {
      params: Promise.resolve({ taskName: "billing_price_catalog_sync" }),
    });

    expect(res.status).toBe(400);
    expect(updateTaskConfigMock).not.toHaveBeenCalled();
  });

  it("returns 404 when updating an unknown task config", async () => {
    const { PATCH } = await import("@/app/api/admin/background-sync/tasks/[taskName]/route");

    getTaskDefinitionMock.mockReturnValueOnce(null);

    const req = new NextRequest("http://localhost/api/admin/background-sync/tasks/missing", {
      method: "PATCH",
      headers: { authorization: AUTH_HEADER },
      body: JSON.stringify({ enabled: true }),
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ taskName: "missing" }),
    });

    expect(res.status).toBe(404);
    expect(updateTaskConfigMock).not.toHaveBeenCalled();
  });

  it("returns 401 for unauthenticated manual run requests", async () => {
    const { POST } = await import("@/app/api/admin/background-sync/tasks/[taskName]/run/route");
    const req = new NextRequest(
      "http://localhost/api/admin/background-sync/tasks/billing_price_catalog_sync/run",
      { method: "POST" }
    );

    const res = await POST(req, {
      params: Promise.resolve({ taskName: "billing_price_catalog_sync" }),
    });

    expect(res.status).toBe(401);
  });

  it("runs a known background sync task manually", async () => {
    const { POST } = await import("@/app/api/admin/background-sync/tasks/[taskName]/run/route");

    getTaskDefinitionMock.mockReturnValueOnce({ taskName: "billing_price_catalog_sync" });
    executeNowMock.mockResolvedValueOnce({
      taskName: "billing_price_catalog_sync",
      triggerType: "manual",
      status: "success",
      successCount: 12,
      failureCount: 0,
      errorSummary: null,
      startedAt: new Date("2026-04-25T00:00:00.000Z"),
      finishedAt: new Date("2026-04-25T00:00:01.000Z"),
      durationMs: 1_000,
      nextRunAt: new Date("2026-04-26T00:00:01.000Z"),
    });

    const req = new NextRequest(
      "http://localhost/api/admin/background-sync/tasks/billing_price_catalog_sync/run",
      { method: "POST", headers: { authorization: AUTH_HEADER } }
    );
    const res = await POST(req, {
      params: Promise.resolve({ taskName: "billing_price_catalog_sync" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(executeNowMock).toHaveBeenCalledWith("billing_price_catalog_sync");
    expect(body).toEqual({
      task_name: "billing_price_catalog_sync",
      trigger_type: "manual",
      status: "success",
      success_count: 12,
      failure_count: 0,
      error_summary: null,
      started_at: "2026-04-25T00:00:00.000Z",
      finished_at: "2026-04-25T00:00:01.000Z",
      duration_ms: 1_000,
      next_run_at: "2026-04-26T00:00:01.000Z",
    });
  });

  it("returns running status when the task is already running", async () => {
    const { POST } = await import("@/app/api/admin/background-sync/tasks/[taskName]/run/route");

    getTaskDefinitionMock.mockReturnValueOnce({ taskName: "billing_price_catalog_sync" });
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

    const req = new NextRequest(
      "http://localhost/api/admin/background-sync/tasks/billing_price_catalog_sync/run",
      { method: "POST", headers: { authorization: AUTH_HEADER } }
    );
    const res = await POST(req, {
      params: Promise.resolve({ taskName: "billing_price_catalog_sync" }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("running");
    expect(body.error_summary).toBe("Task is already running");
  });

  it("returns 404 for unknown task names", async () => {
    const { POST } = await import("@/app/api/admin/background-sync/tasks/[taskName]/run/route");

    getTaskDefinitionMock.mockReturnValueOnce(null);

    const req = new NextRequest("http://localhost/api/admin/background-sync/tasks/missing/run", {
      method: "POST",
      headers: { authorization: AUTH_HEADER },
    });
    const res = await POST(req, {
      params: Promise.resolve({ taskName: "missing" }),
    });

    expect(res.status).toBe(404);
    expect(executeNowMock).not.toHaveBeenCalled();
  });
});
