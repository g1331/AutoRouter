"use client";

import { useTranslations } from "next-intl";
import { Activity, Clock, Zap } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { formatDuration, formatNumber } from "./chart-theme";

interface StatsCardsProps {
  todayRequests: number;
  avgResponseTimeMs: number;
  totalTokensToday: number;
  isLoading: boolean;
}

function AnimatedCounter({ value, isLoading }: { value: string; isLoading: boolean }) {
  if (isLoading) {
    return <Skeleton variant="counter" placeholder="---" />;
  }

  return <p className="type-display-medium text-foreground">{value}</p>;
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  isLoading,
  delay = 0,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: typeof Activity;
  isLoading: boolean;
  delay?: number;
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
            <AnimatedCounter value={value} isLoading={isLoading} />
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
  isLoading,
}: StatsCardsProps) {
  const t = useTranslations("dashboard");

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
    </div>
  );
}
