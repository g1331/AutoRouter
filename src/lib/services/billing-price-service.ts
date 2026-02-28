import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  billingManualPriceOverrides,
  billingModelPrices,
  billingPriceSyncHistory,
  db,
  requestBillingSnapshots,
} from "@/lib/db";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("billing-price-service");

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const LITELLM_PRICE_MAP_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const FETCH_TIMEOUT_MS = 12_000;

export type BillingPriceSource = "manual" | "openrouter" | "litellm";
export type BillingSyncStatus = "success" | "partial" | "failed";

export interface BillingResolvedPrice {
  model: string;
  source: BillingPriceSource;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
}

export interface BillingSyncSummary {
  status: BillingSyncStatus;
  source: "openrouter" | "litellm" | null;
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

interface NormalizedSyncedPrice {
  model: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  source: "openrouter" | "litellm";
}

interface ManualOverrideInput {
  model: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  note?: string | null;
}

interface UpdateManualOverrideInput {
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
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

function parseOpenRouterPrices(payload: unknown): NormalizedSyncedPrice[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const rawData = (payload as { data?: unknown }).data;
  if (!Array.isArray(rawData)) {
    return [];
  }

  const results: NormalizedSyncedPrice[] = [];
  for (const item of rawData) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const model = (item as { id?: unknown }).id;
    const pricing = (item as { pricing?: unknown }).pricing;
    if (typeof model !== "string" || !model.trim() || !pricing || typeof pricing !== "object") {
      continue;
    }

    const promptCostPerToken = toNonNegativeNumber((pricing as { prompt?: unknown }).prompt);
    const completionCostPerToken = toNonNegativeNumber(
      (pricing as { completion?: unknown }).completion
    );
    if (promptCostPerToken === null || completionCostPerToken === null) {
      continue;
    }

    results.push({
      model: model.trim(),
      inputPricePerMillion: promptCostPerToken * 1_000_000,
      outputPricePerMillion: completionCostPerToken * 1_000_000,
      source: "openrouter",
    });
  }

  return results;
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

    results.push({
      model: model.trim(),
      inputPricePerMillion: inputCostPerToken * 1_000_000,
      outputPricePerMillion: outputCostPerToken * 1_000_000,
      source: "litellm",
    });
  }

  return results;
}

async function persistSyncedPrices(
  source: "openrouter" | "litellm",
  prices: NormalizedSyncedPrice[]
): Promise<number> {
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(billingModelPrices)
      .set({
        isActive: false,
        updatedAt: now,
      })
      .where(eq(billingModelPrices.source, source));

    for (const price of prices) {
      await tx
        .insert(billingModelPrices)
        .values({
          model: price.model,
          inputPricePerMillion: price.inputPricePerMillion,
          outputPricePerMillion: price.outputPricePerMillion,
          source,
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
  source: "openrouter" | "litellm" | null;
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
 * Sync model prices from OpenRouter first, then LiteLLM as fallback.
 */
export async function syncBillingModelPrices(): Promise<BillingSyncSummary> {
  const syncedAt = new Date();
  let openRouterError: string | null = null;

  try {
    const payload = await fetchJsonWithTimeout(OPENROUTER_MODELS_URL);
    const prices = parseOpenRouterPrices(payload);
    if (prices.length === 0) {
      throw new Error("OpenRouter returned no valid price rows");
    }

    const successCount = await persistSyncedPrices("openrouter", prices);
    const result: BillingSyncSummary = {
      status: "success",
      source: "openrouter",
      successCount,
      failureCount: 0,
      failureReason: null,
      syncedAt,
    };
    await saveSyncHistory(result);
    return result;
  } catch (error) {
    openRouterError = error instanceof Error ? error.message : String(error);
    log.warn({ err: error }, "openrouter price sync failed, fallback to litellm");
  }

  try {
    const payload = await fetchJsonWithTimeout(LITELLM_PRICE_MAP_URL);
    const prices = parseLiteLLMPrices(payload);
    if (prices.length === 0) {
      throw new Error("LiteLLM returned no valid price rows");
    }

    const successCount = await persistSyncedPrices("litellm", prices);
    const result: BillingSyncSummary = {
      status: "partial",
      source: "litellm",
      successCount,
      failureCount: openRouterError ? 1 : 0,
      failureReason: openRouterError,
      syncedAt,
    };
    await saveSyncHistory(result);
    return result;
  } catch (litellmError) {
    const fallbackError =
      litellmError instanceof Error ? litellmError.message : String(litellmError);
    const failureReason = `openrouter: ${openRouterError ?? "unknown"}; litellm: ${fallbackError}`;
    const result: BillingSyncSummary = {
      status: "failed",
      source: null,
      successCount: 0,
      failureCount: 2,
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
    };
  }

  const synced = await db.query.billingModelPrices.findFirst({
    where: and(
      eq(billingModelPrices.model, normalizedModel),
      eq(billingModelPrices.isActive, true)
    ),
    orderBy: [desc(billingModelPrices.syncedAt)],
  });
  if (!synced) {
    return null;
  }

  return {
    model: normalizedModel,
    source: synced.source as "openrouter" | "litellm",
    inputPricePerMillion: synced.inputPricePerMillion,
    outputPricePerMillion: synced.outputPricePerMillion,
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
    source: (latest.source as "openrouter" | "litellm" | null) ?? null,
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
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: billingManualPriceOverrides.model,
      set: {
        inputPricePerMillion: input.inputPricePerMillion,
        outputPricePerMillion: input.outputPricePerMillion,
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
    const overrides = await db.query.billingManualPriceOverrides.findMany({
      where: inArray(billingManualPriceOverrides.model, models),
    });
    const overrideModelSet = new Set(overrides.map((item) => item.model));
    for (const entry of grouped.values()) {
      entry.hasManualOverride = overrideModelSet.has(entry.model);
    }
  }

  return [...grouped.values()];
}
