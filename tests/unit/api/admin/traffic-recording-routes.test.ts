import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSettingsMock,
  updateSettingsMock,
  listRecordingsMock,
  getDetailMock,
  deleteRecordingMock,
  cleanupMock,
} = vi.hoisted(() => ({
  getSettingsMock: vi.fn(),
  updateSettingsMock: vi.fn(),
  listRecordingsMock: vi.fn(),
  getDetailMock: vi.fn(),
  deleteRecordingMock: vi.fn(),
  cleanupMock: vi.fn(),
}));

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
      if (authHeader === "Bearer valid-token") {
        return { kind: "admin_token" };
      }
      return actual.errorResponse("Unauthorized", 401);
    }),
  };
});

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("@/lib/services/traffic-recording-service", () => ({
  getTrafficRecordingSettings: (...args: unknown[]) => getSettingsMock(...args),
  updateTrafficRecordingSettings: (...args: unknown[]) => updateSettingsMock(...args),
  listTrafficRecordings: (...args: unknown[]) => listRecordingsMock(...args),
  getTrafficRecordingDetail: (...args: unknown[]) => getDetailMock(...args),
  deleteTrafficRecording: (...args: unknown[]) => deleteRecordingMock(...args),
  cleanupExpiredTrafficRecordings: (...args: unknown[]) => cleanupMock(...args),
}));

const AUTH_HEADER = "Bearer valid-token";

