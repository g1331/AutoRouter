import { and, count, desc, eq, gte, sum } from "drizzle-orm";
import {
  db,
  requestBillingSnapshots,
  type Upstream,
  upstreams,
  type RequestBillingSnapshot,
} from "@/lib/db";
import {
  getLatestBillingSyncStatus,
  listBillingUnresolvedModels,
  type BillingSyncSummary,
} from "@/lib/services/billing-price-service";

export interface BillingOverviewStats {
  todayCostUsd: number;
  monthCostUsd: number;
  unresolvedModelCount: number;
  latestSync: BillingSyncSummary | null;
}

export interface UpstreamBillingMultiplierItem {
  id: string;
  name: string;
  isActive: boolean;
  inputMultiplier: number;
  outputMultiplier: number;
}

export interface RecentBillingDetailItem {
  requestLogId: string;
  createdAt: Date;
  model: string | null;
  upstreamId: string | null;
  upstreamName: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  priceSource: string | null;
  billingStatus: "billed" | "unbilled";
  unbillableReason: string | null;
  baseInputPricePerMillion: number | null;
  baseOutputPricePerMillion: number | null;
  baseCacheReadInputPricePerMillion: number | null;
  baseCacheWriteInputPricePerMillion: number | null;
  inputMultiplier: number | null;
  outputMultiplier: number | null;
  cacheReadCost: number | null;
  cacheWriteCost: number | null;
  finalCost: number | null;
  currency: string;
}

export interface PaginatedRecentBillingDetails {
  items: RecentBillingDetailItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function toStartOfTodayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function toStartOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function asUsdAmount(input: unknown): number {
  if (input === null || input === undefined) {
    return 0;
  }
  const value = Number(input);
  if (Number.isNaN(value)) {
    return 0;
  }
  return Number(value.toFixed(6));
}

/**
 * Aggregate high-level billing overview metrics.
 */
export async function getBillingOverviewStats(): Promise<BillingOverviewStats> {
  const now = new Date();
  const startOfToday = toStartOfTodayUtc(now);
  const startOfMonth = toStartOfMonthUtc(now);

  const [todayRow, monthRow, unresolvedModels, latestSync] = await Promise.all([
    db
      .select({
        totalCost: sum(requestBillingSnapshots.finalCost),
      })
      .from(requestBillingSnapshots)
      .where(
        and(
          eq(requestBillingSnapshots.billingStatus, "billed"),
          gte(requestBillingSnapshots.billedAt, startOfToday)
        )
      ),
    db
      .select({
        totalCost: sum(requestBillingSnapshots.finalCost),
      })
      .from(requestBillingSnapshots)
      .where(
        and(
          eq(requestBillingSnapshots.billingStatus, "billed"),
          gte(requestBillingSnapshots.billedAt, startOfMonth)
        )
      ),
    listBillingUnresolvedModels(),
    getLatestBillingSyncStatus(),
  ]);

  return {
    todayCostUsd: asUsdAmount(todayRow[0]?.totalCost),
    monthCostUsd: asUsdAmount(monthRow[0]?.totalCost),
    unresolvedModelCount: unresolvedModels.length,
    latestSync,
  };
}

export async function listUpstreamBillingMultipliers(): Promise<UpstreamBillingMultiplierItem[]> {
  const rows = await db.query.upstreams.findMany({
    columns: {
      id: true,
      name: true,
      isActive: true,
      billingInputMultiplier: true,
      billingOutputMultiplier: true,
    },
    orderBy: [desc(upstreams.createdAt)],
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    inputMultiplier: row.billingInputMultiplier,
    outputMultiplier: row.billingOutputMultiplier,
  }));
}

export async function updateUpstreamBillingMultipliers(
  upstreamId: string,
  input: {
    inputMultiplier?: number;
    outputMultiplier?: number;
  }
): Promise<Upstream | null> {
  const updateValues: Partial<typeof upstreams.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.inputMultiplier !== undefined) {
    updateValues.billingInputMultiplier = input.inputMultiplier;
  }
  if (input.outputMultiplier !== undefined) {
    updateValues.billingOutputMultiplier = input.outputMultiplier;
  }

  if (Object.keys(updateValues).length === 1) {
    const existing = await db.query.upstreams.findFirst({
      where: eq(upstreams.id, upstreamId),
    });
    return existing ?? null;
  }

  const [row] = await db
    .update(upstreams)
    .set(updateValues)
    .where(eq(upstreams.id, upstreamId))
    .returning();

  return row ?? null;
}

function toRecentBillingDetailItem(
  row: RequestBillingSnapshot & { upstream: { name: string } | null }
): RecentBillingDetailItem {
  return {
    requestLogId: row.requestLogId,
    createdAt: row.createdAt,
    model: row.model,
    upstreamId: row.upstreamId,
    upstreamName: row.upstream?.name ?? null,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    totalTokens: row.totalTokens,
    cacheReadTokens: row.cacheReadTokens,
    cacheWriteTokens: row.cacheWriteTokens,
    priceSource: row.priceSource,
    billingStatus: row.billingStatus as "billed" | "unbilled",
    unbillableReason: row.unbillableReason,
    baseInputPricePerMillion: row.baseInputPricePerMillion,
    baseOutputPricePerMillion: row.baseOutputPricePerMillion,
    baseCacheReadInputPricePerMillion: row.baseCacheReadInputPricePerMillion,
    baseCacheWriteInputPricePerMillion: row.baseCacheWriteInputPricePerMillion,
    inputMultiplier: row.inputMultiplier,
    outputMultiplier: row.outputMultiplier,
    cacheReadCost: row.cacheReadCost,
    cacheWriteCost: row.cacheWriteCost,
    finalCost: row.finalCost,
    currency: row.currency,
  };
}

export async function listRecentBillingDetails(
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedRecentBillingDetails> {
  page = Math.max(1, page);
  pageSize = Math.min(100, Math.max(1, pageSize));
  const offset = (page - 1) * pageSize;

  const [totalRows, rows] = await Promise.all([
    db.select({ value: count() }).from(requestBillingSnapshots),
    db.query.requestBillingSnapshots.findMany({
      orderBy: [desc(requestBillingSnapshots.createdAt)],
      limit: pageSize,
      offset,
      with: {
        upstream: {
          columns: {
            name: true,
          },
        },
      },
    }),
  ]);
  const total = totalRows[0]?.value ?? 0;

  const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;

  return {
    items: rows.map(toRecentBillingDetailItem),
    total,
    page,
    pageSize,
    totalPages,
  };
}
