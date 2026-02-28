import { and, count, desc, eq, inArray, isNotNull, like } from "drizzle-orm";
import {
  billingManualPriceOverrides,
  billingModelPrices,
  billingPriceSyncHistory,
  db,
  requestBillingSnapshots,
} from "@/lib/db";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("billing-price-service");

const LITELLM_PRICE_MAP_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const FETCH_TIMEOUT_MS = 12_000;

export type BillingPriceSource = "manual" | "litellm";
export type BillingSyncStatus = "success" | "partial" | "failed";

export interface BillingResolvedPrice {
  model: string;
  source: BillingPriceSource;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cacheReadInputPricePerMillion: number | null;
  cacheWriteInputPricePerMillion: number | null;
}

export interface BillingSyncSummary {
  status: BillingSyncStatus;
  source: "litellm" | null;
  successCount: number;
  failureCount: number;
  failureReason: string | null;
  syncedAt: Date;
}

export interface BillingManualPriceOverrideRecord {
  id: string;
  model: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cacheReadInputPricePerMillion: number | null;
  cacheWriteInputPricePerMillion: number | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingUnresolvedModel {
  model: string;
  occurrences: number;
  lastSeenAt: Date;
  lastUpstreamId: string | null;
  lastUpstreamName: string | null;
  hasManualOverride: boolean;
}

export interface BillingModelPriceCatalogItem {
  id: string;
  model: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cacheReadInputPricePerMillion: number | null;
  cacheWriteInputPricePerMillion: number | null;
  source: "litellm";
  isActive: boolean;
  syncedAt: Date;
  updatedAt: Date;
}

export interface ListBillingModelPricesInput {
  page?: number;
  pageSize?: number;
  modelQuery?: string;
  source?: "litellm";
  activeOnly?: boolean;
}

export interface PaginatedBillingModelPrices {
  items: BillingModelPriceCatalogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface NormalizedSyncedPrice {
  model: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cacheReadInputPricePerMillion: number | null;
  cacheWriteInputPricePerMillion: number | null;
  source: "litellm";
}

interface ManualOverrideInput {
  model: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cacheReadInputPricePerMillion?: number | null;
  cacheWriteInputPricePerMillion?: number | null;
  note?: string | null;
}

interface UpdateManualOverrideInput {
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
  cacheReadInputPricePerMillion?: number | null;
  cacheWriteInputPricePerMillion?: number | null;
  note?: string | null;
}

function toNonNegativeNumber(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || Number.isNaN(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

async function fetchJsonWithTimeout(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function parseLiteLLMPrices(payload: unknown): NormalizedSyncedPrice[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const entries = Object.entries(payload as Record<string, unknown>);
  const results: NormalizedSyncedPrice[] = [];

  for (const [model, rawValue] of entries) {
    if (!rawValue || typeof rawValue !== "object") {
      continue;
    }

    const inputCostPerToken = toNonNegativeNumber(
      (rawValue as { input_cost_per_token?: unknown }).input_cost_per_token
    );
    const outputCostPerToken = toNonNegativeNumber(
      (rawValue as { output_cost_per_token?: unknown }).output_cost_per_token
    );
    if (inputCostPerToken === null || outputCostPerToken === null) {
      continue;
    }
    const cacheReadCostPerToken = toNonNegativeNumber(
      (rawValue as { cache_read_input_token_cost?: unknown }).cache_read_input_token_cost
    );
    const cacheWriteCostPerToken = toNonNegativeNumber(
      (rawValue as { cache_creation_input_token_cost?: unknown }).cache_creation_input_token_cost
    );

    results.push({
      model: model.trim(),
      inputPricePerMillion: inputCostPerToken * 1_000_000,
      outputPricePerMillion: outputCostPerToken * 1_000_000,
      cacheReadInputPricePerMillion:
        cacheReadCostPerToken === null ? null : cacheReadCostPerToken * 1_000_000,
      cacheWriteInputPricePerMillion:
        cacheWriteCostPerToken === null ? null : cacheWriteCostPerToken * 1_000_000,
      source: "litellm",
    });
  }

  return results;
}

async function persistSyncedPrices(prices: NormalizedSyncedPrice[]): Promise<number> {
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(billingModelPrices)
      .set({
        isActive: false,
        updatedAt: now,
      })
      .where(eq(billingModelPrices.isActive, true));

    for (const price of prices) {
      await tx
        .insert(billingModelPrices)
        .values({
          model: price.model,
          inputPricePerMillion: price.inputPricePerMillion,
          outputPricePerMillion: price.outputPricePerMillion,
          cacheReadInputPricePerMillion: price.cacheReadInputPricePerMillion,
          cacheWriteInputPricePerMillion: price.cacheWriteInputPricePerMillion,
          source: "litellm",
          isActive: true,
          syncedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [billingModelPrices.model, billingModelPrices.source],
          set: {
            inputPricePerMillion: price.inputPricePerMillion,
            outputPricePerMillion: price.outputPricePerMillion,
            cacheReadInputPricePerMillion: price.cacheReadInputPricePerMillion,
            cacheWriteInputPricePerMillion: price.cacheWriteInputPricePerMillion,
            isActive: true,
            syncedAt: now,
            updatedAt: now,
          },
        });
    }
  });

  return prices.length;
}

async function saveSyncHistory(entry: {
  status: BillingSyncStatus;
  source: "litellm" | null;
  successCount: number;
  failureCount: number;
  failureReason: string | null;
}): Promise<void> {
  await db.insert(billingPriceSyncHistory).values({
    status: entry.status,
    source: entry.source,
    successCount: entry.successCount,
    failureCount: entry.failureCount,
    failureReason: entry.failureReason,
    createdAt: new Date(),
  });
}

/**
 * Sync model prices from LiteLLM price map.
 */
export async function syncBillingModelPrices(): Promise<BillingSyncSummary> {
  const syncedAt = new Date();

  try {
    const payload = await fetchJsonWithTimeout(LITELLM_PRICE_MAP_URL);
    const prices = parseLiteLLMPrices(payload);
    if (prices.length === 0) {
      throw new Error("LiteLLM returned no valid price rows");
    }

    const successCount = await persistSyncedPrices(prices);
    const result: BillingSyncSummary = {
      status: "success",
      source: "litellm",
      successCount,
      failureCount: 0,
      failureReason: null,
      syncedAt,
    };
    await saveSyncHistory(result);
    return result;
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : String(error);
    log.warn({ err: error }, "litellm price sync failed");
    const result: BillingSyncSummary = {
      status: "failed",
      source: null,
      successCount: 0,
      failureCount: 1,
      failureReason,
      syncedAt,
    };
    await saveSyncHistory(result);
    return result;
  }
}

/**
 * Resolve model price with priority: manual override > synced prices.
 */
export async function resolveBillingModelPrice(
  model: string | null
): Promise<BillingResolvedPrice | null> {
  const normalizedModel = model?.trim();
  if (!normalizedModel) {
    return null;
  }

  const manual = await db.query.billingManualPriceOverrides.findFirst({
    where: eq(billingManualPriceOverrides.model, normalizedModel),
  });
  if (manual) {
    return {
      model: normalizedModel,
      source: "manual",
      inputPricePerMillion: manual.inputPricePerMillion,
      outputPricePerMillion: manual.outputPricePerMillion,
      cacheReadInputPricePerMillion: manual.cacheReadInputPricePerMillion,
      cacheWriteInputPricePerMillion: manual.cacheWriteInputPricePerMillion,
    };
  }

  const synced = await db.query.billingModelPrices.findFirst({
    where: and(
      eq(billingModelPrices.model, normalizedModel),
      eq(billingModelPrices.source, "litellm"),
      eq(billingModelPrices.isActive, true)
    ),
    orderBy: [desc(billingModelPrices.syncedAt)],
  });
  if (!synced) {
    return null;
  }

  return {
    model: normalizedModel,
    source: "litellm",
    inputPricePerMillion: synced.inputPricePerMillion,
    outputPricePerMillion: synced.outputPricePerMillion,
    cacheReadInputPricePerMillion: synced.cacheReadInputPricePerMillion,
    cacheWriteInputPricePerMillion: synced.cacheWriteInputPricePerMillion,
  };
}

/**
 * Get latest sync status for billing overview.
 */
export async function getLatestBillingSyncStatus(): Promise<BillingSyncSummary | null> {
  const latest = await db.query.billingPriceSyncHistory.findFirst({
    orderBy: [desc(billingPriceSyncHistory.createdAt)],
  });
  if (!latest) {
    return null;
  }

  return {
    status: latest.status as BillingSyncStatus,
    source: latest.source === "litellm" ? "litellm" : null,
    successCount: latest.successCount,
    failureCount: latest.failureCount,
    failureReason: latest.failureReason,
    syncedAt: latest.createdAt,
  };
}

export async function listBillingManualPriceOverrides(): Promise<
  BillingManualPriceOverrideRecord[]
> {
  const rows = await db.query.billingManualPriceOverrides.findMany({
    orderBy: [desc(billingManualPriceOverrides.updatedAt)],
  });
  return rows.map((row) => ({
    id: row.id,
    model: row.model,
    inputPricePerMillion: row.inputPricePerMillion,
    outputPricePerMillion: row.outputPricePerMillion,
    cacheReadInputPricePerMillion: row.cacheReadInputPricePerMillion,
    cacheWriteInputPricePerMillion: row.cacheWriteInputPricePerMillion,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function createBillingManualPriceOverride(
  input: ManualOverrideInput
): Promise<BillingManualPriceOverrideRecord> {
  const now = new Date();
  const [row] = await db
    .insert(billingManualPriceOverrides)
    .values({
      model: input.model.trim(),
      inputPricePerMillion: input.inputPricePerMillion,
      outputPricePerMillion: input.outputPricePerMillion,
      cacheReadInputPricePerMillion: input.cacheReadInputPricePerMillion ?? null,
      cacheWriteInputPricePerMillion: input.cacheWriteInputPricePerMillion ?? null,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: billingManualPriceOverrides.model,
      set: {
        inputPricePerMillion: input.inputPricePerMillion,
        outputPricePerMillion: input.outputPricePerMillion,
        cacheReadInputPricePerMillion: input.cacheReadInputPricePerMillion ?? null,
        cacheWriteInputPricePerMillion: input.cacheWriteInputPricePerMillion ?? null,
        note: input.note ?? null,
        updatedAt: now,
      },
    })
    .returning();

  return {
    id: row.id,
    model: row.model,
    inputPricePerMillion: row.inputPricePerMillion,
    outputPricePerMillion: row.outputPricePerMillion,
    cacheReadInputPricePerMillion: row.cacheReadInputPricePerMillion,
    cacheWriteInputPricePerMillion: row.cacheWriteInputPricePerMillion,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function updateBillingManualPriceOverride(
  id: string,
  input: UpdateManualOverrideInput
): Promise<BillingManualPriceOverrideRecord | null> {
  const updateValues: Partial<typeof billingManualPriceOverrides.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.inputPricePerMillion !== undefined) {
    updateValues.inputPricePerMillion = input.inputPricePerMillion;
  }
  if (input.outputPricePerMillion !== undefined) {
    updateValues.outputPricePerMillion = input.outputPricePerMillion;
  }
  if (input.cacheReadInputPricePerMillion !== undefined) {
    updateValues.cacheReadInputPricePerMillion = input.cacheReadInputPricePerMillion;
  }
  if (input.cacheWriteInputPricePerMillion !== undefined) {
    updateValues.cacheWriteInputPricePerMillion = input.cacheWriteInputPricePerMillion;
  }
  if (input.note !== undefined) {
    updateValues.note = input.note;
  }

  const [row] = await db
    .update(billingManualPriceOverrides)
    .set(updateValues)
    .where(eq(billingManualPriceOverrides.id, id))
    .returning();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    model: row.model,
    inputPricePerMillion: row.inputPricePerMillion,
    outputPricePerMillion: row.outputPricePerMillion,
    cacheReadInputPricePerMillion: row.cacheReadInputPricePerMillion,
    cacheWriteInputPricePerMillion: row.cacheWriteInputPricePerMillion,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function deleteBillingManualPriceOverride(id: string): Promise<boolean> {
  const rows = await db
    .delete(billingManualPriceOverrides)
    .where(eq(billingManualPriceOverrides.id, id))
    .returning({ id: billingManualPriceOverrides.id });
  return rows.length > 0;
}

export async function listBillingUnresolvedModels(): Promise<BillingUnresolvedModel[]> {
  const rows = await db.query.requestBillingSnapshots.findMany({
    where: and(
      eq(requestBillingSnapshots.billingStatus, "unbilled"),
      eq(requestBillingSnapshots.unbillableReason, "price_not_found"),
      isNotNull(requestBillingSnapshots.model)
    ),
    with: {
      upstream: true,
    },
    orderBy: [desc(requestBillingSnapshots.createdAt)],
  });

  const grouped = new Map<string, BillingUnresolvedModel>();
  for (const row of rows) {
    if (!row.model) {
      continue;
    }
    const existing = grouped.get(row.model);
    if (!existing) {
      grouped.set(row.model, {
        model: row.model,
        occurrences: 1,
        lastSeenAt: row.createdAt,
        lastUpstreamId: row.upstreamId,
        lastUpstreamName: row.upstream?.name ?? null,
        hasManualOverride: false,
      });
      continue;
    }
    existing.occurrences += 1;
  }

  const models = [...grouped.keys()];
  if (models.length > 0) {
    const [overrides, priced] = await Promise.all([
      db.query.billingManualPriceOverrides.findMany({
        where: inArray(billingManualPriceOverrides.model, models),
      }),
      db.query.billingModelPrices.findMany({
        where: and(
          inArray(billingModelPrices.model, models),
          eq(billingModelPrices.source, "litellm"),
          eq(billingModelPrices.isActive, true)
        ),
        columns: {
          model: true,
        },
      }),
    ]);

    const overrideModelSet = new Set(overrides.map((item) => item.model));
    const pricedModelSet = new Set(priced.map((item) => item.model));
    for (const entry of grouped.values()) {
      entry.hasManualOverride = overrideModelSet.has(entry.model);
    }

    // Hide resolved models from unresolved list:
    // - has manual override, OR
    // - now exists in synced price catalog
    return [...grouped.values()].filter(
      (entry) => !overrideModelSet.has(entry.model) && !pricedModelSet.has(entry.model)
    );
  }

  return [...grouped.values()];
}

export async function listBillingModelPrices(
  input: ListBillingModelPricesInput = {}
): Promise<PaginatedBillingModelPrices> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  const offset = (page - 1) * pageSize;
  const modelQuery = input.modelQuery?.trim();

  const conditions = [];
  conditions.push(eq(billingModelPrices.source, "litellm"));
  if (modelQuery) {
    conditions.push(like(billingModelPrices.model, `%${modelQuery}%`));
  }
  if (input.activeOnly === true) {
    conditions.push(eq(billingModelPrices.isActive, true));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const [totalRows, rows] = await Promise.all([
    db.select({ value: count() }).from(billingModelPrices).where(whereClause),
    db.query.billingModelPrices.findMany({
      where: whereClause,
      orderBy: [desc(billingModelPrices.syncedAt), desc(billingModelPrices.updatedAt)],
      limit: pageSize,
      offset,
    }),
  ]);

  const total = totalRows[0]?.value ?? 0;
  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

  return {
    items: rows.map((row) => ({
      id: row.id,
      model: row.model,
      inputPricePerMillion: row.inputPricePerMillion,
      outputPricePerMillion: row.outputPricePerMillion,
      cacheReadInputPricePerMillion: row.cacheReadInputPricePerMillion,
      cacheWriteInputPricePerMillion: row.cacheWriteInputPricePerMillion,
      source: "litellm",
      isActive: row.isActive,
      syncedAt: row.syncedAt,
      updatedAt: row.updatedAt,
    })),
    total,
    page,
    pageSize,
    totalPages,
  };
}
