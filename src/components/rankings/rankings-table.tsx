"use client";

import { Fragment, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ChevronDown, ExternalLink, Minus, Trophy } from "lucide-react";

import { formatCost, formatNumber, formatTtft } from "@/components/dashboard/chart-theme";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type {
  DistributionItem,
  RankingsDimension,
  RankingsItem,
  RankingsSortField,
} from "@/types/api";

export interface RankingsLogsWindow {
  startIso: string;
  endIso?: string;
}

interface RankingsTableProps {
  dimension: RankingsDimension;
  items: RankingsItem[];
  isLoading: boolean;
  sortBy: RankingsSortField;
  order: "asc" | "desc";
  onSortChange: (field: RankingsSortField) => void;
  logsWindow: RankingsLogsWindow;
  /** Overrides the default empty-state text (e.g. "no match" while filters are active). */
  emptyLabel?: string;
}

// One entry per metric: header label, raw value (ratio bar / sorting), and
// display formatting live together so a new metric can't be half-wired.
interface MetricColumn {
  field: RankingsSortField;
  labelKey: string;
  value: (item: RankingsItem) => number;
  format: (item: RankingsItem) => string;
}

const METRIC_COLUMNS: MetricColumn[] = [
  {
    field: "requests",
    labelKey: "columns.requests",
    value: (item) => item.request_count,
    format: (item) => formatNumber(item.request_count),
  },
  {
    field: "tokens",
    labelKey: "columns.tokens",
    value: (item) => item.total_tokens,
    format: (item) => `${formatNumber(item.total_tokens)} tok`,
  },
  {
    field: "cost",
    labelKey: "columns.cost",
    value: (item) => item.total_cost_usd,
    format: (item) => formatCost(item.total_cost_usd),
  },
  {
    field: "ttft",
    labelKey: "columns.ttft",
    value: (item) => item.avg_ttft_ms,
    format: (item) => (item.avg_ttft_ms > 0 ? formatTtft(item.avg_ttft_ms) : "—"),
  },
  {
    field: "tps",
    labelKey: "columns.tps",
    value: (item) => item.avg_tps,
    format: (item) => (item.avg_tps > 0 ? `${formatNumber(item.avg_tps)} tok/s` : "—"),
  },
  {
    field: "cache_hit",
    labelKey: "columns.cacheHit",
    value: (item) => item.cache_hit_rate,
    format: (item) => `${item.cache_hit_rate.toFixed(1)}%`,
  },
  {
    field: "error_rate",
    labelKey: "columns.errorRate",
    value: (item) => item.error_rate,
    format: (item) => `${item.error_rate.toFixed(1)}%`,
  },
];

const COLUMN_BY_FIELD = new Map(METRIC_COLUMNS.map((column) => [column.field, column]));

function metricValue(item: RankingsItem, field: RankingsSortField): number {
  return COLUMN_BY_FIELD.get(field)?.value(item) ?? 0;
}

const RANK_COLORS = ["text-amber-500", "text-status-info", "text-status-success"];

function itemKey(dimension: RankingsDimension, item: RankingsItem): string {
  return dimension === "models" && "model" in item ? item.model : (item as { id: string }).id;
}

function itemDistribution(item: RankingsItem): DistributionItem[] {
  return "upstream_distribution" in item ? item.upstream_distribution : item.model_distribution;
}

function logsHref(
  dimension: RankingsDimension,
  item: RankingsItem,
  window: RankingsLogsWindow
): string {
  const params = new URLSearchParams();
  if (dimension === "models" && "model" in item) {
    params.set("model", item.model);
  } else if (dimension === "upstreams") {
    params.set("upstream_id", (item as { id: string }).id);
  } else if (dimension === "api_keys") {
    params.set("api_key_id", (item as { id: string }).id);
  } else {
    params.set("user_id", (item as { id: string }).id);
  }
  params.set("start_time", window.startIso);
  if (window.endIso) {
    params.set("end_time", window.endIso);
  }
  return `/logs?${params.toString()}`;
}

function errorRateClass(rate: number): string | undefined {
  if (rate >= 5) return "text-status-error";
  if (rate > 0) return "text-status-warning";
  return undefined;
}

function ItemName({ dimension, item }: { dimension: RankingsDimension; item: RankingsItem }) {
  if (dimension === "models" && "model" in item) {
    return <p className="type-body-small truncate text-foreground">{item.model}</p>;
  }
  if ("provider_type" in item) {
    return (
      <>
        <p className="type-body-small truncate text-foreground">{item.name}</p>
        <p className="type-caption truncate text-muted-foreground">{item.provider_type}</p>
      </>
    );
  }
  if ("key_prefix" in item) {
    return (
      <>
        <p className="type-body-small truncate text-foreground">{item.name}</p>
        <p className="type-caption truncate font-mono text-muted-foreground">{item.key_prefix}</p>
      </>
    );
  }
  if ("username" in item) {
    return (
      <>
        <p className="type-body-small truncate text-foreground">{item.display_name}</p>
        <p className="type-caption truncate text-muted-foreground">@{item.username}</p>
      </>
    );
  }
  return null;
}

function ComparisonCell({ item, rank }: { item: RankingsItem; rank: number }) {
  const t = useTranslations("rankings");
  const comparison = item.comparison;

  if (!comparison) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (comparison.prev_rank === null) {
    return (
      <Badge variant="info" className="px-1.5 py-0 text-[10px] leading-4">
        {t("newEntry")}
      </Badge>
    );
  }

  const rankDelta = comparison.prev_rank - rank;
  const prevCount = comparison.prev_request_count ?? 0;
  const pctChange = prevCount > 0 ? ((item.request_count - prevCount) / prevCount) * 100 : null;

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
      {rankDelta > 0 ? (
        <span className="inline-flex items-center text-status-success">
          <ArrowUp className="h-3 w-3" />
          {rankDelta}
        </span>
      ) : rankDelta < 0 ? (
        <span className="inline-flex items-center text-status-error">
          <ArrowDown className="h-3 w-3" />
          {Math.abs(rankDelta)}
        </span>
      ) : (
        <Minus className="h-3 w-3 text-muted-foreground" />
      )}
      {pctChange !== null && (
        <span className="type-caption text-muted-foreground">
          {pctChange >= 0 ? "+" : ""}
          {pctChange.toFixed(1)}%
        </span>
      )}
    </span>
  );
}

