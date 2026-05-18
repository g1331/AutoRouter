import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbInsertMock, dbUpdateMock, dbSelectMock, dbDeleteMock, findFirstMock, findManyMock } =
  vi.hoisted(() => ({
    dbInsertMock: vi.fn(),
    dbUpdateMock: vi.fn(),
    dbSelectMock: vi.fn(),
    dbDeleteMock: vi.fn(),
    findFirstMock: vi.fn(),
    findManyMock: vi.fn(),
  }));

const { statMock, readFileMock, unlinkMock } = vi.hoisted(() => ({
  statMock: vi.fn(),
  readFileMock: vi.fn(),
  unlinkMock: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: {
    stat: statMock,
    readFile: readFileMock,
    unlink: unlinkMock,
  },
  stat: statMock,
  readFile: readFileMock,
  unlink: unlinkMock,
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    and: vi.fn((...args) => ({ op: "and", args })),
    count: vi.fn(() => ({ op: "count" })),
    desc: vi.fn((column) => ({ op: "desc", column })),
    eq: vi.fn((column, value) => ({ op: "eq", column, value })),
    gte: vi.fn((column, value) => ({ op: "gte", column, value })),
    lte: vi.fn((column, value) => ({ op: "lte", column, value })),
    lt: vi.fn((column, value) => ({ op: "lt", column, value })),
    sql: vi.fn((strings, ...values) => ({ raw: strings.join("?"), values })),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    insert: (...args: unknown[]) => dbInsertMock(...args),
    update: (...args: unknown[]) => dbUpdateMock(...args),
    select: (...args: unknown[]) => dbSelectMock(...args),
    delete: (...args: unknown[]) => dbDeleteMock(...args),
    query: {
      trafficRecordingSettings: {
        findFirst: (...args: unknown[]) => findFirstMock(...args),
      },
      trafficRecordings: {
        findFirst: (...args: unknown[]) => findFirstMock(...args),
        findMany: (...args: unknown[]) => findManyMock(...args),
      },
    },
  },
  trafficRecordingSettings: {
    id: "settings.id",
  },
  trafficRecordings: {
    id: "recordings.id",
    requestLogId: "recordings.request_log_id",
    apiKeyId: "recordings.api_key_id",
    upstreamId: "recordings.upstream_id",
    statusCode: "recordings.status_code",
    model: "recordings.model",
    fixturePath: "recordings.fixture_path",
    fixtureSizeBytes: "recordings.fixture_size_bytes",
    createdAt: "recordings.created_at",
  },
}));

vi.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

