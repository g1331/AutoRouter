import { and, asc, count, desc, eq, inArray, isNotNull, like } from "drizzle-orm";
import {
  billingManualPriceOverrides,
  billingModelPrices,
  billingPriceSyncHistory,
  billingTierRules,
  db,
  requestBillingSnapshots,
} from "@/lib/db";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("billing-price-service");

const LITELLM_PRICE_MAP_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const FETCH_TIMEOUT_MS = 12_000;

/**
 * Raised when a manual billing tier rule uses a threshold that already exists for the same model.
 */
export class BillingTierRuleConflictError extends Error {
  constructor(message: string = "A manual tier rule with the same threshold already exists") {
    super(message);
    this.name = "BillingTierRuleConflictError";
  }
}

/**
 * Raised when a manual billing tier rule payload fails validation before persistence.
 */
export class BillingTierRuleValidationError extends Error {
  constructor(message: string = "Model must not be empty") {
    super(message);
    this.name = "BillingTierRuleValidationError";
  }
}

const BILLING_TIER_RULES_UNIQUE_CONSTRAINT = "uq_billing_tier_rules_model_source_threshold";

export type BillingPriceSource = "manual" | "litellm";
export type BillingSyncStatus = "success" | "partial" | "failed";

export interface BillingResolvedPrice {
  model: string;
  source: BillingPriceSource;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cacheReadInputPricePerMillion: number | null;
  cacheWriteInputPricePerMillion: number | null;
  matchedRuleType: "flat" | "tiered";
  matchedRuleDisplayLabel: string | null;
  appliedTierThreshold: number | null;
  modelMaxInputTokens: number | null;
  modelMaxOutputTokens: number | null;
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
  /**
   * Optional derived flag. Present when the record is returned from list endpoints that
   * also check whether an active synced price exists for this model.
   */
  hasOfficialPrice?: boolean;
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
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
  syncedTierRules: BillingTierRuleRecord[];
  source: "litellm";
  isActive: boolean;
  syncedAt: Date;
  updatedAt: Date;
}

export interface BillingTierRuleRecord {
  id: string;
  model: string;
  source: "litellm" | "manual";
  thresholdInputTokens: number;
  displayLabel: string | null;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cacheReadInputPricePerMillion: number | null;
  cacheWriteInputPricePerMillion: number | null;
  note: string | null;
  isActive: boolean;
  createdAt: Date;
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
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
  source: "litellm";
}

interface NormalizedSyncedTierRule {
  model: string;
  thresholdInputTokens: number;
  displayLabel: string | null;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cacheReadInputPricePerMillion: number | null;
  cacheWriteInputPricePerMillion: number | null;
  source: "litellm";
}

interface TierRuleInput {
  model: string;
  thresholdInputTokens: number;
  displayLabel?: string | null;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cacheReadInputPricePerMillion?: number | null;
  cacheWriteInputPricePerMillion?: number | null;
  note?: string | null;
}

