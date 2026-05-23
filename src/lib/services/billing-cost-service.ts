import { eq } from "drizzle-orm";
import { db, requestBillingSnapshots, requestLogs, upstreams } from "@/lib/db";
import {
  resolveBillingModelPrice,
  type BillingPriceSource,
  type BillingResolvedPrice,
} from "@/lib/services/billing-price-service";
import { getProviderTypeForModel } from "@/lib/services/model-router";
import { quotaTracker } from "@/lib/services/upstream-quota-tracker";
import { apiKeyQuotaTracker } from "@/lib/services/api-key-quota-tracker";
import { createLogger } from "@/lib/utils/logger";

const log = createLogger("billing-cost-service");

type BillingSnapshotInsertValues = typeof requestBillingSnapshots.$inferInsert;
type BillingSnapshotUpdateSet = Partial<BillingSnapshotInsertValues>;

interface PgForeignKeyViolation {
  code: "23503";
  constraint_name?: string;
}

/**
 * 提取 Postgres FK 违例信息。drizzle-orm 0.45 会把驱动抛出的 PostgresError 包成
 * DrizzleQueryError 并将原错误塞到 `.cause` 上，因此外层对象本身没有 `code` 字段。
 * 这里同时检查顶层与 `.cause` 一层，覆盖两种形状；非 FK 违例返回 null。
 */
function extractPgForeignKeyViolation(error: unknown): PgForeignKeyViolation | null {
  if (typeof error !== "object" || error === null) return null;

  const direct = error as { code?: unknown; constraint_name?: unknown };
  if (direct.code === "23503") {
    return {
      code: "23503",
      constraint_name:
        typeof direct.constraint_name === "string" ? direct.constraint_name : undefined,
    };
  }

  const cause = (error as { cause?: unknown }).cause;
  if (typeof cause === "object" && cause !== null) {
    const inner = cause as { code?: unknown; constraint_name?: unknown };
    if (inner.code === "23503") {
      return {
        code: "23503",
        constraint_name:
          typeof inner.constraint_name === "string" ? inner.constraint_name : undefined,
      };
    }
  }

  return null;
}

function resolveViolatedFkColumn(
  constraintName: string | undefined
): "apiKeyId" | "upstreamId" | null {
  if (!constraintName) return null;
  if (constraintName.includes("api_key_id")) return "apiKeyId";
  if (constraintName.includes("upstream_id")) return "upstreamId";
  return null;
}

/**
 * 写 snapshot 时若 api_key_id / upstream_id 违反 FK 约束（典型场景：caller 持有的
 * id 在请求处理与异步 snapshot 写入之间被并发删除——reconcile 也无法消除这一
 * TOCTOU 窗口），把违反的那一列置 NULL 后单次重试。
 *
 * 返回实际写入数据库的两列值，供 applyQuotaDeltaAfterSnapshotUpsert 使用，
 * 防止"INSERT 已置 NULL 但内存配额仍按原 id 累加"导致 DB/memory 状态错位。
 */
async function upsertBillingSnapshotWithFkRetry(
  values: BillingSnapshotInsertValues,
  updateSet: BillingSnapshotUpdateSet,
  requestLogId: string
): Promise<{ apiKeyId: string | null; upstreamId: string | null }> {
  try {
    await db
      .insert(requestBillingSnapshots)
      .values(values)
      .onConflictDoUpdate({ target: requestBillingSnapshots.requestLogId, set: updateSet });
    return { apiKeyId: values.apiKeyId ?? null, upstreamId: values.upstreamId ?? null };
  } catch (error) {
    const violation = extractPgForeignKeyViolation(error);
    if (!violation) throw error;
    const column = resolveViolatedFkColumn(violation.constraint_name);
    if (!column) throw error;

    const patchedValues: BillingSnapshotInsertValues = { ...values, [column]: null };
    const patchedSet: BillingSnapshotUpdateSet = { ...updateSet, [column]: null };

    await db.insert(requestBillingSnapshots).values(patchedValues).onConflictDoUpdate({
      target: requestBillingSnapshots.requestLogId,
      set: patchedSet,
    });

    log.warn(
      { requestLogId, nulledColumn: column, constraint: violation.constraint_name },
      "billing snapshot FK violation retried with NULL"
    );

    return {
      apiKeyId: patchedValues.apiKeyId ?? null,
      upstreamId: patchedValues.upstreamId ?? null,
    };
  }
}

export type UnbillableReason =
  | "model_missing"
  | "usage_missing"
  | "price_not_found"
  | "calculation_error";