function settingsRow(overrides = {}) {
  return {
    id: "default",
    enabled: false,
    mode: "failure",
    redactSensitive: true,
    retentionDays: 7,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

function recordingRow(overrides = {}) {
  return {
    id: "recording-1",
    requestLogId: "log-1",
    apiKeyId: "key-1",
    upstreamId: "upstream-1",
    method: "POST",
    path: "v1/chat/completions",
    model: "gpt-4.1",
    statusCode: 200,
    outcome: "success",
    fixturePath: "data/traffic-recordings/openai/chat/fixture.json",
    fixtureSizeBytes: 512,
    requestSizeBytes: 64,
    responseSizeBytes: 256,
    redacted: true,
    createdAt: "2026-01-03T00:00:00.000Z",
    ...overrides,
  };
}

describe("traffic-recording-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RECORDER_FIXTURES_DIR;
  });

  it("reads default settings after initializing the singleton row", async () => {
    const { getTrafficRecordingSettings } =
      await import("@/lib/services/traffic-recording-service");

    dbInsertMock.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    });
    findFirstMock.mockResolvedValueOnce(settingsRow());

    const result = await getTrafficRecordingSettings();

    expect(result).toEqual({
      enabled: false,
      mode: "failure",
      redactSensitive: true,
      retentionDays: 7,
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    });
  });

  it("updates runtime settings fields", async () => {
    const { updateTrafficRecordingSettings } =
      await import("@/lib/services/traffic-recording-service");

    dbInsertMock.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    });
    findFirstMock.mockResolvedValueOnce(settingsRow());

    const setMock = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          settingsRow({
            enabled: true,
            mode: "all",
            redactSensitive: false,
            retentionDays: 14,
          }),
        ]),
      }),
    });
    dbUpdateMock.mockReturnValueOnce({ set: setMock });

    const result = await updateTrafficRecordingSettings({
      enabled: true,
      mode: "all",
      redactSensitive: false,
      retentionDays: 14,
    });

    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        mode: "all",
        redactSensitive: false,
        retentionDays: 14,
        updatedAt: expect.any(Date),
      })
    );
    expect(result.enabled).toBe(true);
    expect(result.mode).toBe("all");
    expect(result.redactSensitive).toBe(false);
  });

  it("creates a searchable index row with measured fixture size", async () => {
    const { createTrafficRecordingIndex } =
      await import("@/lib/services/traffic-recording-service");

    statMock.mockResolvedValueOnce({ size: 1024 });
    dbInsertMock.mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([recordingRow({ fixtureSizeBytes: 1024 })]),
        }),
      }),
    });

    const result = await createTrafficRecordingIndex({
      requestLogId: "log-1",
      apiKeyId: "key-1",
      upstreamId: "upstream-1",
      method: "POST",
      path: "v1/chat/completions",
      model: "gpt-4.1",
      statusCode: 200,
      outcome: "success",
      fixturePath: "data/traffic-recordings/openai/chat/fixture.json",
      requestSizeBytes: 64,
      responseSizeBytes: 256,
      redacted: true,
    });

    expect(statMock).toHaveBeenCalledWith("data/traffic-recordings/openai/chat/fixture.json");
    expect(result.fixtureSizeBytes).toBe(1024);
    expect(result.createdAt).toEqual(new Date("2026-01-03T00:00:00.000Z"));
  });

  it("lists recordings with filters and normalized stats dates", async () => {
    const { listTrafficRecordings } = await import("@/lib/services/traffic-recording-service");

    dbSelectMock
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ value: 1 }]),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockResolvedValue([
          {
            totalSizeBytes: 512,
            latestCreatedAt: "2026-01-03T00:00:00.000Z",
          },
        ]),
      });
    findManyMock.mockResolvedValueOnce([recordingRow()]);

    const result = await listTrafficRecordings(1, 20, {
      statusCode: 200,
      model: "gpt",
      startTime: new Date("2026-01-01T00:00:00.000Z"),
      endTime: new Date("2026-01-04T00:00:00.000Z"),
    });

    expect(result.total).toBe(1);
    expect(result.items[0].model).toBe("gpt-4.1");
    expect(result.stats.latestCreatedAt).toEqual(new Date("2026-01-03T00:00:00.000Z"));
  });

  it("reads detail fixture from the configured recording root", async () => {
    const { getTrafficRecordingDetail } = await import("@/lib/services/traffic-recording-service");

    findFirstMock.mockResolvedValueOnce(recordingRow());
    readFileMock.mockResolvedValueOnce(JSON.stringify({ meta: { requestId: "req-1" } }));

    const result = await getTrafficRecordingDetail("recording-1");

    expect(readFileMock).toHaveBeenCalledWith(
      expect.stringContaining("data\\traffic-recordings\\openai\\chat\\fixture.json"),
      "utf-8"
    );
    expect(result?.fixture).toEqual({ meta: { requestId: "req-1" } });
  });

  it("deletes the fixture file and index row", async () => {
    const { deleteTrafficRecording } = await import("@/lib/services/traffic-recording-service");

    findFirstMock.mockResolvedValueOnce(recordingRow());
    unlinkMock.mockResolvedValueOnce(undefined);
    dbDeleteMock.mockReturnValueOnce({
      where: vi.fn().mockResolvedValue(undefined),
    });

    await expect(deleteTrafficRecording("recording-1")).resolves.toBe(true);
    expect(unlinkMock).toHaveBeenCalledTimes(1);
    expect(dbDeleteMock).toHaveBeenCalledTimes(1);
  });

  it("uses runtime settings when deciding whether to record traffic", async () => {
    const { shouldRecordTraffic } = await import("@/lib/services/traffic-recording-service");

    expect(shouldRecordTraffic({ enabled: false, mode: "all" }, "success")).toBe(false);
    expect(shouldRecordTraffic({ enabled: true, mode: "failure" }, "success")).toBe(false);
    expect(shouldRecordTraffic({ enabled: true, mode: "failure" }, "failure")).toBe(true);
  });
});
