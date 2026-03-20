import { and, eq, gte, isNotNull, lt, sum } from "drizzle-orm";
import { apiKeys, db, requestBillingSnapshots, type ApiKey } from "@/lib/db";
import {
  type RuleStatus,
  type SpendingRule,
  getPeriodStartForRule,
  getResetsAtForRule,
  getRollingWindowStart,
} from "@/lib/services/upstream-quota-tracker";
import { normalizeSpendingRules } from "@/lib/services/spending-rules";

interface ApiKeyQuotaStatus {
  apiKeyId: string;
  apiKeyName: string;
  rules: RuleStatus[];
  isExceeded: boolean;
}

interface RuleCacheEntry {
  periodType: SpendingRule["period_type"];
  periodHours: number | null;
  limit: number;
  currentSpending: number;
  lastSyncedAt: Date;
}

const NORMAL_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const URGENT_SYNC_INTERVAL_MS = 1 * 60 * 1000;
const URGENT_THRESHOLD_PERCENT = 80;
const HOUR_MS = 60 * 60 * 1000;

function extractSpendingRulesFromApiKey(apiKey: Pick<ApiKey, "spendingRules">): SpendingRule[] {
  return normalizeSpendingRules(apiKey.spendingRules) ?? [];
}

class ApiKeyQuotaTracker {
  private cache = new Map<string, RuleCacheEntry[]>();
  private rulesCache = new Map<string, SpendingRule[]>();
  private nameCache = new Map<string, string>();
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    if (!this.initPromise) {
      this.initPromise = (async () => {
        await this.syncFromDb();
        this.startSyncTimer();
        this.initialized = true;
      })().catch((error) => {
        this.initPromise = null;
        throw error;
      });
    }

