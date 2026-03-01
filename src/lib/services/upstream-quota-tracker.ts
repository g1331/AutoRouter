import { and, eq, gte, isNotNull, lte, sum } from "drizzle-orm";
import { db, requestBillingSnapshots, upstreams, type Upstream } from "@/lib/db";

export type SpendingPeriodType = "daily" | "monthly" | "rolling";

export interface SpendingRule {
  period_type: SpendingPeriodType;
  limit: number;
  period_hours?: number;
}

export interface RuleStatus {
  periodType: SpendingPeriodType;
  periodHours: number | null;
  currentSpending: number;
  spendingLimit: number;
  percentUsed: number;
  isExceeded: boolean;
  resetsAt: Date | null;
  estimatedRecoveryAt: Date | null;
}

export interface QuotaStatus {
  upstreamId: string;
  upstreamName: string;
  rules: RuleStatus[];
  isExceeded: boolean;
}

interface RuleCacheEntry {
  periodType: SpendingPeriodType;
  periodHours: number | null;
  limit: number;
  currentSpending: number;
  lastSyncedAt: Date;
}

const VALID_PERIOD_TYPES: SpendingPeriodType[] = ["daily", "monthly", "rolling"];
const NORMAL_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const URGENT_SYNC_INTERVAL_MS = 1 * 60 * 1000;
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

function getPeriodStartForRule(rule: SpendingRule, now: Date = new Date()): Date {
  switch (rule.period_type) {
    case "daily":
      return toStartOfTodayUtc(now);
    case "monthly":
      return toStartOfMonthUtc(now);
    case "rolling":
      return getRollingWindowStart(rule.period_hours ?? 24, now);
  }
}

function getResetsAtForRule(rule: SpendingRule, now: Date = new Date()): Date | null {
  switch (rule.period_type) {
    case "daily":
      return toStartOfTomorrowUtc(now);
    case "monthly":
      return toStartOfNextMonthUtc(now);
    case "rolling":
      return null;
  }
}

function extractSpendingRules(upstream: Upstream): SpendingRule[] {
  const raw = upstream.spendingRules;
  if (!raw || !Array.isArray(raw) || raw.length === 0) return [];

  return raw.filter(
    (r): r is SpendingRule =>
      r != null &&
      typeof r.limit === "number" &&
      r.limit > 0 &&
      VALID_PERIOD_TYPES.includes(r.period_type as SpendingPeriodType)
  );
}

function ruleKey(rule: SpendingRule): string {
  return rule.period_type === "rolling" ? `rolling:${rule.period_hours ?? 24}` : rule.period_type;
}

class UpstreamQuotaTracker {
  private cache = new Map<string, RuleCacheEntry[]>();
  private rulesCache = new Map<string, SpendingRule[]>();
  private nameCache = new Map<string, string>();
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  ensureInitialized(): boolean {
    if (this.initialized) return true;
    if (!this.initPromise) {
      this.initPromise = this.initialize().catch(() => {
        this.initPromise = null;
      });
    }
    return false;
  }

  isWithinQuota(upstreamId: string): boolean {
    this.ensureInitialized();
    const rules = this.rulesCache.get(upstreamId);
    if (!rules || rules.length === 0) return true;

    const entries = this.cache.get(upstreamId);
    if (!entries || entries.length === 0) return true;

    for (const entry of entries) {
      if (entry.currentSpending >= entry.limit) return false;
    }
    return true;
  }

  recordSpending(upstreamId: string, cost: number): void {
    if (cost <= 0) return;
    const entries = this.cache.get(upstreamId);
    if (!entries) return;
    for (const entry of entries) {
      entry.currentSpending += cost;
    }
  }