const settings = {
  enabled: true,
  mode: "failure" as const,
  redactSensitive: true,
  retentionDays: 7,
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const recording = {
  id: "recording-1",
  requestLogId: "log-1",
  apiKeyId: "key-1",
  upstreamId: "upstream-1",
  method: "POST",
  path: "v1/chat/completions",
  model: "gpt-4.1",
  statusCode: 200,
  outcome: "success" as const,
  fixturePath: "data/traffic-recordings/openai/chat/fixture.json",
  fixtureSizeBytes: 512,
  requestSizeBytes: 64,
  responseSizeBytes: 256,
  redacted: true,
  createdAt: new Date("2026-01-02T00:00:00.000Z"),
};

describe("traffic recording admin routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("guards settings with admin auth", async () => {
    const { GET } = await import("@/app/api/admin/traffic-recording/settings/route");
    const response = await GET(
      new NextRequest("http://localhost/api/admin/traffic-recording/settings")
    );

    expect(response.status).toBe(401);
  });

  it("returns settings as API fields", async () => {
    const { GET } = await import("@/app/api/admin/traffic-recording/settings/route");
    getSettingsMock.mockResolvedValueOnce(settings);

    const response = await GET(
      new NextRequest("http://localhost/api/admin/traffic-recording/settings", {
        headers: { authorization: AUTH_HEADER },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      enabled: true,
      mode: "failure",
      redact_sensitive: true,
      retention_days: 7,
      updated_at: "2026-01-01T00:00:00.000Z",
    });
  });

  it("updates settings from API fields", async () => {
    const { PATCH } = await import("@/app/api/admin/traffic-recording/settings/route");
    updateSettingsMock.mockResolvedValueOnce({ ...settings, enabled: false, mode: "all" });

    const response = await PATCH(
      new NextRequest("http://localhost/api/admin/traffic-recording/settings", {
        method: "PATCH",
        headers: { authorization: AUTH_HEADER, "content-type": "application/json" },
        body: JSON.stringify({
          enabled: false,
          mode: "all",
          redact_sensitive: true,
          retention_days: 14,
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(updateSettingsMock).toHaveBeenCalledWith({
      enabled: false,
      mode: "all",
      redactSensitive: true,
      retentionDays: 14,
    });
  });

  it("lists recordings with supported filters", async () => {
    const { GET } = await import("@/app/api/admin/traffic-recordings/route");
    listRecordingsMock.mockResolvedValueOnce({
      items: [recording],
      total: 1,
      page: 2,
      pageSize: 10,
      totalPages: 3,
      stats: {
        total: 1,
        totalSizeBytes: 512,
        latestCreatedAt: recording.createdAt,
      },
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/admin/traffic-recordings?page=2&page_size=10&status_code=200&model=gpt&start_time=2026-01-01T00:00:00.000Z&end_time=2026-01-03T00:00:00.000Z",
        { headers: { authorization: AUTH_HEADER } }
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(listRecordingsMock).toHaveBeenCalledWith(
      2,
      10,
      expect.objectContaining({
        statusCode: 200,
        model: "gpt",
        startTime: new Date("2026-01-01T00:00:00.000Z"),
        endTime: new Date("2026-01-03T00:00:00.000Z"),
      })
    );
    expect(body.items[0].fixture_path).toBe(recording.fixturePath);
    expect(body.stats.latest_created_at).toBe("2026-01-02T00:00:00.000Z");
  });

  it("forwards request_log_id query parameter into list filters", async () => {
    const { GET } = await import("@/app/api/admin/traffic-recordings/route");
    listRecordingsMock.mockResolvedValueOnce({
      items: [recording],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
      stats: {
        total: 1,
        totalSizeBytes: 512,
        latestCreatedAt: recording.createdAt,
      },
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/api/admin/traffic-recordings?request_log_id=log-1&page_size=1",
        { headers: { authorization: AUTH_HEADER } }
      )
    );

    expect(response.status).toBe(200);
    expect(listRecordingsMock).toHaveBeenCalledWith(
      1,
      1,
      expect.objectContaining({ requestLogId: "log-1" })
    );
  });

  it("rejects list requests without admin auth", async () => {
    const { GET } = await import("@/app/api/admin/traffic-recordings/route");

    const response = await GET(
      new NextRequest("http://localhost/api/admin/traffic-recordings?request_log_id=log-1")
    );

    expect(response.status).toBe(401);
    expect(listRecordingsMock).not.toHaveBeenCalled();
  });

  it("rejects invalid list filters", async () => {
    const { GET } = await import("@/app/api/admin/traffic-recordings/route");

    const response = await GET(
      new NextRequest("http://localhost/api/admin/traffic-recordings?status_code=abc", {
        headers: { authorization: AUTH_HEADER },
      })
    );

    expect(response.status).toBe(400);
    expect(listRecordingsMock).not.toHaveBeenCalled();
  });

  it("returns recording detail and deletes recordings", async () => {
    const route = await import("@/app/api/admin/traffic-recordings/[id]/route");
    getDetailMock.mockResolvedValueOnce({
      ...recording,
      fixture: { meta: { requestId: "req-1" } },
    });
    deleteRecordingMock.mockResolvedValueOnce(true);

    const getResponse = await route.GET(
      new NextRequest("http://localhost/api/admin/traffic-recordings/recording-1", {
        headers: { authorization: AUTH_HEADER },
      }),
      { params: Promise.resolve({ id: "recording-1" }) }
    );
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getBody.fixture).toEqual({ meta: { requestId: "req-1" } });

    const deleteResponse = await route.DELETE(
      new NextRequest("http://localhost/api/admin/traffic-recordings/recording-1", {
        method: "DELETE",
        headers: { authorization: AUTH_HEADER },
      }),
      { params: Promise.resolve({ id: "recording-1" }) }
    );
    const deleteBody = await deleteResponse.json();

    expect(deleteResponse.status).toBe(200);
    expect(deleteBody).toEqual({ deleted: true });
  });

  it("runs cleanup from the manual endpoint", async () => {
    const { POST } = await import("@/app/api/admin/traffic-recordings/cleanup/route");
    cleanupMock.mockResolvedValueOnce({
      deletedCount: 2,
      failureCount: 1,
      errorSummary: "Failed to delete recordings: recording-3",
    });

    const response = await POST(
      new NextRequest("http://localhost/api/admin/traffic-recordings/cleanup", {
        method: "POST",
        headers: { authorization: AUTH_HEADER },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      deleted_count: 2,
      failure_count: 1,
      error_summary: "Failed to delete recordings: recording-3",
    });
  });
});
