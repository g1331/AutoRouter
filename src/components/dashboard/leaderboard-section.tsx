"use client";

import { useTranslations } from "next-intl";
import { Cpu, Key, Server, Trophy } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { StatsLeaderboardResponse } from "@/types/api";

import { formatNumber } from "./chart-theme";

interface LeaderboardSectionProps {
  data: StatsLeaderboardResponse | undefined;
  isLoading: boolean;
}

const RANK_COLORS = [
  "text-amber-500",
  "text-status-info",
  "text-status-warning",
  "text-muted-foreground",
  "text-muted-foreground",
];

function RankBadge({ rank }: { rank: number }) {
  const colorClass = RANK_COLORS[Math.min(rank - 1, RANK_COLORS.length - 1)];
  return (
    <div className="flex items-center gap-1.5">
      {rank <= 3 && <Trophy className={`h-3.5 w-3.5 ${colorClass}`} />}
      <span className={`type-label-medium ${colorClass}`}>#{rank}</span>
    </div>
  );
}

interface LeaderboardTableProps {
  title: string;
  icon: React.ReactNode;
  items: Array<{
    rank: number;
    name: string;
    subtitle?: string;
    requestCount: number;
    totalTokens: number;
    avgTtftMs?: number;
    avgTps?: number;
  }>;
  isLoading: boolean;
  emptyMessage: string;
  showPerformanceMetrics?: boolean;
}

function LeaderboardTable({
  title,
  icon,
  items,
  isLoading,
  emptyMessage,
  showPerformanceMetrics = false,
}: LeaderboardTableProps) {
  const t = useTranslations("dashboard");

  return (
    <Card className="h-full border-border bg-card">
      <CardContent className="p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2 border-b border-divider pb-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-cf-sm border border-amber-500/35 bg-amber-500/10 text-amber-500">
            {icon}
          </div>
          <h4 className="type-label-medium text-foreground">{title}</h4>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((row) => (
              <div key={row} className="flex items-center justify-between">
                <Skeleton variant="inline" className="h-4 w-32" />
                <Skeleton variant="inline" className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="type-body-small py-6 text-center text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="space-y-1">
            {items.map((item) => (
              <div
                key={`${title}-${item.rank}-${item.name}`}
                className="flex items-center justify-between gap-3 rounded-cf-sm border border-transparent px-2 py-1.5 transition-colors hover:border-divider hover:bg-surface-300/65"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <RankBadge rank={item.rank} />
                  <div className="min-w-0">
                    <p className="type-body-small truncate text-foreground">{item.name}</p>
                    {item.subtitle && (
                      <p className="type-caption truncate text-muted-foreground">{item.subtitle}</p>
                    )}
                  </div>
                </div>

                <div className="ml-2 flex-shrink-0 text-right">
                  <p className="type-body-medium text-foreground">
                    {formatNumber(item.requestCount)}
                  </p>
                  <p className="type-caption text-muted-foreground">
                    {formatNumber(item.totalTokens)} {t("stats.tokensShort")}
                  </p>
                  {showPerformanceMetrics && (
                    <p className="type-caption text-muted-foreground">
                      {item.avgTtftMs != null && item.avgTtftMs > 0
                        ? `${formatNumber(item.avgTtftMs)}ms`
                        : "—"}
                      {" / "}
                      {item.avgTps != null && item.avgTps > 0
                        ? `${formatNumber(item.avgTps)} tok/s`
                        : "—"}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function LeaderboardSection({ data, isLoading }: LeaderboardSectionProps) {
  const t = useTranslations("dashboard");

  const apiKeyItems =
    data?.api_keys.map((item, index) => ({
      rank: index + 1,
      name: item.name,
      subtitle: item.key_prefix,
      requestCount: item.request_count,
      totalTokens: item.total_tokens,
    })) ?? [];

  const upstreamItems =
    data?.upstreams.map((item, index) => ({
      rank: index + 1,
      name: item.name,
      subtitle: item.provider_type,
      requestCount: item.request_count,
      totalTokens: item.total_tokens,
      avgTtftMs: item.avg_ttft_ms,
      avgTps: item.avg_tps,
    })) ?? [];

  const modelItems =
    data?.models.map((item, index) => ({
      rank: index + 1,
      name: item.model,
      requestCount: item.request_count,
      totalTokens: item.total_tokens,
    })) ?? [];

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-amber-500" />
        <h3 className="type-title-medium text-foreground">{t("stats.leaderboard")}</h3>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <LeaderboardTable
          title={t("stats.apiKeyRanking")}
          icon={<Key className="h-4 w-4" />}
          items={apiKeyItems}
          isLoading={isLoading}
          emptyMessage={t("stats.noApiKeys")}
        />
        <LeaderboardTable
          title={t("stats.upstreamRanking")}
          icon={<Server className="h-4 w-4" />}
          items={upstreamItems}
          isLoading={isLoading}
          emptyMessage={t("stats.noUpstreams")}
          showPerformanceMetrics
        />
        <LeaderboardTable
          title={t("stats.modelRanking")}
          icon={<Cpu className="h-4 w-4" />}
          items={modelItems}
          isLoading={isLoading}
          emptyMessage={t("stats.noModels")}
        />
      </div>
    </section>
  );
}