    await this.initPromise;
  }

  isWithinQuota(apiKeyId: string): boolean {
    const rules = this.rulesCache.get(apiKeyId);
    if (!rules || rules.length === 0) {
      return true;
    }

    const entries = this.cache.get(apiKeyId);
    if (!entries || entries.length === 0) {
      return true;
    }

    return entries.every((entry) => entry.currentSpending < entry.limit);
  }

  adjustSpending(apiKeyId: string, delta: number): void {
    if (!Number.isFinite(delta) || delta === 0) {
      return;
    }

    const entries = this.cache.get(apiKeyId);
    if (!entries) {
      return;
    }

    for (const entry of entries) {
      const nextSpending = entry.currentSpending + delta;
      entry.currentSpending = nextSpending > 0 ? Number(nextSpending.toFixed(10)) : 0;
    }
  }

  getQuotaStatus(apiKeyId: string): ApiKeyQuotaStatus | null {
    const rules = this.rulesCache.get(apiKeyId);
    if (!rules || rules.length === 0) {
      return null;
    }

    const entries = this.cache.get(apiKeyId);
    const now = new Date();
    let isExceeded = false;

    const statuses: RuleStatus[] = rules.map((rule) => {
      const entry = entries?.find(
        (candidate) =>
          candidate.periodType === rule.period_type &&
          candidate.periodHours === (rule.period_hours ?? null)
      );
      const currentSpending = entry?.currentSpending ?? 0;
      const percentUsed = rule.limit > 0 ? Math.min(999, (currentSpending / rule.limit) * 100) : 0;
      const ruleExceeded = currentSpending >= rule.limit;
      if (ruleExceeded) {
        isExceeded = true;
      }

      return {
        periodType: rule.period_type,
        periodHours: rule.period_hours ?? null,
        currentSpending,
        spendingLimit: rule.limit,
        percentUsed: Number(percentUsed.toFixed(1)),
        isExceeded: ruleExceeded,
        resetsAt: getResetsAtForRule(rule, now),
        estimatedRecoveryAt: null,
      };
    });

    return {
      apiKeyId,
      apiKeyName: this.nameCache.get(apiKeyId) ?? apiKeyId,
      rules: statuses,
      isExceeded,
    };
  }

  async syncFromDb(): Promise<void> {
    const quotaKeys = await db.query.apiKeys.findMany({
      where: isNotNull(apiKeys.spendingRules),
      columns: {
        id: true,
        name: true,
        spendingRules: true,
      },
    });

    const activeIds = new Set<string>();
    for (const key of quotaKeys) {
      const rules = extractSpendingRulesFromApiKey(key);
      if (rules.length === 0) {
        continue;
      }

      this.rulesCache.set(key.id, rules);
      this.nameCache.set(key.id, key.name);
      activeIds.add(key.id);
    }

    for (const id of this.rulesCache.keys()) {
      if (!activeIds.has(id)) {
        this.rulesCache.delete(id);
        this.cache.delete(id);
        this.nameCache.delete(id);
      }
    }

    const now = new Date();
    for (const key of quotaKeys) {
      const rules = this.rulesCache.get(key.id);
      if (!rules) {
        continue;
      }

      const entries: RuleCacheEntry[] = [];
      for (const rule of rules) {
        const periodStart = getPeriodStartForRule(rule, now);
        const [row] = await db
          .select({ totalCost: sum(requestBillingSnapshots.finalCost) })
          .from(requestBillingSnapshots)
          .where(
            and(
              eq(requestBillingSnapshots.apiKeyId, key.id),
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

      this.cache.set(key.id, entries);
    }
  }

  async syncApiKeyFromDb(
    apiKeyId: string,
    apiKeyName: string,
    spendingRules: SpendingRule[] | null
  ): Promise<void> {
    const rules = normalizeSpendingRules(spendingRules);
    if (!rules || rules.length === 0) {
      this.rulesCache.delete(apiKeyId);
      this.cache.delete(apiKeyId);
      this.nameCache.delete(apiKeyId);
      return;
    }

    this.rulesCache.set(apiKeyId, rules);
    this.nameCache.set(apiKeyId, apiKeyName);

    const now = new Date();
    const entries: RuleCacheEntry[] = [];
    for (const rule of rules) {
      const periodStart = getPeriodStartForRule(rule, now);
      const [row] = await db
        .select({ totalCost: sum(requestBillingSnapshots.finalCost) })
        .from(requestBillingSnapshots)
        .where(
          and(
            eq(requestBillingSnapshots.apiKeyId, apiKeyId),
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

    this.cache.set(apiKeyId, entries);
  }

  async estimateRecoveryTime(apiKeyId: string, rule: SpendingRule): Promise<Date | null> {
    if (rule.period_type !== "rolling") {
      return null;
    }

    const entries = this.cache.get(apiKeyId);
    const entry = entries?.find(
      (candidate) =>
        candidate.periodType === "rolling" && candidate.periodHours === (rule.period_hours ?? null)
    );
    if (!entry || entry.currentSpending < rule.limit) {
      return null;
    }

    const configuredHours = rule.period_hours ?? 24;
    const windowHours =
      Number.isFinite(configuredHours) && configuredHours > 0 ? Math.floor(configuredHours) : 24;
    const now = new Date();
    const windowStart = getRollingWindowStart(windowHours, now);
    const excessAmount = entry.currentSpending - rule.limit;
    const scanHours = Math.min(windowHours, 8760);
    if (scanHours <= 0) {
      return null;
    }

    const rows = await db
      .select({
        billedAt: requestBillingSnapshots.billedAt,
        finalCost: requestBillingSnapshots.finalCost,
      })
      .from(requestBillingSnapshots)
      .where(
        and(
          eq(requestBillingSnapshots.apiKeyId, apiKeyId),
          eq(requestBillingSnapshots.billingStatus, "billed"),
          gte(requestBillingSnapshots.billedAt, windowStart),
          lt(requestBillingSnapshots.billedAt, now)
        )
      );

    const windowStartMs = windowStart.getTime();
    const hourlySlideOutCosts = new Array<number>(scanHours).fill(0);
    for (const row of rows) {
      const billedAtValue = row?.billedAt;
      if (!billedAtValue) {
        continue;
      }

      const billedAtMs =
        billedAtValue instanceof Date ? billedAtValue.getTime() : new Date(billedAtValue).getTime();
      if (!Number.isFinite(billedAtMs) || billedAtMs < windowStartMs) {
        continue;
      }

      const cost = Number(row?.finalCost ?? 0);
      if (!Number.isFinite(cost) || cost <= 0) {
        continue;
      }

      const hourIndex = Math.floor((billedAtMs - windowStartMs) / HOUR_MS);
      if (hourIndex < 0 || hourIndex >= scanHours) {
        continue;
      }

      hourlySlideOutCosts[hourIndex] += cost;
    }

    let cumulativeSlideOut = 0;
    for (let hourIndex = 0; hourIndex < scanHours; hourIndex += 1) {
      cumulativeSlideOut += hourlySlideOutCosts[hourIndex] ?? 0;
      if (cumulativeSlideOut > excessAmount) {
        const sliceEnd = new Date(windowStartMs + (hourIndex + 1) * HOUR_MS);
        return new Date(sliceEnd.getTime() + windowHours * HOUR_MS);
      }
    }

    return null;
  }

  reset(): void {
    this.stopSyncTimer();
    this.cache.clear();
    this.rulesCache.clear();
    this.nameCache.clear();
    this.initialized = false;
    this.initPromise = null;
  }

  setRules(apiKeyId: string, rules: SpendingRule[], name?: string): void {
    const normalizedRules = normalizeSpendingRules(rules) ?? [];
    this.rulesCache.set(apiKeyId, normalizedRules);
    if (name) {
      this.nameCache.set(apiKeyId, name);
    }
    this.cache.set(
      apiKeyId,
      normalizedRules.map((rule) => ({
        periodType: rule.period_type,
        periodHours: rule.period_hours ?? null,
        limit: rule.limit,
        currentSpending: 0,
        lastSyncedAt: new Date(),
      }))
    );
  }

  getCacheEntries(apiKeyId: string): RuleCacheEntry[] | undefined {
    return this.cache.get(apiKeyId);
  }

  private startSyncTimer(): void {
    if (this.syncTimer) {
      return;
    }
    this.syncTimer = setInterval(() => {
      this.tickSync().catch(() => undefined);
    }, URGENT_SYNC_INTERVAL_MS);
  }

  private stopSyncTimer(): void {
    if (!this.syncTimer) {
      return;
    }
    clearInterval(this.syncTimer);
    this.syncTimer = null;
  }

  private async tickSync(): Promise<void> {
    if (this.shouldSyncNow()) {
      await this.syncFromDb();
    }
  }

  private shouldSyncNow(): boolean {
    const now = Date.now();
    for (const [apiKeyId, entries] of this.cache) {
      if (!this.rulesCache.has(apiKeyId)) {
        continue;
      }

      for (const entry of entries) {
        const elapsed = now - entry.lastSyncedAt.getTime();
        const percentUsed = (entry.currentSpending / entry.limit) * 100;

        if (percentUsed >= URGENT_THRESHOLD_PERCENT || entry.currentSpending >= entry.limit) {
          if (elapsed >= URGENT_SYNC_INTERVAL_MS) {
            return true;
          }
        } else if (elapsed >= NORMAL_SYNC_INTERVAL_MS) {
          return true;
        }
      }
    }

    return false;
  }
}

export const apiKeyQuotaTracker = new ApiKeyQuotaTracker();
