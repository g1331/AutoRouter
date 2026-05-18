import { stat, readFile, unlink } from "fs/promises";
import path from "path";
import { and, count, desc, eq, gte, lte, lt, sql } from "drizzle-orm";
import { db, trafficRecordings, trafficRecordingSettings, type TrafficRecording } from "@/lib/db";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("traffic-recording-service");

export const TRAFFIC_RECORDING_SETTINGS_ID = "default";
export const DEFAULT_TRAFFIC_RECORDING_ROOT = "data/traffic-recordings";

export type TrafficRecordingMode = "all" | "success" | "failure";
export type TrafficRecordingOutcome = "success" | "failure";

export interface TrafficRecordingSettingsValue {
  enabled: boolean;
  mode: TrafficRecordingMode;
  redactSensitive: boolean;
  retentionDays: number;
  updatedAt: Date;
}

export interface TrafficRecordingSettingsUpdate {
  enabled?: boolean;
  mode?: TrafficRecordingMode;
  redactSensitive?: boolean;
  retentionDays?: number;
}

export interface CreateTrafficRecordingIndexInput {
  requestLogId?: string | null;
  apiKeyId?: string | null;
  upstreamId?: string | null;
  method?: string | null;
  path?: string | null;
  model?: string | null;
  statusCode?: number | null;
  outcome: TrafficRecordingOutcome;
  fixturePath: string;
  requestSizeBytes?: number;
  responseSizeBytes?: number;
  redacted: boolean;
  createdAt?: Date;
}

export interface TrafficRecordingListFilters {
  apiKeyId?: string;
  upstreamId?: string;
  requestLogId?: string;
  statusCode?: number;
  model?: string;
  startTime?: Date;
  endTime?: Date;
}

export interface TrafficRecordingListItem {
  id: string;
  requestLogId: string | null;
  apiKeyId: string | null;
  upstreamId: string | null;
  method: string | null;
  path: string | null;
  model: string | null;
  statusCode: number | null;
  outcome: TrafficRecordingOutcome;
  fixturePath: string;
  fixtureSizeBytes: number;
  requestSizeBytes: number;
  responseSizeBytes: number;
  redacted: boolean;
  createdAt: Date;
}

export interface TrafficRecordingDetail extends TrafficRecordingListItem {
  fixture: unknown;
}

export interface TrafficRecordingStats {
  total: number;
  totalSizeBytes: number;
  latestCreatedAt: Date | null;
}

export interface PaginatedTrafficRecordings {
  items: TrafficRecordingListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: TrafficRecordingStats;
}

export interface TrafficRecordingCleanupResult {
  deletedCount: number;
  failureCount: number;
  errorSummary: string | null;
}

function normalizeMode(value: string | null | undefined): TrafficRecordingMode {
  return value === "all" || value === "success" || value === "failure" ? value : "failure";
}

function normalizeOutcome(value: string): TrafficRecordingOutcome {
  return value === "success" ? "success" : "failure";
}

function normalizeDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

function normalizeOptionalDate(value: Date | string | number | null | undefined): Date | null {
  return value == null ? null : normalizeDate(value);
}

function mapSettings(
  row: typeof trafficRecordingSettings.$inferSelect
): TrafficRecordingSettingsValue {
  return {
    enabled: row.enabled,
    mode: normalizeMode(row.mode),
    redactSensitive: row.redactSensitive,
    retentionDays: row.retentionDays,
    updatedAt: normalizeDate(row.updatedAt),
  };
}

function mapRecording(row: TrafficRecording): TrafficRecordingListItem {
  return {
    id: row.id,
    requestLogId: row.requestLogId ?? null,
    apiKeyId: row.apiKeyId ?? null,
    upstreamId: row.upstreamId ?? null,
    method: row.method ?? null,
    path: row.path ?? null,
    model: row.model ?? null,
    statusCode: row.statusCode ?? null,
    outcome: normalizeOutcome(row.outcome),
    fixturePath: row.fixturePath,
    fixtureSizeBytes: row.fixtureSizeBytes,
    requestSizeBytes: row.requestSizeBytes,
    responseSizeBytes: row.responseSizeBytes,
    redacted: row.redacted,
    createdAt: normalizeDate(row.createdAt),
  };
}

