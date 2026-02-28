import { eq } from "drizzle-orm";
import { db, requestBillingSnapshots, upstreams } from "@/lib/db";
import {
  resolveBillingModelPrice,
  type BillingPriceSource,
  type BillingResolvedPrice,
} from "@/lib/services/billing-price-service";
import { getProviderTypeForModel } from "@/lib/services/model-router";

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

  await db
    .insert(requestBillingSnapshots)
    .values({
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
    })
    .onConflictDoUpdate({
      target: requestBillingSnapshots.requestLogId,
      set: {
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
    });

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
  upstreamProviderType: string | null,
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
  const billedInputTokens = resolveBilledInputTokens(usage, upstreamProviderType);
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
 * Calculate and persist an immutable request billing snapshot.
 */
export async function calculateAndPersistRequestBillingSnapshot(
  input: PersistRequestBillingInput
): Promise<PersistedRequestBillingResult> {
  const model = input.model?.trim() ?? "";
  if (!model) {
    return upsertUnbilledSnapshot(input, "model_missing");
  }

  const usage = normalizeUsage(input.usage);
  if (usage.promptTokens <= 0 && usage.completionTokens <= 0 && usage.totalTokens <= 0) {
    return upsertUnbilledSnapshot(input, "usage_missing");
  }

  const resolvedPrice = await resolveBillingModelPrice(model);
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
  const providerType = getProviderTypeForModel(model);
  const cost = calculateCost(resolvedPrice, usage, providerType, inputMultiplier, outputMultiplier);
  const now = input.billedAt ?? new Date();

  await db
    .insert(requestBillingSnapshots)
    .values({
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
    })
    .onConflictDoUpdate({
      target: requestBillingSnapshots.requestLogId,
      set: {
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
    });

  return {
    status: "billed",
    unbillableReason: null,
    finalCost: cost.finalCost,
    source: resolvedPrice.source,
  };
}