  getQuotaStatus(upstreamId: string): QuotaStatus | null {
    const rules = this.rulesCache.get(upstreamId);
    if (!rules || rules.length === 0) return null;

    const entries = this.cache.get(upstreamId);
    const now = new Date();
    let anyExceeded = false;

    const ruleStatuses: RuleStatus[] = rules.map((rule) => {
      const entry = entries?.find(
        (e) => e.periodType === rule.period_type && e.periodHours === (rule.period_hours ?? null)
      );
      const spending = entry?.currentSpending ?? 0;
      const percentUsed = rule.limit > 0 ? Math.min(999, (spending / rule.limit) * 100) : 0;
      const isExceeded = spending >= rule.limit;
      if (isExceeded) anyExceeded = true;

      return {
        periodType: rule.period_type,
        periodHours: rule.period_hours ?? null,
        currentSpending: spending,
        spendingLimit: rule.limit,
        percentUsed: Number(percentUsed.toFixed(1)),
        isExceeded,
        resetsAt: getResetsAtForRule(rule, now),
        estimatedRecoveryAt: null,
      };
    });

    return {
      upstreamId,
      upstreamName: this.nameCache.get(upstreamId) ?? upstreamId,
      rules: ruleStatuses,
      isExceeded: anyExceeded,
    };
  }

  getAllQuotaStatuses(): QuotaStatus[] {
    const statuses: QuotaStatus[] = [];
    for (const [id] of this.rulesCache) {
      const status = this.getQuotaStatus(id);
      if (status) statuses.push(status);
    }
    return statuses;
  }

  async syncFromDb(): Promise<void> {
    const quotaUpstreams = await db.query.upstreams.findMany({
      where: isNotNull(upstreams.spendingRules),
      columns: {
        id: true,
        name: true,
        spendingRules: true,
      },
    });

    const activeIds = new Set<string>();
    for (const u of quotaUpstreams) {
      const rules = extractSpendingRules(u as Upstream);
      if (rules.length > 0) {
        this.rulesCache.set(u.id, rules);
        this.nameCache.set(u.id, u.name);
        activeIds.add(u.id);
      }
    }

    for (const id of this.rulesCache.keys()) {
      if (!activeIds.has(id)) {
        this.rulesCache.delete(id);
        this.cache.delete(id);
        this.nameCache.delete(id);
      }
    }

    const now = new Date();
    for (const u of quotaUpstreams) {
      const rules = this.rulesCache.get(u.id);
      if (!rules) continue;

      const entries: RuleCacheEntry[] = [];
      for (const rule of rules) {
        const periodStart = getPeriodStartForRule(rule, now);

        const [row] = await db
          .select({ totalCost: sum(requestBillingSnapshots.finalCost) })
          .from(requestBillingSnapshots)
          .where(
            and(
              eq(requestBillingSnapshots.upstreamId, u.id),
              eq(requestBillingSnapshots.billingStatus, "billed"),
              gte(requestBillingSnapshots.billedAt, periodStart)
            )
          );

        const totalCost = row?.totalCost ? Number(row.totalCost) : 0;
        entries.push({
          periodType: rule.period_type,
          periodHours: rule.period_hours ?? null,
          limit: rule.limit,
          currentSpending: Number.isNaN(totalCost) ? 0 : totalCost,
          lastSyncedAt: now,
        });
      }
      this.cache.set(u.id, entries);
    }
  }

  async syncUpstreamFromDb(
    upstreamId: string,
    upstreamName: string,
    spendingRules: SpendingRule[] | null
  ): Promise<void> {
    const rules = extractSpendingRules({ spendingRules } as unknown as Upstream);
    if (rules.length === 0) {
      this.rulesCache.delete(upstreamId);
      this.cache.delete(upstreamId);
      this.nameCache.delete(upstreamId);
      return;
    }

    this.rulesCache.set(upstreamId, rules);
    this.nameCache.set(upstreamId, upstreamName);

    const now = new Date();
    const entries: RuleCacheEntry[] = [];
    for (const rule of rules) {
      const periodStart = getPeriodStartForRule(rule, now);

      const [row] = await db
        .select({ totalCost: sum(requestBillingSnapshots.finalCost) })
        .from(requestBillingSnapshots)
        .where(
          and(
            eq(requestBillingSnapshots.upstreamId, upstreamId),
            eq(requestBillingSnapshots.billingStatus, "billed"),
            gte(requestBillingSnapshots.billedAt, periodStart)
          )
        );

      const totalCost = row?.totalCost ? Number(row.totalCost) : 0;
      entries.push({
        periodType: rule.period_type,
        periodHours: rule.period_hours ?? null,
        limit: rule.limit,
        currentSpending: Number.isNaN(totalCost) ? 0 : totalCost,
        lastSyncedAt: now,
      });
    }

    this.cache.set(upstreamId, entries);
  }