function DistributionList({ data, label }: { data: DistributionItem[]; label: string }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <p className="type-caption text-muted-foreground">{label}</p>
      {data.map((d) => {
        const pct = total > 0 ? (d.count / total) * 100 : 0;
        return (
          <div key={d.name} className="flex items-center gap-2">
            <span className="type-caption w-40 truncate text-foreground" title={d.name}>
              {d.name}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-400/60">
              <div className="h-full rounded-full bg-amber-500/70" style={{ width: `${pct}%` }} />
            </div>
            <span className="type-caption w-24 shrink-0 text-right tabular-nums text-muted-foreground">
              {formatNumber(d.count)} ({pct.toFixed(1)}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function RankingsTable({
  dimension,
  items,
  isLoading,
  sortBy,
  order,
  onSortChange,
  logsWindow,
  emptyLabel,
}: RankingsTableProps) {
  const t = useTranslations("rankings");
  const tCommon = useTranslations("common");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const maxSortValue = items.reduce((max, item) => Math.max(max, metricValue(item, sortBy)), 0);
  const columnCount = METRIC_COLUMNS.length + 3;
  const distributionLabel =
    dimension === "models" ? t("distribution.upstreams") : t("distribution.models");

  return (
    <Card variant="outlined" className="border-divider bg-surface-200/70 overflow-hidden">
      <Table frame="none" containerClassName="rounded-none border-0 bg-transparent">
        <TableHeader>
          <TableRow>
            <TableHead className="w-14 px-2">#</TableHead>
            <TableHead className="min-w-[160px] px-2">{t("columns.name")}</TableHead>
            {METRIC_COLUMNS.map(({ field, labelKey }) => {
              const active = sortBy === field;
              return (
                <TableHead
                  key={field}
                  className="px-2 text-right"
                  aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button
                    type="button"
                    onClick={() => onSortChange(field)}
                    className={cn(
                      "inline-flex items-center gap-0.5 whitespace-nowrap rounded-cf-sm px-1 py-0.5 transition-colors",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "text-amber-500" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t(labelKey)}
                    {active &&
                      (order === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      ))}
                  </button>
                </TableHead>
              );
            })}
            <TableHead className="w-28 px-2">{t("columns.change")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="py-10 text-center text-muted-foreground">
                {tCommon("loading")}
              </TableCell>
            </TableRow>
          ) : items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="py-10 text-center text-muted-foreground">
                {emptyLabel ?? t("empty")}
              </TableCell>
            </TableRow>
          ) : (
            items.map((item, index) => {
              const key = itemKey(dimension, item);
              const rank = index + 1;
              const expanded = expandedKey === key;
              const sortValue = metricValue(item, sortBy);
              const barPct = maxSortValue > 0 ? (sortValue / maxSortValue) * 100 : 0;
              const distribution = itemDistribution(item);

              return (
                <Fragment key={key}>
                  <TableRow
                    data-testid="rankings-row"
                    onClick={() => setExpandedKey(expanded ? null : key)}
                    className="cursor-pointer"
                    // Inline ratio bar: the current sort metric relative to the leader.
                    style={{
                      background: `linear-gradient(90deg, rgb(245 158 11 / 0.08) ${barPct}%, transparent ${barPct}%)`,
                    }}
                  >
                    <TableCell className="px-2 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 type-label-medium",
                          rank <= 3 ? RANK_COLORS[rank - 1] : "text-muted-foreground"
                        )}
                      >
                        {rank <= 3 && <Trophy className="h-3 w-3" />}#{rank}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[240px] px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                            expanded && "rotate-180"
                          )}
                        />
                        <div className="min-w-0">
                          <ItemName dimension={dimension} item={item} />
                        </div>
                      </div>
                    </TableCell>
                    {METRIC_COLUMNS.map(({ field, format }) => (
                      <TableCell
                        key={field}
                        className={cn(
                          "px-2 py-2 text-right tabular-nums",
                          field === sortBy && "text-foreground",
                          field === "error_rate" && errorRateClass(item.error_rate)
                        )}
                      >
                        {format(item)}
                      </TableCell>
                    ))}
                    <TableCell className="px-2 py-2">
                      <ComparisonCell item={item} rank={rank} />
                    </TableCell>
                  </TableRow>
                  {expanded && (
                    <TableRow data-testid="rankings-detail-row" className="bg-surface-300/40">
                      <TableCell colSpan={columnCount} className="px-4 py-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
                          {distribution.length > 0 ? (
                            <DistributionList data={distribution} label={distributionLabel} />
                          ) : (
                            <p className="type-caption flex-1 text-muted-foreground">
                              {t("noDistribution")}
                            </p>
                          )}
                          <Link
                            href={logsHref(dimension, item, logsWindow)}
                            onClick={(event) => event.stopPropagation()}
                            className={cn(
                              "inline-flex shrink-0 items-center gap-1.5 rounded-cf-sm border border-border bg-surface-200 px-3 py-1.5",
                              "type-label-medium text-muted-foreground transition-colors hover:bg-surface-300 hover:text-foreground"
                            )}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {t("viewLogs")}
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </Card>
  );
}