interface UpdateTierRuleInput {
  thresholdInputTokens?: number;
  displayLabel?: string | null;
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
  cacheReadInputPricePerMillion?: number | null;
  cacheWriteInputPricePerMillion?: number | null;
  note?: string | null;
  isActive?: boolean;
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

function toNonNegativeInteger(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || Number.isNaN(parsed) || parsed < 0) {
    return null;
  }
  return Math.floor(parsed);
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

interface LiteLLMParseResult {
  prices: NormalizedSyncedPrice[];
  tierRules: NormalizedSyncedTierRule[];
}

const TIER_FIELD_PATTERN =
  /^(input|output)_cost_per_token_above_(\d+)k_tokens$|^(cache_read_input_token|cache_creation_input_token)_cost_above_(\d+)k_tokens$/;

function parseLiteLLMPrices(payload: unknown): LiteLLMParseResult {
  if (!payload || typeof payload !== "object") {
    return { prices: [], tierRules: [] };
  }

  const entries = Object.entries(payload as Record<string, unknown>);
  const prices: NormalizedSyncedPrice[] = [];
  const tierRuleMap = new Map<string, NormalizedSyncedTierRule>();

  for (const [model, rawValue] of entries) {
    if (!rawValue || typeof rawValue !== "object") {
      continue;
    }

    const record = rawValue as Record<string, unknown>;

    const inputCostPerToken = toNonNegativeNumber(record.input_cost_per_token);
    const outputCostPerToken = toNonNegativeNumber(record.output_cost_per_token);
    if (inputCostPerToken === null || outputCostPerToken === null) {
      continue;
    }
    const cacheReadCostPerToken = toNonNegativeNumber(record.cache_read_input_token_cost);
    const cacheWriteCostPerToken = toNonNegativeNumber(record.cache_creation_input_token_cost);
    const maxInputTokens = toNonNegativeInteger(record.max_input_tokens);
    const maxOutputTokens = toNonNegativeInteger(record.max_output_tokens);

    prices.push({
      model: model.trim(),
      inputPricePerMillion: inputCostPerToken * 1_000_000,
      outputPricePerMillion: outputCostPerToken * 1_000_000,
      cacheReadInputPricePerMillion:
        cacheReadCostPerToken === null ? null : cacheReadCostPerToken * 1_000_000,
      cacheWriteInputPricePerMillion:
        cacheWriteCostPerToken === null ? null : cacheWriteCostPerToken * 1_000_000,
      maxInputTokens,
      maxOutputTokens,
      source: "litellm",
    });

    // Extract tiered pricing fields (e.g. input_cost_per_token_above_128k_tokens)
    for (const [field, value] of Object.entries(record)) {
      const match = TIER_FIELD_PATTERN.exec(field);
      if (!match) continue;

      const costType = match[1] ?? match[3];
      const thresholdRaw = match[2] ?? match[4];
      if (!costType || !thresholdRaw) continue;

      const thresholdK = parseInt(thresholdRaw, 10);
      const thresholdTokens = thresholdK * 1_000;
      const costPerToken = toNonNegativeNumber(value);
      if (costPerToken === null) continue;

      const key = `${model.trim()}::${thresholdTokens}`;
      let rule = tierRuleMap.get(key);
      if (!rule) {
        rule = {
          model: model.trim(),
          thresholdInputTokens: thresholdTokens,
          displayLabel: `>${thresholdK}K context`,
          inputPricePerMillion: 0,
          outputPricePerMillion: 0,
          cacheReadInputPricePerMillion: null,
          cacheWriteInputPricePerMillion: null,
          source: "litellm",
        };
        tierRuleMap.set(key, rule);
      }

      const pricePerMillion = costPerToken * 1_000_000;
      if (costType === "input") {
        rule.inputPricePerMillion = pricePerMillion;
      } else if (costType === "output") {
        rule.outputPricePerMillion = pricePerMillion;
      } else if (costType === "cache_read_input_token") {
        rule.cacheReadInputPricePerMillion = pricePerMillion;
      } else if (costType === "cache_creation_input_token") {
        rule.cacheWriteInputPricePerMillion = pricePerMillion;
      }
    }
  }

  // Filter tier rules: keep only those with at least one non-zero price
  const tierRules = [...tierRuleMap.values()].filter(
    (rule) => rule.inputPricePerMillion > 0 || rule.outputPricePerMillion > 0
  );

  return { prices, tierRules };
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
          maxInputTokens: price.maxInputTokens,
          maxOutputTokens: price.maxOutputTokens,
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
            maxInputTokens: price.maxInputTokens,
            maxOutputTokens: price.maxOutputTokens,
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

async function persistSyncedTierRules(tierRules: NormalizedSyncedTierRule[]): Promise<number> {
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(billingTierRules)
      .set({ isActive: false, updatedAt: now })
      .where(eq(billingTierRules.source, "litellm"));

    for (const rule of tierRules) {
      await tx
        .insert(billingTierRules)
        .values({
          model: rule.model,
          source: "litellm",
          thresholdInputTokens: rule.thresholdInputTokens,
          displayLabel: rule.displayLabel,
          inputPricePerMillion: rule.inputPricePerMillion,
          outputPricePerMillion: rule.outputPricePerMillion,
          cacheReadInputPricePerMillion: rule.cacheReadInputPricePerMillion,
          cacheWriteInputPricePerMillion: rule.cacheWriteInputPricePerMillion,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            billingTierRules.model,
            billingTierRules.source,
            billingTierRules.thresholdInputTokens,
          ],
          set: {
            displayLabel: rule.displayLabel,
            inputPricePerMillion: rule.inputPricePerMillion,
            outputPricePerMillion: rule.outputPricePerMillion,
            cacheReadInputPricePerMillion: rule.cacheReadInputPricePerMillion,
            cacheWriteInputPricePerMillion: rule.cacheWriteInputPricePerMillion,
            isActive: true,
            updatedAt: now,
          },
        });
    }
  });

  return tierRules.length;
}

