"use client";

import { useTranslations } from "next-intl";
import {
  Activity,
  Clock,
  Zap,
  Timer,
  Database,
  DollarSign,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { formatDuration, formatNumber } from "./chart-theme";
import { DashboardLoadingBlock, DashboardLoadingSurface } from "./dashboard-loading";

interface StatsCardsProps {
  todayRequests: number;
  avgResponseTimeMs: number;
  totalTokensToday: number;
  totalCostToday: number;
  avgTtftMs: number;
  cacheHitRate: number;
  yesterdayRequests: number;
  yesterdayTotalTokens: number;
  yesterdayCostUsd: number;
  yesterdayAvgResponseTimeMs: number;
  yesterdayAvgTtftMs: number;
  yesterdayCacheHitRate: number;
  isLoading: boolean;
}

function formatTtft(ttftMs: number): string {
  if (ttftMs >= 1000) {
    return `${(ttftMs / 1000).toFixed(3)}s`;
  }
  return `${Math.round(ttftMs)}ms`;
}

function getTtftPerformanceClass(ttftMs: number): string {
  if (ttftMs >= 1000) return "text-status-error";
  if (ttftMs >= 500) return "text-status-warning";
  return "text-status-success";
}

function formatCacheRate(rate: number): string {
  const normalizedRate = Number.isFinite(rate) ? Math.min(Math.max(rate, 0), 100) : 0;
  return `${normalizedRate.toFixed(2)}%`;
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(6)}`;
  return `$${usd.toFixed(4)}`;
}

interface DeltaBadgeProps {
  today: number;
  yesterday: number;
  lowerIsBetter?: boolean;
}

function DeltaBadge({ today, yesterday, lowerIsBetter = false }: DeltaBadgeProps) {
  const t = useTranslations("dashboard");

  if (yesterday === 0 && today === 0) return null;

  if (yesterday === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 type-caption bg-status-success/10 text-status-success">
        <TrendingUp className="h-2.5 w-2.5" />
        NEW
      </span>
    );
  }

  const pct = ((today - yesterday) / yesterday) * 100;
  if (Math.abs(pct) < 1) {
    return <span className="type-caption text-muted-foreground">{t("stats.noChange")}</span>;
  }

  const isPositive = pct > 0;
  // For lower-is-better metrics (latency), positive delta is bad
  const isGood = lowerIsBetter ? !isPositive : isPositive;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 py-0.5 type-caption",
        isGood ? "bg-status-success/10 text-status-success" : "bg-status-error/10 text-status-error"
      )}
    >
      {isPositive ? (
        <TrendingUp className="h-2.5 w-2.5" />
      ) : (
        <TrendingDown className="h-2.5 w-2.5" />
      )}
      {isPositive ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}

function AnimatedCounter({
  value,
  isLoading,
  valueClassName,
  loadingLabel,
}: {
  value: string;
  isLoading: boolean;
  valueClassName?: string;
  loadingLabel: string;
}) {
  if (isLoading) {
    return (
      <DashboardLoadingSurface
        loadingLabel={loadingLabel}
        data-testid="dashboard-stat-value-loading"
        className="flex items-end gap-2 pt-1"
      >
        <DashboardLoadingBlock tone="accent" className="h-8 w-20 sm:w-24" />
        <DashboardLoadingBlock tone="muted" className="mb-1 h-4 w-8" />
      </DashboardLoadingSurface>
    );
  }

  return <p className={cn("type-display-medium", valueClassName ?? "text-foreground")}>{value}</p>;
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  isLoading,
  delay = 0,
  valueClassName,
  loadingLabel,
  delta,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: typeof Activity;
  isLoading: boolean;
  delay?: number;
  valueClassName?: string;
  loadingLabel: string;
  delta?: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "h-full border-border bg-card shadow-[var(--vr-shadow-sm)]",
        "hover:border-amber-500/35 hover:shadow-cf-glow-subtle"
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <p className="type-label-medium text-muted-foreground">{title}</p>
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-cf-sm border border-amber-500/35 bg-amber-500/10 text-amber-500">
            <Icon className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="mt-2">
          <AnimatedCounter
            value={value}
            isLoading={isLoading}
            valueClassName={valueClassName}
            loadingLabel={loadingLabel}
          />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <p className="type-body-small text-muted-foreground">{subtitle}</p>
          {!isLoading && delta}
        </div>
      </CardContent>
    </Card>
  );
}

export function StatsCards({
  todayRequests,
  avgResponseTimeMs,
  totalTokensToday,
  totalCostToday,
  avgTtftMs,
  cacheHitRate,
  yesterdayRequests,
  yesterdayTotalTokens,
  yesterdayCostUsd,
  yesterdayAvgResponseTimeMs,
  yesterdayAvgTtftMs,
  yesterdayCacheHitRate,
  isLoading,
}: StatsCardsProps) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <StatCard
        title={t("stats.todayRequests")}
        value={formatNumber(todayRequests)}
        subtitle={t("stats.requests")}
        icon={Activity}
        isLoading={isLoading}
        delay={0}
        loadingLabel={tCommon("loading")}
        delta={<DeltaBadge today={todayRequests} yesterday={yesterdayRequests} />}
      />
      <StatCard
        title={t("stats.totalTokens")}
        value={formatNumber(totalTokensToday)}
        subtitle={t("stats.tokens")}
        icon={Zap}
        isLoading={isLoading}
        delay={50}
        loadingLabel={tCommon("loading")}
        delta={<DeltaBadge today={totalTokensToday} yesterday={yesterdayTotalTokens} />}
      />
      <StatCard
        title={t("stats.totalCost")}
        value={formatCost(totalCostToday)}
        subtitle={t("stats.cost")}
        icon={DollarSign}
        isLoading={isLoading}
        delay={100}
        loadingLabel={tCommon("loading")}
        delta={<DeltaBadge today={totalCostToday} yesterday={yesterdayCostUsd} />}
      />
      <StatCard
        title={t("stats.avgTtft")}
        value={avgTtftMs > 0 ? formatTtft(avgTtftMs) : "—"}
        subtitle={t("stats.latency")}
        icon={Timer}
        isLoading={isLoading}
        delay={150}
        valueClassName={avgTtftMs > 0 ? getTtftPerformanceClass(avgTtftMs) : "text-foreground"}
        loadingLabel={tCommon("loading")}
        delta={
          avgTtftMs > 0 && yesterdayAvgTtftMs > 0 ? (
            <DeltaBadge today={avgTtftMs} yesterday={yesterdayAvgTtftMs} lowerIsBetter />
          ) : null
        }
      />
      <StatCard
        title={t("stats.avgResponseTime")}
        value={formatDuration(avgResponseTimeMs)}
        subtitle={t("stats.latency")}
        icon={Clock}
        isLoading={isLoading}
        delay={200}
        loadingLabel={tCommon("loading")}
        delta={
          avgResponseTimeMs > 0 && yesterdayAvgResponseTimeMs > 0 ? (
            <DeltaBadge
              today={avgResponseTimeMs}
              yesterday={yesterdayAvgResponseTimeMs}
              lowerIsBetter
            />
          ) : null
        }
      />
      <StatCard
        title={t("stats.cacheHitRate")}
        value={formatCacheRate(cacheHitRate)}
        subtitle={t("stats.tokens")}
        icon={Database}
        isLoading={isLoading}
        delay={250}
        loadingLabel={tCommon("loading")}
        delta={<DeltaBadge today={cacheHitRate} yesterday={yesterdayCacheHitRate} />}
      />
    </div>
  );
}
