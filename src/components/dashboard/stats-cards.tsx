"use client";

import { useTranslations } from "next-intl";
import { Activity, Clock, Zap, Timer, Database } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { formatDuration, formatNumber } from "./chart-theme";

interface StatsCardsProps {
  todayRequests: number;
  avgResponseTimeMs: number;
  totalTokensToday: number;
  avgTtftMs: number;
  cacheHitRate: number;
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

function AnimatedCounter({
  value,
  isLoading,
  valueClassName,
}: {
  value: string;
  isLoading: boolean;
  valueClassName?: string;
}) {
  if (isLoading) {
    return <Skeleton variant="counter" placeholder="---" />;
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
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: typeof Activity;
  isLoading: boolean;
  delay?: number;
  valueClassName?: string;
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
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <p className="type-label-medium text-muted-foreground">{title}</p>
            <AnimatedCounter value={value} isLoading={isLoading} valueClassName={valueClassName} />
            <p className="type-body-small text-muted-foreground">{subtitle}</p>
          </div>

          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-cf-sm border border-amber-500/35 bg-amber-500/10 text-amber-500">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatsCards({
  todayRequests,
  avgResponseTimeMs,
  totalTokensToday,
  avgTtftMs,
  cacheHitRate,
  isLoading,
}: StatsCardsProps) {
  const t = useTranslations("dashboard");

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      <StatCard
        title={t("stats.todayRequests")}
        value={formatNumber(todayRequests)}
        subtitle={t("stats.requests")}
        icon={Activity}
        isLoading={isLoading}
        delay={0}
      />
      <StatCard
        title={t("stats.avgResponseTime")}
        value={formatDuration(avgResponseTimeMs)}
        subtitle={t("stats.latency")}
        icon={Clock}
        isLoading={isLoading}
        delay={80}
      />
      <StatCard
        title={t("stats.totalTokens")}
        value={formatNumber(totalTokensToday)}
        subtitle={t("stats.tokens")}
        icon={Zap}
        isLoading={isLoading}
        delay={160}
      />
      <StatCard
        title={t("stats.avgTtft")}
        value={avgTtftMs > 0 ? formatTtft(avgTtftMs) : "—"}
        subtitle={t("stats.latency")}
        icon={Timer}
        isLoading={isLoading}
        delay={240}
        valueClassName={avgTtftMs > 0 ? getTtftPerformanceClass(avgTtftMs) : "text-foreground"}
      />
      <StatCard
        title={t("stats.cacheHitRate")}
        value={formatCacheRate(cacheHitRate)}
        subtitle={t("stats.tokens")}
        icon={Database}
        isLoading={isLoading}
        delay={320}
      />
    </div>
  );
}
