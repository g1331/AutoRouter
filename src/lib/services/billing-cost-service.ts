import { eq } from "drizzle-orm";
import { db, requestBillingSnapshots, upstreams } from "@/lib/db";
import {
  resolveBillingModelPrice,
  type BillingPriceSource,
  type BillingResolvedPrice,
} from "@/lib/services/billing-price-service";

export type UnbillableReason =
  | "model_missing"
  | "usage_missing"
  | "price_not_found"
  | "calculation_error";

export interface BillingUsageInput {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
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

function normalizeUsage(usage: BillingUsageInput): BillingUsageInput {
  const promptTokens = Math.max(0, Math.floor(usage.promptTokens || 0));
  const completionTokens = Math.max(0, Math.floor(usage.completionTokens || 0));
  const totalTokens =
    usage.totalTokens && usage.totalTokens > 0
      ? Math.floor(usage.totalTokens)
      : promptTokens + completionTokens;

  return { promptTokens, completionTokens, totalTokens };
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
      inputMultiplier: null,
      outputMultiplier: null,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
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
        inputMultiplier: null,
        outputMultiplier: null,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
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

function calculateCost(
  price: BillingResolvedPrice,
  usage: BillingUsageInput,
  inputMultiplier: number,
  outputMultiplier: number
): number {
  const inputCost = (usage.promptTokens / 1_000_000) * price.inputPricePerMillion * inputMultiplier;
  const outputCost =
    (usage.completionTokens / 1_000_000) * price.outputPricePerMillion * outputMultiplier;

  return Number((inputCost + outputCost).toFixed(10));
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
  const finalCost = calculateCost(resolvedPrice, usage, inputMultiplier, outputMultiplier);
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
      inputMultiplier,
      outputMultiplier,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      finalCost,
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
        inputMultiplier,
        outputMultiplier,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        finalCost,
        currency: "USD",
        billedAt: now,
      },
    });

  return {
    status: "billed",
    unbillableReason: null,
    finalCost,
    source: resolvedPrice.source,
  };
}
