import { and, eq, gte, isNotNull, lte, sum } from "drizzle-orm";
import { db, requestBillingSnapshots, upstreams, type Upstream } from "@/lib/db";

export type SpendingPeriodType = "daily" | "monthly" | "rolling";

export interface QuotaConfig {
  spendingLimit: number;
  spendingPeriodType: SpendingPeriodType;
  spendingPeriodHours: number | null;
}

export interface QuotaStatus {
  upstreamId: string;
  upstreamName: string;
  currentSpending: number;
  spendingLimit: number;
  spendingPeriodType: SpendingPeriodType;
  spendingPeriodHours: number | null;
  percentUsed: number;
  isExceeded: boolean;
  resetsAt: Date | null;
  estimatedRecoveryAt: Date | null;
}

interface CacheEntry {
  currentSpending: number;
  lastSyncedAt: Date;
}

const VALID_PERIOD_TYPES: SpendingPeriodType[] = ["daily", "monthly", "rolling"];
const NORMAL_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const URGENT_SYNC_INTERVAL_MS = 1 * 60 * 1000; // 1 minute
const URGENT_THRESHOLD_PERCENT = 80;

function toStartOfTodayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function toStartOfMonthUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function toStartOfTomorrowUtc(now: Date = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function toStartOfNextMonthUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function getRollingWindowStart(hours: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

function getPeriodStart(config: QuotaConfig, now: Date = new Date()): Date {
  switch (config.spendingPeriodType) {
    case "daily":
      return toStartOfTodayUtc(now);
    case "monthly":
      return toStartOfMonthUtc(now);
    case "rolling":
      return getRollingWindowStart(config.spendingPeriodHours ?? 24, now);
  }
}

function getResetsAt(config: QuotaConfig, now: Date = new Date()): Date | null {
  switch (config.spendingPeriodType) {
    case "daily":
      return toStartOfTomorrowUtc(now);
    case "monthly":
      return toStartOfNextMonthUtc(now);
    case "rolling":
      return null; // Rolling windows don't have a fixed reset time
  }
}

function extractQuotaConfig(upstream: Upstream): QuotaConfig | null {
  if (
    upstream.spendingLimit == null ||
    upstream.spendingPeriodType == null ||
    !VALID_PERIOD_TYPES.includes(upstream.spendingPeriodType as SpendingPeriodType)
  ) {
    return null;
  }
  return {
    spendingLimit: upstream.spendingLimit,
    spendingPeriodType: upstream.spendingPeriodType as SpendingPeriodType,
    spendingPeriodHours: upstream.spendingPeriodHours,
  };
}

class UpstreamQuotaTracker {
  private cache = new Map<string, CacheEntry>();
  private configCache = new Map<string, QuotaConfig>();
  private nameCache = new Map<string, string>();
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Trigger lazy initialization. Non-blocking: kicks off init in background on first call.
   * Returns true if already initialized.
   */
  ensureInitialized(): boolean {
    if (this.initialized) return true;
    if (!this.initPromise) {
      this.initPromise = this.initialize().catch(() => {
        this.initPromise = null; // Allow retry on next call
      });
    }
    return false;
  }

  isWithinQuota(upstreamId: string): boolean {
    this.ensureInitialized();
    const config = this.configCache.get(upstreamId);
    if (!config) return true; // No quota configured → always allow
    const entry = this.cache.get(upstreamId);
    if (!entry) return true; // No spending data yet → allow
    return entry.currentSpending < config.spendingLimit;
  }

  recordSpending(upstreamId: string, cost: number): void {
    if (cost <= 0) return;
    const entry = this.cache.get(upstreamId);
    if (entry) {
      entry.currentSpending += cost;
    } else {
      this.cache.set(upstreamId, {
        currentSpending: cost,
        lastSyncedAt: new Date(),
      });
    }
  }

  getQuotaStatus(upstreamId: string): QuotaStatus | null {
    const config = this.configCache.get(upstreamId);
    if (!config) return null;

    const entry = this.cache.get(upstreamId);
    const currentSpending = entry?.currentSpending ?? 0;
    const percentUsed =
      config.spendingLimit > 0 ? Math.min(999, (currentSpending / config.spendingLimit) * 100) : 0;
    const now = new Date();

    return {
      upstreamId,
      upstreamName: this.nameCache.get(upstreamId) ?? upstreamId,
      currentSpending,
      spendingLimit: config.spendingLimit,
      spendingPeriodType: config.spendingPeriodType,
      spendingPeriodHours: config.spendingPeriodHours,
      percentUsed: Number(percentUsed.toFixed(1)),
      isExceeded: currentSpending >= config.spendingLimit,
      resetsAt: getResetsAt(config, now),
      estimatedRecoveryAt: null, // Populated by getQuotaStatusAll via DB query
    };
  }

  getAllQuotaStatuses(): QuotaStatus[] {
    const statuses: QuotaStatus[] = [];
    for (const [id] of this.configCache) {
      const status = this.getQuotaStatus(id);
      if (status) statuses.push(status);
    }
    return statuses;
  }

  async syncFromDb(): Promise<void> {
    const quotaUpstreams = await db.query.upstreams.findMany({
      where: isNotNull(upstreams.spendingLimit),
      columns: {
        id: true,
        name: true,
        spendingLimit: true,
        spendingPeriodType: true,
        spendingPeriodHours: true,
      },
    });

    // Update config cache
    const activeIds = new Set<string>();
    for (const u of quotaUpstreams) {
      const config = extractQuotaConfig(u as Upstream);
      if (config) {
        this.configCache.set(u.id, config);
        this.nameCache.set(u.id, u.name);
        activeIds.add(u.id);
      }
    }

    // Remove stale entries (upstream deleted or quota removed)
    for (const id of this.configCache.keys()) {
      if (!activeIds.has(id)) {
        this.configCache.delete(id);
        this.cache.delete(id);
        this.nameCache.delete(id);
      }
    }

    // Aggregate spending from DB for each quota upstream
    const now = new Date();
    for (const u of quotaUpstreams) {
      const config = this.configCache.get(u.id);
      if (!config) continue;

      const periodStart = getPeriodStart(config, now);

      const [row] = await db
        .select({
          totalCost: sum(requestBillingSnapshots.finalCost),
        })
        .from(requestBillingSnapshots)
        .where(
          and(
            eq(requestBillingSnapshots.upstreamId, u.id),
            eq(requestBillingSnapshots.billingStatus, "billed"),
            gte(requestBillingSnapshots.billedAt, periodStart)
          )
        );

      const totalCost = row?.totalCost ? Number(row.totalCost) : 0;
      this.cache.set(u.id, {
        currentSpending: Number.isNaN(totalCost) ? 0 : totalCost,
        lastSyncedAt: now,
      });
    }
  }

  async estimateRecoveryTime(upstreamId: string): Promise<Date | null> {
    const config = this.configCache.get(upstreamId);
    if (!config || config.spendingPeriodType !== "rolling") return null;

    const entry = this.cache.get(upstreamId);
    if (!entry || entry.currentSpending < config.spendingLimit) return null;

    const hours = config.spendingPeriodHours ?? 24;
    const now = new Date();
    const windowStart = getRollingWindowStart(hours, now);
    const excessAmount = entry.currentSpending - config.spendingLimit;

    // Scan from window start in 1-hour increments to find when enough cost slides out
    const scanHours = Math.min(hours, 24); // Scan up to 24 hours of edge
    let cumulativeSlideOut = 0;

    for (let h = 0; h < scanHours; h++) {
      const sliceStart = new Date(windowStart.getTime() + h * 60 * 60 * 1000);
      const sliceEnd = new Date(sliceStart.getTime() + 60 * 60 * 1000);

      const [row] = await db
        .select({
          totalCost: sum(requestBillingSnapshots.finalCost),
        })
        .from(requestBillingSnapshots)
        .where(
          and(
            eq(requestBillingSnapshots.upstreamId, upstreamId),
            eq(requestBillingSnapshots.billingStatus, "billed"),
            gte(requestBillingSnapshots.billedAt, sliceStart),
            lte(requestBillingSnapshots.billedAt, sliceEnd)
          )
        );

      const sliceCost = row?.totalCost ? Number(row.totalCost) : 0;
      cumulativeSlideOut += sliceCost;

      if (cumulativeSlideOut >= excessAmount) {
        // This slice's end time + rolling hours = when it slides out
        return new Date(sliceEnd.getTime() + hours * 60 * 60 * 1000);
      }
    }

    return null; // Cannot estimate
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.syncFromDb();
    this.startSyncTimer();
    this.initialized = true;
  }

  startSyncTimer(): void {
    if (this.syncTimer) return;

    this.syncTimer = setInterval(() => {
      this.tickSync().catch(() => {
        // Swallow errors in background sync — next tick will retry
      });
    }, URGENT_SYNC_INTERVAL_MS);
  }

  stopSyncTimer(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  private async tickSync(): Promise<void> {
    // Determine if any upstream needs urgent sync
    const needsSync = this.shouldSyncNow();
    if (!needsSync) return;

    await this.syncFromDb();
  }

  private shouldSyncNow(): boolean {
    const now = Date.now();
    for (const [id, entry] of this.cache) {
      const config = this.configCache.get(id);
      if (!config) continue;

      const elapsed = now - entry.lastSyncedAt.getTime();
      const percentUsed = (entry.currentSpending / config.spendingLimit) * 100;

      if (
        percentUsed >= URGENT_THRESHOLD_PERCENT ||
        entry.currentSpending >= config.spendingLimit
      ) {
        if (elapsed >= URGENT_SYNC_INTERVAL_MS) return true;
      } else {
        if (elapsed >= NORMAL_SYNC_INTERVAL_MS) return true;
      }
    }
    return false;
  }

  // For testing: reset all state
  reset(): void {
    this.stopSyncTimer();
    this.cache.clear();
    this.configCache.clear();
    this.nameCache.clear();
    this.initialized = false;
    this.initPromise = null;
  }

  // For testing: directly set config
  setConfig(upstreamId: string, config: QuotaConfig, name?: string): void {
    this.configCache.set(upstreamId, config);
    if (name) this.nameCache.set(upstreamId, name);
  }

  // For testing: get cache entry
  getCacheEntry(upstreamId: string): CacheEntry | undefined {
    return this.cache.get(upstreamId);
  }
}

// Singleton instance
export const quotaTracker = new UpstreamQuotaTracker();

// Re-export helpers for testing
export {
  toStartOfTodayUtc,
  toStartOfMonthUtc,
  toStartOfTomorrowUtc,
  toStartOfNextMonthUtc,
  getRollingWindowStart,
  getPeriodStart,
  getResetsAt,
  extractQuotaConfig,
};