  async estimateRecoveryTime(upstreamId: string, rule: SpendingRule): Promise<Date | null> {
    if (rule.period_type !== "rolling") return null;

    const entries = this.cache.get(upstreamId);
    const entry = entries?.find(
      (e) => e.periodType === "rolling" && e.periodHours === (rule.period_hours ?? null)
    );
    if (!entry || entry.currentSpending < rule.limit) return null;

    const hours = rule.period_hours ?? 24;
    const now = new Date();
    const windowStart = getRollingWindowStart(hours, now);
    const excessAmount = entry.currentSpending - rule.limit;

    const scanHours = Math.min(hours, 24);
    let cumulativeSlideOut = 0;

    for (let h = 0; h < scanHours; h++) {
      const sliceStart = new Date(windowStart.getTime() + h * 60 * 60 * 1000);
      const sliceEnd = new Date(sliceStart.getTime() + 60 * 60 * 1000);

      const [row] = await db
        .select({ totalCost: sum(requestBillingSnapshots.finalCost) })
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
        return new Date(sliceEnd.getTime() + hours * 60 * 60 * 1000);
      }
    }

    return null;
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
      this.tickSync().catch(() => {});
    }, URGENT_SYNC_INTERVAL_MS);
  }

  stopSyncTimer(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  private async tickSync(): Promise<void> {
    if (this.shouldSyncNow()) await this.syncFromDb();
  }

  private shouldSyncNow(): boolean {
    const now = Date.now();
    for (const [id, entries] of this.cache) {
      if (!this.rulesCache.has(id)) continue;
      for (const entry of entries) {
        const elapsed = now - entry.lastSyncedAt.getTime();
        const percentUsed = (entry.currentSpending / entry.limit) * 100;

        if (percentUsed >= URGENT_THRESHOLD_PERCENT || entry.currentSpending >= entry.limit) {
          if (elapsed >= URGENT_SYNC_INTERVAL_MS) return true;
        } else {
          if (elapsed >= NORMAL_SYNC_INTERVAL_MS) return true;
        }
      }
    }
    return false;
  }

  reset(): void {
    this.stopSyncTimer();
    this.cache.clear();
    this.rulesCache.clear();
    this.nameCache.clear();
    this.initialized = false;
    this.initPromise = null;
  }

  setRules(upstreamId: string, rules: SpendingRule[], name?: string): void {
    this.rulesCache.set(upstreamId, rules);
    if (name) this.nameCache.set(upstreamId, name);
    const entries: RuleCacheEntry[] = rules.map((r) => ({
      periodType: r.period_type,
      periodHours: r.period_hours ?? null,
      limit: r.limit,
      currentSpending: 0,
      lastSyncedAt: new Date(),
    }));
    this.cache.set(upstreamId, entries);
  }

  getCacheEntries(upstreamId: string): RuleCacheEntry[] | undefined {
    return this.cache.get(upstreamId);
  }
}

export const quotaTracker = new UpstreamQuotaTracker();

export {
  toStartOfTodayUtc,
  toStartOfMonthUtc,
  toStartOfTomorrowUtc,
  toStartOfNextMonthUtc,
  getRollingWindowStart,
  getPeriodStartForRule,
  getResetsAtForRule,
  extractSpendingRules,
  ruleKey,
};
