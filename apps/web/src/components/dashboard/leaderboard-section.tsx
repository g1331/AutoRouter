"use client";

/**
 * Leaderboard section component.
 *
 * Displays top performers across API keys, upstreams, and models.
 */

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Key, Server, Cpu, Trophy } from "lucide-react";
import { formatNumber } from "./chart-theme";
import type { StatsLeaderboardResponse } from "@/types/api";

interface LeaderboardSectionProps {
  data: StatsLeaderboardResponse | undefined;
  isLoading: boolean;
}

// Rank badge colors
const RANK_COLORS = [
  "text-yellow-400", // #1 Gold
  "text-gray-300", // #2 Silver
  "text-amber-600", // #3 Bronze
  "text-amber-700", // #4+
  "text-amber-700",
];

function RankBadge({ rank }: { rank: number }) {
  const colorClass = RANK_COLORS[Math.min(rank - 1, RANK_COLORS.length - 1)];
  return (
    <div className="flex items-center gap-1">
      {rank <= 3 && <Trophy className={`w-3 h-3 ${colorClass}`} />}
      <span className={`font-mono text-xs ${colorClass}`}>#{rank}</span>
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
  }>;
  isLoading: boolean;
  emptyMessage: string;
}

function LeaderboardTable({ title, icon, items, isLoading, emptyMessage }: LeaderboardTableProps) {
  const t = useTranslations("dashboard");

  return (
    <Card className="cf-panel h-full">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-amber-500/20">
          <div className="w-8 h-8 rounded-cf-sm bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
            {icon}
          </div>
          <h4 className="font-mono text-xs uppercase tracking-wider text-amber-500">{title}</h4>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton variant="inline" className="w-32 h-4" />
                <Skeleton variant="inline" className="w-16 h-4" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="font-mono text-xs text-amber-700 text-center py-4">{emptyMessage}</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.rank}
                className="flex items-center justify-between py-1.5 border-b border-amber-500/10 last:border-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <RankBadge rank={item.rank} />
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-amber-500 truncate">{item.name}</p>
                    {item.subtitle && (
                      <p className="font-mono text-[10px] text-amber-700 truncate">
                        {item.subtitle}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <p className="font-display text-sm text-amber-500">
                    {formatNumber(item.requestCount)}
                  </p>
                  <p className="font-mono text-[10px] text-amber-700">
                    {formatNumber(item.totalTokens)} {t("stats.tokensShort")}
                  </p>
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

  // Transform data for display
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
      subtitle: item.provider,
      requestCount: item.request_count,
      totalTokens: item.total_tokens,
    })) ?? [];

  const modelItems =
    data?.models.map((item, index) => ({
      rank: index + 1,
      name: item.model,
      requestCount: item.request_count,
      totalTokens: item.total_tokens,
    })) ?? [];

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4 text-amber-500" />
        <h3 className="font-mono text-sm text-amber-500 uppercase tracking-wider">
          {t("stats.leaderboard")}
        </h3>
      </div>

      {/* Three-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <LeaderboardTable
          title={t("stats.apiKeyRanking")}
          icon={<Key className="w-4 h-4 text-amber-500" />}
          items={apiKeyItems}
          isLoading={isLoading}
          emptyMessage={t("stats.noApiKeys")}
        />
        <LeaderboardTable
          title={t("stats.upstreamRanking")}
          icon={<Server className="w-4 h-4 text-amber-500" />}
          items={upstreamItems}
          isLoading={isLoading}
          emptyMessage={t("stats.noUpstreams")}
        />
        <LeaderboardTable
          title={t("stats.modelRanking")}
          icon={<Cpu className="w-4 h-4 text-amber-500" />}
          items={modelItems}
          isLoading={isLoading}
          emptyMessage={t("stats.noModels")}
        />
      </div>
    </div>
  );
}