function resolveRecordingRoot(): string {
  return path.resolve(process.env.RECORDER_FIXTURES_DIR || DEFAULT_TRAFFIC_RECORDING_ROOT);
}

function assertPathInsideRecordingRoot(filePath: string): string {
  const root = resolveRecordingRoot();
  const resolved = path.resolve(filePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Recording file is outside the configured recording root");
  }
  return resolved;
}

/** Return the configured fixture root for recorded traffic files. */
export function getTrafficRecordingRoot(): string {
  return process.env.RECORDER_FIXTURES_DIR || DEFAULT_TRAFFIC_RECORDING_ROOT;
}

/** Read the singleton runtime traffic recording settings row, creating defaults when absent. */
export async function getTrafficRecordingSettings(): Promise<TrafficRecordingSettingsValue> {
  await db
    .insert(trafficRecordingSettings)
    .values({
      id: TRAFFIC_RECORDING_SETTINGS_ID,
      enabled: false,
      mode: "failure",
      redactSensitive: true,
      retentionDays: 7,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({
      target: trafficRecordingSettings.id,
    });

  const row = await db.query.trafficRecordingSettings.findFirst({
    where: eq(trafficRecordingSettings.id, TRAFFIC_RECORDING_SETTINGS_ID),
  });

  if (!row) {
    throw new Error("Failed to initialize traffic recording settings");
  }

  return mapSettings(row);
}

/** Persist changes to the singleton runtime traffic recording settings row. */
export async function updateTrafficRecordingSettings(
  input: TrafficRecordingSettingsUpdate
): Promise<TrafficRecordingSettingsValue> {
  await getTrafficRecordingSettings();

  const [row] = await db
    .update(trafficRecordingSettings)
    .set({
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.mode !== undefined ? { mode: input.mode } : {}),
      ...(input.redactSensitive !== undefined ? { redactSensitive: input.redactSensitive } : {}),
      ...(input.retentionDays !== undefined ? { retentionDays: input.retentionDays } : {}),
      updatedAt: new Date(),
    })
    .where(eq(trafficRecordingSettings.id, TRAFFIC_RECORDING_SETTINGS_ID))
    .returning();

  if (!row) {
    throw new Error("Traffic recording settings not found");
  }

  return mapSettings(row);
}

/** Decide whether the current settings record the given request outcome. */
export function shouldRecordTraffic(
  settings: Pick<TrafficRecordingSettingsValue, "enabled" | "mode">,
  outcome: TrafficRecordingOutcome
): boolean {
  return settings.enabled && (settings.mode === "all" || settings.mode === outcome);
}

/** Create or refresh the database index row for a fixture file. */
export async function createTrafficRecordingIndex(
  input: CreateTrafficRecordingIndexInput
): Promise<TrafficRecordingListItem> {
  const fileStats = await stat(input.fixturePath);
  const [row] = await db
    .insert(trafficRecordings)
    .values({
      requestLogId: input.requestLogId ?? null,
      apiKeyId: input.apiKeyId ?? null,
      upstreamId: input.upstreamId ?? null,
      method: input.method ?? null,
      path: input.path ?? null,
      model: input.model ?? null,
      statusCode: input.statusCode ?? null,
      outcome: input.outcome,
      fixturePath: input.fixturePath,
      fixtureSizeBytes: fileStats.size,
      requestSizeBytes: input.requestSizeBytes ?? 0,
      responseSizeBytes: input.responseSizeBytes ?? 0,
      redacted: input.redacted,
      createdAt: input.createdAt ?? new Date(),
    })
    .onConflictDoUpdate({
      target: trafficRecordings.fixturePath,
      set: {
        requestLogId: input.requestLogId ?? null,
        apiKeyId: input.apiKeyId ?? null,
        upstreamId: input.upstreamId ?? null,
        method: input.method ?? null,
        path: input.path ?? null,
        model: input.model ?? null,
        statusCode: input.statusCode ?? null,
        outcome: input.outcome,
        fixtureSizeBytes: fileStats.size,
        requestSizeBytes: input.requestSizeBytes ?? 0,
        responseSizeBytes: input.responseSizeBytes ?? 0,
        redacted: input.redacted,
      },
    })
    .returning();

  return mapRecording(row);
}

/** List traffic recording indexes with pagination, filters, and aggregate stats. */
export async function listTrafficRecordings(
  page = 1,
  pageSize = 20,
  filters: TrafficRecordingListFilters = {}
): Promise<PaginatedTrafficRecordings> {
  page = Math.max(1, page);
  pageSize = Math.min(100, Math.max(1, pageSize));

  const conditions = [];
  if (filters.apiKeyId) conditions.push(eq(trafficRecordings.apiKeyId, filters.apiKeyId));
  if (filters.upstreamId) conditions.push(eq(trafficRecordings.upstreamId, filters.upstreamId));
  if (filters.requestLogId)
    conditions.push(eq(trafficRecordings.requestLogId, filters.requestLogId));
  if (filters.statusCode !== undefined)
    conditions.push(eq(trafficRecordings.statusCode, filters.statusCode));
  if (filters.startTime) conditions.push(gte(trafficRecordings.createdAt, filters.startTime));
  if (filters.endTime) conditions.push(lte(trafficRecordings.createdAt, filters.endTime));
  if (filters.model?.trim()) {
    conditions.push(
      sql`lower(${trafficRecordings.model}) like ${`%${filters.model.trim().toLowerCase()}%`}`
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const [{ value: total }] = await db
    .select({ value: count() })
    .from(trafficRecordings)
    .where(whereClause);

  const rows = await db.query.trafficRecordings.findMany({
    where: whereClause,
    orderBy: [desc(trafficRecordings.createdAt)],
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const [{ totalSizeBytes, latestCreatedAt }] = await db
    .select({
      totalSizeBytes: sql<number>`coalesce(sum(${trafficRecordings.fixtureSizeBytes}), 0)`,
      latestCreatedAt: sql<Date | null>`max(${trafficRecordings.createdAt})`,
    })
    .from(trafficRecordings);

  return {
    items: rows.map(mapRecording),
    total,
    page,
    pageSize,
    totalPages: total > 0 ? Math.ceil(total / pageSize) : 1,
    stats: {
      total,
      totalSizeBytes: Number(totalSizeBytes ?? 0),
      latestCreatedAt: normalizeOptionalDate(latestCreatedAt),
    },
  };
}

/** Read a traffic recording index together with its fixture JSON content. */
export async function getTrafficRecordingDetail(
  id: string
): Promise<TrafficRecordingDetail | null> {
  const row = await db.query.trafficRecordings.findFirst({
    where: eq(trafficRecordings.id, id),
  });
  if (!row) return null;

  const recording = mapRecording(row);
  const filePath = assertPathInsideRecordingRoot(recording.fixturePath);
  const fixture = JSON.parse(await readFile(filePath, "utf-8"));

  return {
    ...recording,
    fixture,
  };
}

/** Delete a traffic recording index and its fixture file when the file still exists. */
export async function deleteTrafficRecording(id: string): Promise<boolean> {
  const row = await db.query.trafficRecordings.findFirst({
    where: eq(trafficRecordings.id, id),
  });
  if (!row) return false;

  try {
    const filePath = assertPathInsideRecordingRoot(row.fixturePath);
    await unlink(filePath);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code !== "ENOENT") {
      log.warn({ err: error, recordingId: id }, "failed to delete traffic recording fixture");
    }
  }

  await db.delete(trafficRecordings).where(eq(trafficRecordings.id, id));
  return true;
}

/** Delete traffic recordings older than the configured retention window. */
export async function cleanupExpiredTrafficRecordings(
  now: Date = new Date()
): Promise<TrafficRecordingCleanupResult> {
  const settings = await getTrafficRecordingSettings();
  const cutoff = new Date(now.getTime() - settings.retentionDays * 24 * 60 * 60 * 1000);
  const expired = await db.query.trafficRecordings.findMany({
    where: lt(trafficRecordings.createdAt, cutoff),
    orderBy: [desc(trafficRecordings.createdAt)],
  });

  let deletedCount = 0;
  let failureCount = 0;
  const failures: string[] = [];

  for (const recording of expired) {
    const deleted = await deleteTrafficRecording(recording.id);
    if (deleted) {
      deletedCount += 1;
    } else {
      failureCount += 1;
      failures.push(recording.id);
    }
  }

  return {
    deletedCount,
    failureCount,
    errorSummary:
      failures.length > 0 ? `Failed to delete recordings: ${failures.join(", ")}` : null,
  };
}