export interface BillingUsageInput {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface PersistRequestBillingInput {
  requestLogId: string;
  apiKeyId: string | null;
  upstreamId: string | null;
  model: string | null;
  usage: BillingUsageInput;
  billedAt?: Date;
}

export interface PersistedRequestBillingResult {
  status: "billed" | "unbilled";
  unbillableReason: UnbillableReason | null;
  finalCost: number | null;
  source: BillingPriceSource | null;
}

interface NormalizedBillingUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

interface ExistingBillingSnapshot {
  apiKeyId: string | null;
  upstreamId: string | null;
  billingStatus: string;
  finalCost: number | null;
}

function parseSnapshotCost(value: number | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function applyQuotaDeltaAfterSnapshotUpsert(
  previousSnapshot: ExistingBillingSnapshot | null,
  nextBillingStatus: "billed" | "unbilled",
  nextApiKeyId: string | null,
  nextUpstreamId: string | null,
  nextFinalCost: number | null
): void {
  const deltaByUpstream = new Map<string, number>();
  const deltaByApiKey = new Map<string, number>();

  if (previousSnapshot?.billingStatus === "billed" && previousSnapshot.upstreamId) {
    const previousCost = parseSnapshotCost(previousSnapshot.finalCost);
    if (previousCost > 0) {
      deltaByUpstream.set(
        previousSnapshot.upstreamId,
        (deltaByUpstream.get(previousSnapshot.upstreamId) ?? 0) - previousCost
      );
    }
  }
  if (previousSnapshot?.billingStatus === "billed" && previousSnapshot.apiKeyId) {
    const previousCost = parseSnapshotCost(previousSnapshot.finalCost);
    if (previousCost > 0) {
      deltaByApiKey.set(
        previousSnapshot.apiKeyId,
        (deltaByApiKey.get(previousSnapshot.apiKeyId) ?? 0) - previousCost
      );
    }
  }

  const normalizedFinalCost = parseSnapshotCost(nextFinalCost);
  if (nextBillingStatus === "billed" && nextUpstreamId && normalizedFinalCost > 0) {
    deltaByUpstream.set(
      nextUpstreamId,
      (deltaByUpstream.get(nextUpstreamId) ?? 0) + normalizedFinalCost
    );
  }
  if (nextBillingStatus === "billed" && nextApiKeyId && normalizedFinalCost > 0) {
    deltaByApiKey.set(nextApiKeyId, (deltaByApiKey.get(nextApiKeyId) ?? 0) + normalizedFinalCost);
  }

  for (const [upstreamId, delta] of deltaByUpstream) {
    const normalizedDelta = Number(delta.toFixed(10));
    if (normalizedDelta !== 0) {
      quotaTracker.adjustSpending(upstreamId, normalizedDelta);
    }
  }
  for (const [apiKeyId, delta] of deltaByApiKey) {
    const normalizedDelta = Number(delta.toFixed(10));
    if (normalizedDelta !== 0) {
      apiKeyQuotaTracker.adjustSpending(apiKeyId, normalizedDelta);
    }
  }
}

function normalizeUsage(usage: BillingUsageInput): NormalizedBillingUsage {
  const promptTokens = Math.max(0, Math.floor(usage.promptTokens || 0));
  const completionTokens = Math.max(0, Math.floor(usage.completionTokens || 0));
  const totalTokens =
    usage.totalTokens && usage.totalTokens > 0
      ? Math.floor(usage.totalTokens)
      : promptTokens + completionTokens;
  const cacheReadTokens = Math.max(0, Math.floor(usage.cacheReadTokens || 0));
  const cacheWriteTokens = Math.max(0, Math.floor(usage.cacheWriteTokens || 0));

  return { promptTokens, completionTokens, totalTokens, cacheReadTokens, cacheWriteTokens };
}

async function upsertUnbilledSnapshot(
  input: PersistRequestBillingInput,
  reason: UnbillableReason
): Promise<PersistedRequestBillingResult> {
  const usage = normalizeUsage(input.usage);
  const now = input.billedAt ?? new Date();
  const previousSnapshot = await db.query.requestBillingSnapshots.findFirst({
    where: eq(requestBillingSnapshots.requestLogId, input.requestLogId),
    columns: {
      apiKeyId: true,
      upstreamId: true,
      billingStatus: true,
      finalCost: true,
    },
  });

  const writtenIds = await upsertBillingSnapshotWithFkRetry(
    {
      requestLogId: input.requestLogId,
      apiKeyId: input.apiKeyId,
      upstreamId: input.upstreamId,
      model: input.model,
      billingStatus: "unbilled",
      unbillableReason: reason,
      priceSource: null,
      baseInputPricePerMillion: null,
      baseOutputPricePerMillion: null,
      baseCacheReadInputPricePerMillion: null,
      baseCacheWriteInputPricePerMillion: null,
      matchedRuleType: null,
      matchedRuleDisplayLabel: null,
      appliedTierThreshold: null,
      modelMaxInputTokens: null,
      modelMaxOutputTokens: null,
      inputMultiplier: null,
      outputMultiplier: null,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      cacheReadCost: null,
      cacheWriteCost: null,
      finalCost: null,
      currency: "USD",
      billedAt: now,
      createdAt: now,
    },
    {
      apiKeyId: input.apiKeyId,
      upstreamId: input.upstreamId,
      model: input.model,
      billingStatus: "unbilled",
      unbillableReason: reason,
      priceSource: null,
      baseInputPricePerMillion: null,
      baseOutputPricePerMillion: null,
      baseCacheReadInputPricePerMillion: null,
      baseCacheWriteInputPricePerMillion: null,
      matchedRuleType: null,
      matchedRuleDisplayLabel: null,
      appliedTierThreshold: null,
      modelMaxInputTokens: null,
      modelMaxOutputTokens: null,
      inputMultiplier: null,
      outputMultiplier: null,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      cacheReadCost: null,
      cacheWriteCost: null,
      finalCost: null,
      currency: "USD",
      billedAt: now,
    },
    input.requestLogId
  );

  applyQuotaDeltaAfterSnapshotUpsert(
    previousSnapshot ?? null,
    "unbilled",
    writtenIds.apiKeyId,
    writtenIds.upstreamId,
    null
  );

  return {
    status: "unbilled",
    unbillableReason: reason,
    finalCost: null,
    source: null,
  };
}

function resolveBilledInputTokens(
  usage: NormalizedBillingUsage,
  upstreamProviderType: string | null
): number {
  if (upstreamProviderType === "anthropic") {
    const totalCacheTokens = usage.cacheReadTokens + usage.cacheWriteTokens;
    if (totalCacheTokens > 0 && usage.promptTokens === totalCacheTokens) {
      return 0;
    }
    return usage.promptTokens;
  }

  return Math.max(usage.promptTokens - usage.cacheReadTokens - usage.cacheWriteTokens, 0);
}

function calculateCost(
  price: BillingResolvedPrice,
  usage: NormalizedBillingUsage,
  billedInputTokens: number,
  inputMultiplier: number,
  outputMultiplier: number
): {
  finalCost: number;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  billedInputTokens: number;
} {
  const cacheReadPricePerMillion =
    price.cacheReadInputPricePerMillion ?? price.inputPricePerMillion;
  const cacheWritePricePerMillion =
    price.cacheWriteInputPricePerMillion ?? price.inputPricePerMillion;
  const inputCost = (billedInputTokens / 1_000_000) * price.inputPricePerMillion * inputMultiplier;
  const outputCost =
    (usage.completionTokens / 1_000_000) * price.outputPricePerMillion * outputMultiplier;
  const cacheReadCost =
    (usage.cacheReadTokens / 1_000_000) * cacheReadPricePerMillion * inputMultiplier;
  const cacheWriteCost =
    (usage.cacheWriteTokens / 1_000_000) * cacheWritePricePerMillion * inputMultiplier;
  const finalCost = Number((inputCost + outputCost + cacheReadCost + cacheWriteCost).toFixed(10));

  return {
    finalCost,
    inputCost: Number(inputCost.toFixed(10)),
    outputCost: Number(outputCost.toFixed(10)),
    cacheReadCost: Number(cacheReadCost.toFixed(10)),
    cacheWriteCost: Number(cacheWriteCost.toFixed(10)),
    billedInputTokens,
  };
}

/**
 * 以 request_logs 行为准重写 api_key_id / upstream_id，避免引用已删除主表行导致 FK 违例。
 * request_logs 两列都带 `ON DELETE SET NULL`，行内值已是 FK 安全的最终态。
 */
async function reconcileFkColumnsWithRequestLog(
  input: PersistRequestBillingInput
): Promise<PersistRequestBillingInput> {
  const logRow = await db.query.requestLogs.findFirst({
    where: eq(requestLogs.id, input.requestLogId),
    columns: { apiKeyId: true, upstreamId: true },
  });
  if (!logRow) {
    return { ...input, apiKeyId: null, upstreamId: null };
  }
  return { ...input, apiKeyId: logRow.apiKeyId, upstreamId: logRow.upstreamId };
}

/**
 * Calculate and persist an immutable request billing snapshot.
 */
export async function calculateAndPersistRequestBillingSnapshot(
  rawInput: PersistRequestBillingInput
): Promise<PersistedRequestBillingResult> {
  const input = await reconcileFkColumnsWithRequestLog(rawInput);
  const model = input.model?.trim() ?? "";
  if (!model) {
    return upsertUnbilledSnapshot(input, "model_missing");
  }

  const usage = normalizeUsage(input.usage);
  if (usage.promptTokens <= 0 && usage.completionTokens <= 0 && usage.totalTokens <= 0) {
    return upsertUnbilledSnapshot(input, "usage_missing");
  }

  const providerType = getProviderTypeForModel(model);
  const billedInputTokens = resolveBilledInputTokens(usage, providerType);
  const resolvedPrice = await resolveBillingModelPrice(model, billedInputTokens);
  if (!resolvedPrice) {
    return upsertUnbilledSnapshot({ ...input, model }, "price_not_found");
  }

  const upstream = input.upstreamId
    ? await db.query.upstreams.findFirst({
        where: eq(upstreams.id, input.upstreamId),
        columns: {
          billingInputMultiplier: true,
          billingOutputMultiplier: true,
        },
      })
    : null;

  const inputMultiplier = upstream?.billingInputMultiplier ?? 1;
  const outputMultiplier = upstream?.billingOutputMultiplier ?? 1;
  const cost = calculateCost(
    resolvedPrice,
    usage,
    billedInputTokens,
    inputMultiplier,
    outputMultiplier
  );
  const now = input.billedAt ?? new Date();
  const previousSnapshot = await db.query.requestBillingSnapshots.findFirst({
    where: eq(requestBillingSnapshots.requestLogId, input.requestLogId),
    columns: {
      apiKeyId: true,
      upstreamId: true,
      billingStatus: true,
      finalCost: true,
    },
  });

  const writtenIds = await upsertBillingSnapshotWithFkRetry(
    {
      requestLogId: input.requestLogId,
      apiKeyId: input.apiKeyId,
      upstreamId: input.upstreamId,
      model,
      billingStatus: "billed",
      unbillableReason: null,
      priceSource: resolvedPrice.source,
      baseInputPricePerMillion: resolvedPrice.inputPricePerMillion,
      baseOutputPricePerMillion: resolvedPrice.outputPricePerMillion,
      baseCacheReadInputPricePerMillion: resolvedPrice.cacheReadInputPricePerMillion,
      baseCacheWriteInputPricePerMillion: resolvedPrice.cacheWriteInputPricePerMillion,
      matchedRuleType: resolvedPrice.matchedRuleType,
      matchedRuleDisplayLabel: resolvedPrice.matchedRuleDisplayLabel,
      appliedTierThreshold: resolvedPrice.appliedTierThreshold,
      modelMaxInputTokens: resolvedPrice.modelMaxInputTokens,
      modelMaxOutputTokens: resolvedPrice.modelMaxOutputTokens,
      inputMultiplier,
      outputMultiplier,
      promptTokens: cost.billedInputTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      cacheReadCost: cost.cacheReadCost,
      cacheWriteCost: cost.cacheWriteCost,
      finalCost: cost.finalCost,
      currency: "USD",
      billedAt: now,
      createdAt: now,
    },
    {
      apiKeyId: input.apiKeyId,
      upstreamId: input.upstreamId,
      model,
      billingStatus: "billed",
      unbillableReason: null,
      priceSource: resolvedPrice.source,
      baseInputPricePerMillion: resolvedPrice.inputPricePerMillion,
      baseOutputPricePerMillion: resolvedPrice.outputPricePerMillion,
      baseCacheReadInputPricePerMillion: resolvedPrice.cacheReadInputPricePerMillion,
      baseCacheWriteInputPricePerMillion: resolvedPrice.cacheWriteInputPricePerMillion,
      matchedRuleType: resolvedPrice.matchedRuleType,
      matchedRuleDisplayLabel: resolvedPrice.matchedRuleDisplayLabel,
      appliedTierThreshold: resolvedPrice.appliedTierThreshold,
      modelMaxInputTokens: resolvedPrice.modelMaxInputTokens,
      modelMaxOutputTokens: resolvedPrice.modelMaxOutputTokens,
      inputMultiplier,
      outputMultiplier,
      promptTokens: cost.billedInputTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      cacheReadCost: cost.cacheReadCost,
      cacheWriteCost: cost.cacheWriteCost,
      finalCost: cost.finalCost,
      currency: "USD",
      billedAt: now,
    },
    input.requestLogId
  );

  applyQuotaDeltaAfterSnapshotUpsert(
    previousSnapshot ?? null,
    "billed",
    writtenIds.apiKeyId,
    writtenIds.upstreamId,
    cost.finalCost
  );

  return {
    status: "billed",
    unbillableReason: null,
    finalCost: cost.finalCost,
    source: resolvedPrice.source,
  };
}