/**
 * Sync model prices from LiteLLM price map.
 */
export async function syncBillingModelPrices(): Promise<BillingSyncSummary> {
  const syncedAt = new Date();

  try {
    const payload = await fetchJsonWithTimeout(LITELLM_PRICE_MAP_URL);
    const { prices, tierRules } = parseLiteLLMPrices(payload);
    if (prices.length === 0) {
      throw new Error("LiteLLM returned no valid price rows");
    }

    const priceCount = await persistSyncedPrices(prices);
    const tierRuleCount = await persistSyncedTierRules(tierRules);
    log.info({ priceCount, tierRuleCount }, "litellm price sync completed");

    const result: BillingSyncSummary = {
      status: "success",
      source: "litellm",
      successCount: priceCount + tierRuleCount,
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
 * Resolve a model price by checking manual overrides before synced prices.
 * When promptTokens is provided, tier rules are checked and applied using
 * full replacement semantics (official provider billing behavior):
 * if prompt tokens exceed the threshold, ALL tokens use the tier rate.
 *
 * Resolution priority:
 * 1. Manual tier rules (highest matching threshold where billedInputTokens \> threshold)
 * 2. LiteLLM tier rules (highest matching threshold)
 * 3. Manual flat price override
 * 4. LiteLLM synced flat price
 */
export async function resolveBillingModelPrice(
  model: string | null,
  billedInputTokens?: number
): Promise<BillingResolvedPrice | null> {
  const normalizedModel = model?.trim();
  if (!normalizedModel) {
    return null;
  }

  const syncedCatalogPrice = await db.query.billingModelPrices.findFirst({
    where: and(
      eq(billingModelPrices.model, normalizedModel),
      eq(billingModelPrices.source, "litellm"),
      eq(billingModelPrices.isActive, true)
    ),
    orderBy: [desc(billingModelPrices.syncedAt)],
  });

  // Check tier rules when billed input tokens are provided.
  // Manual rules take priority over synced rules (consistent with flat price behavior).
  if (billedInputTokens !== undefined && billedInputTokens > 0) {
    const manualTierRule = await findMatchingTierRule(normalizedModel, billedInputTokens, "manual");
    if (manualTierRule) {
      return {
        model: normalizedModel,
        source: manualTierRule.source as BillingPriceSource,
        inputPricePerMillion: manualTierRule.inputPricePerMillion,
        outputPricePerMillion: manualTierRule.outputPricePerMillion,
        cacheReadInputPricePerMillion: manualTierRule.cacheReadInputPricePerMillion,
        cacheWriteInputPricePerMillion: manualTierRule.cacheWriteInputPricePerMillion,
        matchedRuleType: "tiered",
        matchedRuleDisplayLabel: manualTierRule.displayLabel,
        appliedTierThreshold: manualTierRule.thresholdInputTokens,
        modelMaxInputTokens: syncedCatalogPrice?.maxInputTokens ?? null,
        modelMaxOutputTokens: syncedCatalogPrice?.maxOutputTokens ?? null,
      };
    }

    const syncedTierRule = await findMatchingTierRule(
      normalizedModel,
      billedInputTokens,
      "litellm"
    );
    if (syncedTierRule) {
      return {
        model: normalizedModel,
        source: syncedTierRule.source as BillingPriceSource,
        inputPricePerMillion: syncedTierRule.inputPricePerMillion,
        outputPricePerMillion: syncedTierRule.outputPricePerMillion,
        cacheReadInputPricePerMillion: syncedTierRule.cacheReadInputPricePerMillion,
        cacheWriteInputPricePerMillion: syncedTierRule.cacheWriteInputPricePerMillion,
        matchedRuleType: "tiered",
        matchedRuleDisplayLabel: syncedTierRule.displayLabel,
        appliedTierThreshold: syncedTierRule.thresholdInputTokens,
        modelMaxInputTokens: syncedCatalogPrice?.maxInputTokens ?? null,
        modelMaxOutputTokens: syncedCatalogPrice?.maxOutputTokens ?? null,
      };
    }
  }

  // Fall back to flat pricing
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
      matchedRuleType: "flat",
      matchedRuleDisplayLabel: null,
      appliedTierThreshold: null,
      modelMaxInputTokens: syncedCatalogPrice?.maxInputTokens ?? null,
      modelMaxOutputTokens: syncedCatalogPrice?.maxOutputTokens ?? null,
    };
  }

  if (!syncedCatalogPrice) {
    return null;
  }

  return {
    model: normalizedModel,
    source: "litellm",
    inputPricePerMillion: syncedCatalogPrice.inputPricePerMillion,
    outputPricePerMillion: syncedCatalogPrice.outputPricePerMillion,
    cacheReadInputPricePerMillion: syncedCatalogPrice.cacheReadInputPricePerMillion,
    cacheWriteInputPricePerMillion: syncedCatalogPrice.cacheWriteInputPricePerMillion,
    matchedRuleType: "flat",
    matchedRuleDisplayLabel: null,
    appliedTierThreshold: null,
    modelMaxInputTokens: syncedCatalogPrice.maxInputTokens,
    modelMaxOutputTokens: syncedCatalogPrice.maxOutputTokens,
  };
}

/**
 * Find the best matching tier rule for a model and billed input token count.
 * Returns the highest threshold tier where billedInputTokens \> threshold.
 */
async function findMatchingTierRule(
  model: string,
  billedInputTokens: number,
  source: "litellm" | "manual"
): Promise<BillingTierRuleRecord | null> {
  const rules = await db.query.billingTierRules.findMany({
    where: and(
      eq(billingTierRules.model, model),
      eq(billingTierRules.source, source),
      eq(billingTierRules.isActive, true)
    ),
    orderBy: [desc(billingTierRules.thresholdInputTokens)],
  });

  if (rules.length === 0) return null;

  // Find the highest threshold that is exceeded by billed input tokens.
  for (const rule of rules) {
    if (billedInputTokens > rule.thresholdInputTokens) {
      return toTierRuleRecord(rule);
    }
  }

  return null;
}

function toTierRuleRecord(row: typeof billingTierRules.$inferSelect): BillingTierRuleRecord {
  return {
    id: row.id,
    model: row.model,
    source: row.source as "litellm" | "manual",
    thresholdInputTokens: row.thresholdInputTokens,
    displayLabel: row.displayLabel,
    inputPricePerMillion: row.inputPricePerMillion,
    outputPricePerMillion: row.outputPricePerMillion,
    cacheReadInputPricePerMillion: row.cacheReadInputPricePerMillion,
    cacheWriteInputPricePerMillion: row.cacheWriteInputPricePerMillion,
    note: row.note,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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

/**
 * List manual billing price overrides together with official-price availability metadata.
 */
export async function listBillingManualPriceOverrides(): Promise<
  BillingManualPriceOverrideRecord[]
> {
  const rows = await db.query.billingManualPriceOverrides.findMany({
    orderBy: [desc(billingManualPriceOverrides.updatedAt)],
  });

  const models = rows.map((row) => row.model);
  const officialPriceRows =
    models.length > 0
      ? await db.query.billingModelPrices.findMany({
          where: and(
            inArray(billingModelPrices.model, models),
            eq(billingModelPrices.source, "litellm"),
            eq(billingModelPrices.isActive, true)
          ),
          columns: { model: true },
        })
      : [];
  const officialModelSet = new Set(officialPriceRows.map((item) => item.model));

  return rows.map((row) => ({
    id: row.id,
    model: row.model,
    inputPricePerMillion: row.inputPricePerMillion,
    outputPricePerMillion: row.outputPricePerMillion,
    cacheReadInputPricePerMillion: row.cacheReadInputPricePerMillion,
    cacheWriteInputPricePerMillion: row.cacheWriteInputPricePerMillion,
    note: row.note,
    hasOfficialPrice: officialModelSet.has(row.model),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

/**
 * Delete manual billing price overrides by model and report models without official pricing.
 */
export async function deleteBillingManualPriceOverridesByModels(
  models: string[]
): Promise<{ deletedCount: number; missingOfficialModels: string[] }> {
  const normalized = [...new Set(models.map((m) => m.trim()).filter(Boolean))];
  if (normalized.length === 0) {
    return { deletedCount: 0, missingOfficialModels: [] };
  }

  const officialRows = await db.query.billingModelPrices.findMany({
    where: and(
      inArray(billingModelPrices.model, normalized),
      eq(billingModelPrices.source, "litellm"),
      eq(billingModelPrices.isActive, true)
    ),
    columns: { model: true },
  });
  const officialModelSet = new Set(officialRows.map((row) => row.model));
  const missingOfficialModels = normalized.filter((model) => !officialModelSet.has(model));

  const deletedRows = await db
    .delete(billingManualPriceOverrides)
    .where(inArray(billingManualPriceOverrides.model, normalized))
    .returning({ model: billingManualPriceOverrides.model });

  return {
    deletedCount: deletedRows.length,
    missingOfficialModels,
  };
}

/**
 * Create a manual billing price override for a single model.
 */
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

/**
 * Update a manual billing price override by identifier.
 */
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

/**
 * Delete a manual billing price override by identifier.
 */
export async function deleteBillingManualPriceOverride(id: string): Promise<boolean> {
  const rows = await db
    .delete(billingManualPriceOverrides)
    .where(eq(billingManualPriceOverrides.id, id))
    .returning({ id: billingManualPriceOverrides.id });
  return rows.length > 0;
}

/**
 * List models that still cannot be priced from either synced prices or manual overrides.
 */
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

/**
 * List synced billing model prices with optional filters and pagination.
 */
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
  const models = [...new Set(rows.map((row) => row.model))];
  const tierRuleConditions = [
    inArray(billingTierRules.model, models),
    eq(billingTierRules.source, "litellm"),
  ];
  if (input.activeOnly === true) {
    tierRuleConditions.push(eq(billingTierRules.isActive, true));
  }
  const syncedTierRuleRows =
    models.length > 0
      ? ((await db.query.billingTierRules.findMany({
          where: and(...tierRuleConditions),
          orderBy: [
            asc(billingTierRules.model),
            desc(billingTierRules.thresholdInputTokens),
            asc(billingTierRules.id),
          ],
        })) ?? [])
      : [];

  const syncedTierRulesByModel = new Map<string, BillingTierRuleRecord[]>();
  for (const row of syncedTierRuleRows) {
    const existing = syncedTierRulesByModel.get(row.model) ?? [];
    existing.push(toTierRuleRecord(row));
    syncedTierRulesByModel.set(row.model, existing);
  }

  return {
    items: rows.map((row) => ({
      id: row.id,
      model: row.model,
      inputPricePerMillion: row.inputPricePerMillion,
      outputPricePerMillion: row.outputPricePerMillion,
      cacheReadInputPricePerMillion: row.cacheReadInputPricePerMillion,
      cacheWriteInputPricePerMillion: row.cacheWriteInputPricePerMillion,
      maxInputTokens: row.maxInputTokens,
      maxOutputTokens: row.maxOutputTokens,
      syncedTierRules: syncedTierRulesByModel.get(row.model) ?? [],
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

// ========== Billing Tier Rule CRUD ==========

/**
 * List all billing tier rules, optionally filtered by model or source.
 */
export async function listBillingTierRules(options?: {
  model?: string;
  source?: "litellm" | "manual";
  activeOnly?: boolean;
}): Promise<BillingTierRuleRecord[]> {
  const conditions = [];
  if (options?.model) {
    conditions.push(eq(billingTierRules.model, options.model));
  }
  if (options?.source) {
    conditions.push(eq(billingTierRules.source, options.source));
  }
  if (options?.activeOnly) {
    conditions.push(eq(billingTierRules.isActive, true));
  }

  const rows = await db.query.billingTierRules.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: [
      asc(billingTierRules.model),
      asc(billingTierRules.source),
      desc(billingTierRules.thresholdInputTokens),
      asc(billingTierRules.id),
    ],
  });

  return rows.map(toTierRuleRecord);
}

/**
 * Create a manual billing tier rule for a model.
 * Upserts on (model, source=manual, thresholdInputTokens).
 */
export async function createBillingTierRule(input: TierRuleInput): Promise<BillingTierRuleRecord> {
  const normalizedModel = input.model.trim();
  if (!normalizedModel) {
    throw new BillingTierRuleValidationError();
  }

  const existing = await db.query.billingTierRules.findFirst({
    where: and(
      eq(billingTierRules.model, normalizedModel),
      eq(billingTierRules.source, "manual"),
      eq(billingTierRules.thresholdInputTokens, input.thresholdInputTokens)
    ),
  });

  if (existing) {
    throw new BillingTierRuleConflictError();
  }

  const now = new Date();
  const [row] = await db
    .insert(billingTierRules)
    .values({
      model: normalizedModel,
      source: "manual",
      thresholdInputTokens: input.thresholdInputTokens,
      displayLabel: input.displayLabel ?? null,
      inputPricePerMillion: input.inputPricePerMillion,
      outputPricePerMillion: input.outputPricePerMillion,
      cacheReadInputPricePerMillion: input.cacheReadInputPricePerMillion ?? null,
      cacheWriteInputPricePerMillion: input.cacheWriteInputPricePerMillion ?? null,
      note: input.note ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return toTierRuleRecord(row);
}

/**
 * Update a billing tier rule by identifier.
 */
export async function updateBillingTierRule(
  id: string,
  input: UpdateTierRuleInput
): Promise<BillingTierRuleRecord | null> {
  const existing = await db.query.billingTierRules.findFirst({
    where: and(eq(billingTierRules.id, id), eq(billingTierRules.source, "manual")),
  });

  if (!existing) {
    return null;
  }

  if (
    input.thresholdInputTokens !== undefined &&
    input.thresholdInputTokens !== existing.thresholdInputTokens
  ) {
    const conflictingRule = await db.query.billingTierRules.findFirst({
      where: and(
        eq(billingTierRules.model, existing.model),
        eq(billingTierRules.source, "manual"),
        eq(billingTierRules.thresholdInputTokens, input.thresholdInputTokens)
      ),
    });

    if (conflictingRule && conflictingRule.id !== id) {
      throw new BillingTierRuleConflictError();
    }
  }

  const updateValues: Partial<typeof billingTierRules.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.thresholdInputTokens !== undefined) {
    updateValues.thresholdInputTokens = input.thresholdInputTokens;
  }
  if (input.displayLabel !== undefined) {
    updateValues.displayLabel = input.displayLabel;
  }
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
  if (input.isActive !== undefined) {
    updateValues.isActive = input.isActive;
  }

  let row: typeof billingTierRules.$inferSelect | undefined;

  try {
    [row] = await db
      .update(billingTierRules)
      .set(updateValues)
      .where(eq(billingTierRules.id, id))
      .returning();
  } catch (error) {
    if (isBillingTierRuleUniqueConstraintError(error)) {
      throw new BillingTierRuleConflictError();
    }
    throw error;
  }

  if (!row) return null;
  return toTierRuleRecord(row);
}

function isBillingTierRuleUniqueConstraintError(error: unknown): boolean {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : null;
  const message = error instanceof Error ? error.message : String(error);

  return (
    code === "23505" ||
    message.includes(BILLING_TIER_RULES_UNIQUE_CONSTRAINT) ||
    message.includes("UNIQUE constraint failed")
  );
}

/**
 * Delete a billing tier rule by identifier.
 * Only manual rules can be deleted; litellm rules are managed by sync.
 */
export async function deleteBillingTierRule(id: string): Promise<boolean> {
  const rows = await db
    .delete(billingTierRules)
    .where(and(eq(billingTierRules.id, id), eq(billingTierRules.source, "manual")))
    .returning({ id: billingTierRules.id });
  return rows.length > 0;
}
