"use client";

import { useTranslations } from "next-intl";
import { Cpu, Key, Server, Trophy } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StatsLeaderboardResponse, DistributionItem } from "@/types/api";

import { formatNumber } from "./chart-theme";
import { DashboardLoadingBlock, DashboardLoadingSurface } from "./dashboard-loading";

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

const PIE_COLORS = [
  "#f59e0b",
  "#3b82f6",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#f97316",
  "#06b6d4",
  "#84cc16",
];

function formatTtft(ttftMs: number): string {
  if (ttftMs >= 1000) return `${(ttftMs / 1000).toFixed(3)}s`;
  return `${Math.round(ttftMs)}ms`;
}

function getTtftClass(ttftMs: number): string {
  if (ttftMs >= 1000) return "text-status-error";
  if (ttftMs >= 500) return "text-status-warning";
  return "text-status-success";
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(6)}`;
  return `$${usd.toFixed(4)}`;
}

function RankBadge({ rank }: { rank: number }) {
  const colorClass = RANK_COLORS[Math.min(rank - 1, RANK_COLORS.length - 1)];
  return (
    <div className="flex w-8 items-center justify-center gap-1">
      {rank <= 3 && <Trophy className={`h-3 w-3 ${colorClass}`} />}
      <span className={`type-label-medium ${colorClass}`}>#{rank}</span>
    </div>
  );
}

function MiniPieChart({ data, label }: { data: DistributionItem[]; label: string }) {
  if (!data.length) return null;

  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="flex flex-col items-center">
      <p className="type-caption mb-1 text-muted-foreground">{label}</p>
      <div className="relative h-24 w-24">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data as unknown as Record<string, unknown>[]}
              dataKey="count"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={26}
              outerRadius={42}
              strokeWidth={0}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number | undefined, name: string | undefined) => {
                if (value == null) return ["-", name ?? ""];
                return [
                  `${formatNumber(value)} (${((value / total) * 100).toFixed(1)}%)`,
                  name ?? "",
                ];
              }}
              contentStyle={{
                background: "var(--background)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "11px",
                padding: "6px 10px",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1.5 flex flex-wrap justify-center gap-x-2 gap-y-0.5">
        {data.slice(0, 4).map((d, i) => (
          <div key={d.name} className="flex items-center gap-1">
            <span
              className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
            />
            <span className="type-caption max-w-[80px] truncate text-muted-foreground">
              {d.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCell({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="type-caption text-muted-foreground">{label}</p>
      <p className={cn("type-body-small tabular-nums text-foreground truncate", className)}>
        {value}
      </p>
    </div>
  );
}

function LeaderboardLoadingRow({ cols }: { cols: number }) {
  return (
    <div
      data-testid="leaderboard-loading-row"
      className="flex items-center gap-4 rounded-cf-sm border border-divider/65 bg-surface-200/45 px-3 py-2.5"
    >
      <DashboardLoadingBlock tone="accent" className="h-4 w-8 flex-shrink-0" />
      <DashboardLoadingBlock className="h-3 w-32" />
      {Array.from({ length: cols }).map((_, i) => (
        <DashboardLoadingBlock key={i} tone="muted" className="h-3 flex-1" />
      ))}
      <DashboardLoadingBlock tone="muted" className="h-20 w-20 flex-shrink-0 rounded-full" />
    </div>
  );
}

export function LeaderboardSection({ data, isLoading }: LeaderboardSectionProps) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-amber-500" />
        <h3 className="type-title-medium text-foreground">{t("stats.leaderboard")}</h3>
      </div>

      {/* Upstream Ranking */}
      <Card className="border-border bg-card">
        <CardContent className="p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2 border-b border-divider pb-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-cf-sm border border-amber-500/35 bg-amber-500/10 text-amber-500">
              <Server className="h-3.5 w-3.5" />
            </div>
            <h4 className="type-label-medium text-foreground">{t("stats.upstreamRanking")}</h4>
          </div>

          {isLoading ? (
            <DashboardLoadingSurface loadingLabel={tCommon("loading")} className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <LeaderboardLoadingRow key={i} cols={5} />
              ))}
            </DashboardLoadingSurface>
          ) : !data?.upstreams.length ? (
            <p className="type-body-small py-6 text-center text-muted-foreground">
              {t("stats.noUpstreams")}
            </p>
          ) : (
            <div className="space-y-1.5">
              {data.upstreams.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-cf-sm border border-transparent px-2.5 py-2 transition-colors hover:border-divider hover:bg-surface-300/65"
                >
                  <RankBadge rank={index + 1} />

                  <div className="min-w-[120px]">
                    <p className="type-body-small truncate text-foreground">{item.name}</p>
                    <p className="type-caption truncate text-muted-foreground">
                      {item.provider_type}
                    </p>
                  </div>

                  <div className="ml-2 grid flex-1 grid-cols-3 gap-x-4 gap-y-1 sm:grid-cols-6">
                    <MetricCell
                      label={t("stats.requests")}
                      value={formatNumber(item.request_count)}
                    />
                    <MetricCell
                      label={t("stats.tokens")}
                      value={`${formatNumber(item.total_tokens)} tok`}
                    />
                    <MetricCell
                      label={t("stats.upstreamAvgTtft")}
                      value={item.avg_ttft_ms > 0 ? formatTtft(item.avg_ttft_ms) : "—"}
                      className={item.avg_ttft_ms > 0 ? getTtftClass(item.avg_ttft_ms) : undefined}
                    />
                    <MetricCell
                      label={t("stats.upstreamAvgTps")}
                      value={item.avg_tps > 0 ? `${formatNumber(item.avg_tps)} tok/s` : "—"}
                    />
                    <MetricCell
                      label={t("stats.upstreamCacheHit")}
                      value={`${item.cache_hit_rate.toFixed(1)}%`}
                    />
                    <MetricCell
                      label={t("stats.upstreamCost")}
                      value={formatCost(item.total_cost_usd)}
                    />
                  </div>

                  <div className="hidden sm:block">
                    <MiniPieChart
                      data={item.model_distribution}
                      label={t("stats.modelDistribution")}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Model Ranking */}
      <Card className="border-border bg-card">
        <CardContent className="p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2 border-b border-divider pb-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-cf-sm border border-amber-500/35 bg-amber-500/10 text-amber-500">
              <Cpu className="h-3.5 w-3.5" />
            </div>
            <h4 className="type-label-medium text-foreground">{t("stats.modelRanking")}</h4>
          </div>

          {isLoading ? (
            <DashboardLoadingSurface loadingLabel={tCommon("loading")} className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <LeaderboardLoadingRow key={i} cols={4} />
              ))}
            </DashboardLoadingSurface>
          ) : !data?.models.length ? (
            <p className="type-body-small py-6 text-center text-muted-foreground">
              {t("stats.noModels")}
            </p>
          ) : (
            <div className="space-y-1.5">
              {data.models.map((item, index) => (
                <div
                  key={item.model}
                  className="flex items-center gap-3 rounded-cf-sm border border-transparent px-2.5 py-2 transition-colors hover:border-divider hover:bg-surface-300/65"
                >
                  <RankBadge rank={index + 1} />

                  <div className="min-w-[160px]">
                    <p className="type-body-small truncate text-foreground">{item.model}</p>
                  </div>

                  <div className="ml-2 grid flex-1 grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                    <MetricCell
                      label={t("stats.tokens")}
                      value={`${formatNumber(item.total_tokens)} tok`}
                    />
                    <MetricCell
                      label={t("stats.requests")}
                      value={formatNumber(item.request_count)}
                    />
                    <MetricCell
                      label={t("stats.upstreamAvgTtft")}
                      value={item.avg_ttft_ms > 0 ? formatTtft(item.avg_ttft_ms) : "—"}
                      className={item.avg_ttft_ms > 0 ? getTtftClass(item.avg_ttft_ms) : undefined}
                    />
                    <MetricCell
                      label={t("stats.upstreamAvgTps")}
                      value={item.avg_tps > 0 ? `${formatNumber(item.avg_tps)} tok/s` : "—"}
                    />
                  </div>

                  <div className="hidden sm:block">
                    <MiniPieChart
                      data={item.upstream_distribution}
                      label={t("stats.upstreamDistribution")}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Key Ranking */}
      <Card className="border-border bg-card">
        <CardContent className="p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2 border-b border-divider pb-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-cf-sm border border-amber-500/35 bg-amber-500/10 text-amber-500">
              <Key className="h-3.5 w-3.5" />
            </div>
            <h4 className="type-label-medium text-foreground">{t("stats.apiKeyRanking")}</h4>
          </div>

          {isLoading ? (
            <DashboardLoadingSurface loadingLabel={tCommon("loading")} className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <LeaderboardLoadingRow key={i} cols={3} />
              ))}
            </DashboardLoadingSurface>
          ) : !data?.api_keys.length ? (
            <p className="type-body-small py-6 text-center text-muted-foreground">
              {t("stats.noApiKeys")}
            </p>
          ) : (
            <div className="space-y-1.5">
              {data.api_keys.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-cf-sm border border-transparent px-2.5 py-2 transition-colors hover:border-divider hover:bg-surface-300/65"
                >
                  <RankBadge rank={index + 1} />

                  <div className="min-w-[140px]">
                    <p className="type-body-small truncate text-foreground">{item.name}</p>
                    <p className="type-caption truncate text-muted-foreground font-mono">
                      {item.key_prefix}
                    </p>
                  </div>

                  <div className="ml-2 grid flex-1 grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                    <MetricCell
                      label={t("stats.requests")}
                      value={formatNumber(item.request_count)}
                    />
                    <MetricCell
                      label={t("stats.tokens")}
                      value={`${formatNumber(item.total_tokens)} tok`}
                    />
                    <MetricCell
                      label={t("stats.upstreamCost")}
                      value={formatCost(item.total_cost_usd)}
                    />
                  </div>

                  <div className="hidden sm:block">
                    <MiniPieChart
                      data={item.model_distribution}
                      label={t("stats.modelDistribution")}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
