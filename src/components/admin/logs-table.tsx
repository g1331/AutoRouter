"use client";

import { useState, useMemo, useEffect, useRef, Fragment } from "react";
import { formatDistanceToNow, subDays, startOfDay } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { ScrollText, Filter, ChevronDown, ChevronUp } from "lucide-react";
import type { RequestLog, TimeRange } from "@/types/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { getDateLocale } from "@/lib/date-locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TokenDisplay, TokenDetailContent } from "@/components/admin/token-display";
import { RoutingDecisionTimeline } from "@/components/admin/routing-decision-timeline";
import { HeaderDiffPanel } from "@/components/logs/header-diff-panel";

interface LogsTableProps {
  logs: RequestLog[];
  isLive?: boolean;
}

type PerformancePreset = "all" | "high_ttft" | "low_tps" | "slow_duration";

const HIGH_TTFT_THRESHOLD_MS = 5000;
const LOW_TPS_THRESHOLD = 30;
const SLOW_DURATION_THRESHOLD_MS = 20000;
const MIN_TPS_COMPLETION_TOKENS = 10;
const MIN_TPS_DURATION_MS = 100;

type LatencyBreakdownKey = "routing" | "ttft" | "generation" | "other";

interface LatencyBreakdownSegment {
  key: LatencyBreakdownKey;
  valueMs: number;
  textClass: string;
  dotClass: string;
  dashArray: string;
  dashOffset: number;
}

interface LatencyBreakdown {
  ringRadius: number;
  segments: LatencyBreakdownSegment[];
}

const DETAIL_PANEL_CLASS =
  "rounded-cf-sm border border-divider bg-surface-300/55 shadow-[var(--vr-shadow-xs)]";
const DETAIL_PANEL_HEADER_CLASS =
  "border-b border-divider/80 bg-surface-200/70 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground";
const DETAIL_PANEL_BODY_CLASS = "px-3 py-2.5";

function getTtftPerformanceClass(ttftMs: number): string {
  if (ttftMs >= 1000) return "text-status-error";
  if (ttftMs >= 500) return "text-status-warning";
  return "text-status-success";
}

function getTtftIndicatorBgClass(ttftMs: number): string {
  if (ttftMs >= 1000) return "bg-status-error";
  if (ttftMs >= 500) return "bg-status-warning";
  return "bg-status-success";
}

function buildLatencyBreakdown(
  durationMs: number | null,
  routingDurationMs: number | null,
  ttftMs: number | null,
  generationMs: number | null
): LatencyBreakdown | null {
  if (durationMs == null || durationMs <= 0) {
    return null;
  }

  const totalMs = Math.max(0, durationMs);
  const routingMs =
    routingDurationMs == null ? 0 : Math.max(0, Math.min(totalMs, Math.round(routingDurationMs)));
  const ttftValueMs = ttftMs == null ? 0 : Math.max(0, Math.round(ttftMs));
  const generationValueMs = generationMs == null ? 0 : Math.max(0, Math.round(generationMs));
  const otherMs = Math.max(0, totalMs - routingMs - ttftValueMs - generationValueMs);

  const baseSegments: Array<Omit<LatencyBreakdownSegment, "dashArray" | "dashOffset">> = [
    {
      key: "routing",
      valueMs: routingMs,
      textClass: "text-orange-500",
      dotClass: "bg-orange-500",
    },
    ...(ttftValueMs > 0
      ? [
          {
            key: "ttft" as const,
            valueMs: ttftValueMs,
            textClass: getTtftPerformanceClass(ttftValueMs),
            dotClass: getTtftIndicatorBgClass(ttftValueMs),
          },
        ]
      : []),
    ...(generationValueMs > 0
      ? [
          {
            key: "generation" as const,
            valueMs: generationValueMs,
            textClass: "text-status-success",
            dotClass: "bg-status-success",
          },
        ]
      : []),
    ...(otherMs > 0
      ? [
          {
            key: "other" as const,
            valueMs: otherMs,
            textClass: "text-muted-foreground",
            dotClass: "bg-surface-500",
          },
        ]
      : []),
  ];

  const segments = baseSegments.filter((segment) => segment.valueMs > 0);
  if (segments.length === 0) {
    return null;
  }

  const ringRadius = 16;
  const ringCircumference = 2 * Math.PI * ringRadius;
  let offsetCursor = 0;
  const donutSegments = segments.map((segment) => {
    const arcLength = (segment.valueMs / totalMs) * ringCircumference;
    const segmentOffset = offsetCursor;
    offsetCursor += arcLength;
    return {
      ...segment,
      dashArray: `${arcLength} ${Math.max(ringCircumference - arcLength, 0)}`,
      dashOffset: -segmentOffset,
    };
  });

  return {
    ringRadius,
    segments: donutSegments,
  };
}

function getGenerationMs(log: RequestLog): number | null {
  if (
    !log.is_stream ||
    log.duration_ms == null ||
    log.routing_duration_ms == null ||
    log.ttft_ms == null
  ) {
    return null;
  }

  const generationMs = log.duration_ms - log.routing_duration_ms - log.ttft_ms;
  return generationMs > 0 ? generationMs : null;
}

function getRequestTps(log: RequestLog): number | null {
  if (
    !log.is_stream ||
    log.duration_ms == null ||
    log.duration_ms <= MIN_TPS_DURATION_MS ||
    log.completion_tokens < MIN_TPS_COMPLETION_TOKENS
  ) {
    return null;
  }
  return Math.round((log.completion_tokens / log.duration_ms) * 1000 * 10) / 10;
}

function getPercentile(values: number[], percentile: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

export function LogsTable({ logs }: LogsTableProps) {
  const t = useTranslations("logs");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
  const usdFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "USD",
        // Avoid "US$" prefix in some locales (e.g. zh-CN) to keep the cost column compact.
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      }),
    [locale]
  );
  const tokenFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  const resolveBillingReasonLabel = (reason: string | null | undefined): string => {
    if (!reason) {
      return "-";
    }
    if (reason === "model_missing") return t("billingReasonModelMissing");
    if (reason === "usage_missing") return t("billingReasonUsageMissing");
    if (reason === "price_not_found") return t("billingReasonPriceNotFound");
    if (reason === "calculation_error") return t("billingReasonCalculationError");
    return reason;
  };

  const formatBillingCost = (log: RequestLog): string => {
    if (log.final_cost == null) {
      return "-";
    }
    const currency = log.currency ?? "USD";
    if (currency !== "USD") {
      return `${log.final_cost.toFixed(6)} ${currency}`;
    }
    return usdFormatter.format(log.final_cost);
  };

  const formatMoneyValue = (
    value: number | null | undefined,
    currency: string | null | undefined
  ): string => {
    if (value == null) {
      return "-";
    }
    const resolvedCurrency = currency ?? "USD";
    if (resolvedCurrency !== "USD") {
      return `${value.toFixed(6)} ${resolvedCurrency}`;
    }
    return usdFormatter.format(value);
  };

  // Filter state
  const [statusCodeFilter, setStatusCodeFilter] = useState<string>("all");
  const [modelFilter, setModelFilter] = useState<string>("");
  const [timeRangeFilter, setTimeRangeFilter] = useState<TimeRange>("30d");
  const [performancePreset, setPerformancePreset] = useState<PerformancePreset>("all");
  const [isMobileLayout, setIsMobileLayout] = useState(false);

  // Expanded rows state for failover details
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Track new log IDs for scan animation
  const [newLogIds, setNewLogIds] = useState<Set<string>>(new Set());
  const prevLogIdsRef = useRef<Set<string> | null>(null); // null = initial load
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const updateLayout = () => setIsMobileLayout(mediaQuery.matches);
    updateLayout();

    mediaQuery.addEventListener("change", updateLayout);
    return () => {
      mediaQuery.removeEventListener("change", updateLayout);
    };
  }, []);

  // Detect new logs and trigger animation (skip initial load)
  useEffect(() => {
    const currentIds = new Set(logs.map((log) => log.id));

    // Skip animation on initial load
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      prevLogIdsRef.current = currentIds;
      return;
    }

    const prevIds = prevLogIdsRef.current;
    if (!prevIds) {
      prevLogIdsRef.current = currentIds;
      return;
    }

    const newIds = new Set<string>();
    currentIds.forEach((id) => {
      if (!prevIds.has(id)) {
        newIds.add(id);
      }
    });

    // Always update the ref first
    prevLogIdsRef.current = currentIds;

    if (newIds.size > 0) {
      // Use queueMicrotask to defer state updates
      queueMicrotask(() => {
        setNewLogIds(newIds);
      });

      // Clear animation after it completes
      const clearTimer = setTimeout(() => {
        setNewLogIds(new Set());
      }, 500);

      return () => {
        clearTimeout(clearTimer);
      };
    }
  }, [logs]);

  const toggleRow = (logId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedRows(newExpanded);
  };

  // Filter logs based on criteria
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Status code filter
      if (statusCodeFilter !== "all") {
        if (
          statusCodeFilter === "2xx" &&
          (log.status_code === null || log.status_code < 200 || log.status_code >= 300)
        ) {
          return false;
        }
        if (
          statusCodeFilter === "4xx" &&
          (log.status_code === null || log.status_code < 400 || log.status_code >= 500)
        ) {
          return false;
        }
        if (
          statusCodeFilter === "5xx" &&
          (log.status_code === null || log.status_code < 500 || log.status_code >= 600)
        ) {
          return false;
        }
      }

      // Model filter (case-insensitive partial match)
      if (
        modelFilter &&
        log.model &&
        !log.model.toLowerCase().includes(modelFilter.toLowerCase())
      ) {
        return false;
      }

      // Time range filter
      const logDate = new Date(log.created_at);
      const now = new Date();

      if (timeRangeFilter === "today") {
        const todayStart = startOfDay(now);
        if (logDate < todayStart) {
          return false;
        }
      } else if (timeRangeFilter === "7d") {
        const sevenDaysAgo = subDays(now, 7);
        if (logDate < sevenDaysAgo) {
          return false;
        }
      } else if (timeRangeFilter === "30d") {
        const thirtyDaysAgo = subDays(now, 30);
        if (logDate < thirtyDaysAgo) {
          return false;
        }
      }

      if (performancePreset === "high_ttft") {
        if (log.ttft_ms == null || log.ttft_ms <= HIGH_TTFT_THRESHOLD_MS) {
          return false;
        }
      } else if (performancePreset === "low_tps") {
        const tps = getRequestTps(log);
        if (tps == null || tps >= LOW_TPS_THRESHOLD) {
          return false;
        }
      } else if (performancePreset === "slow_duration") {
        if (log.duration_ms == null || log.duration_ms <= SLOW_DURATION_THRESHOLD_MS) {
          return false;
        }
      }

      return true;
    });
  }, [logs, statusCodeFilter, modelFilter, timeRangeFilter, performancePreset]);

  const performanceSummary = useMemo(() => {
    const streamLogs = filteredLogs.filter((log) => log.is_stream);
    const ttftValues = streamLogs
      .map((log) => log.ttft_ms)
      .filter((value): value is number => value != null && value > 0);
    const tpsValues = streamLogs
      .map((log) => getRequestTps(log))
      .filter((value): value is number => value != null && value > 0);
    const slowCount = filteredLogs.filter(
      (log) => log.duration_ms != null && log.duration_ms > SLOW_DURATION_THRESHOLD_MS
    ).length;

    return {
      p50TtftMs: getPercentile(ttftValues, 50),
      p90TtftMs: getPercentile(ttftValues, 90),
      p50Tps: getPercentile(tpsValues, 50),
      slowRatio: filteredLogs.length > 0 ? (slowCount / filteredLogs.length) * 100 : 0,
      streamRatio: filteredLogs.length > 0 ? (streamLogs.length / filteredLogs.length) * 100 : 0,
    };
  }, [filteredLogs]);

  const getStatusBadgeVariant = (statusCode: number | null) => {
    if (statusCode === null) return "neutral";
    if (statusCode >= 200 && statusCode < 300) return "success";
    if (statusCode >= 400 && statusCode < 500) return "warning";
    if (statusCode >= 500) return "error";
    return "neutral";
  };

  const formatDuration = (durationMs: number | null) => {
    if (durationMs === null) {
      return <span className="text-muted-foreground">-</span>;
    }

    if (durationMs < 1000) {
      return `${durationMs}ms`;
    }

    return `${(durationMs / 1000).toFixed(2)}s`;
  };

  const formatTtft = (ttftMs: number) => {
    if (ttftMs >= 1000) {
      return `${(ttftMs / 1000).toFixed(3)}s`;
    }
    return `${Math.round(ttftMs)}ms`;
  };

  const formatSummaryTtft = (ttftMs: number | null) => {
    if (ttftMs == null) return "-";
    if (ttftMs >= 1000) return `${(ttftMs / 1000).toFixed(2)}s`;
    return `${Math.round(ttftMs)}ms`;
  };

  const formatSummaryTps = (tps: number | null) => {
    if (tps == null) return "-";
    return `${tps.toFixed(1)} tok/s`;
  };

  const formatPercent = (value: number) => `${Math.round(value)}%`;

  // Check if row has error state
  const hasErrorState = (log: RequestLog): boolean => {
    return log.status_code !== null && log.status_code >= 400;
  };

  const renderExpandedDetails = (options: {
    log: RequestLog;
    upstreamDisplayName: string | null;
    failoverDurationMs: number | null;
    latencyBreakdown: LatencyBreakdown | null;
    requestTps: number | null;
    isError: boolean;
    className: string;
  }) => {
    const {
      log,
      upstreamDisplayName,
      failoverDurationMs,
      latencyBreakdown,
      requestTps,
      isError,
      className,
    } = options;

    return (
      <div className={cn("space-y-4 font-mono text-xs", className)}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)_minmax(300px,360px)] xl:items-start">
          <section className={cn(DETAIL_PANEL_CLASS, "min-w-0")}>
            <div className={DETAIL_PANEL_HEADER_CLASS}>{t("routingDecisionDetails")}</div>
            <div className={DETAIL_PANEL_BODY_CLASS}>
              <RoutingDecisionTimeline
                routingDecision={log.routing_decision}
                upstreamName={upstreamDisplayName}
                routingType={log.routing_type}
                groupName={log.group_name}
                failoverAttempts={log.failover_attempts}
                failoverHistory={log.failover_history}
                failoverDurationMs={failoverDurationMs}
                statusCode={log.status_code}
                sessionId={log.session_id}
                affinityHit={log.affinity_hit}
                affinityMigrated={log.affinity_migrated}
                sessionIdCompensated={log.session_id_compensated}
                showStageConnector={false}
                compact={false}
              />
            </div>
          </section>

          <section className="w-full xl:min-w-0">
            <div className={DETAIL_PANEL_CLASS}>
              <div className={DETAIL_PANEL_HEADER_CLASS}>{t("performanceStats")}</div>
              <div className={cn(DETAIL_PANEL_BODY_CLASS, "space-y-1")}>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{t("timelineTotalDuration")}:</span>
                  <span className="ml-auto tabular-nums text-foreground">
                    {formatDuration(log.duration_ms)}
                  </span>
                </div>
              </div>

              {latencyBreakdown && (
                <div className="mt-2 px-3 py-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("timelineLatencyBreakdown")}
                  </div>
                  <div className="flex items-center gap-2.5">
                    <svg
                      viewBox="0 0 40 40"
                      role="img"
                      aria-label={t("timelineLatencyBreakdown")}
                      className="h-12 w-12 shrink-0 -rotate-90"
                    >
                      <circle
                        cx="20"
                        cy="20"
                        r={latencyBreakdown.ringRadius}
                        className="fill-none stroke-divider/70"
                        strokeWidth="5"
                      />
                      {latencyBreakdown.segments.map((segment) => (
                        <circle
                          key={segment.key}
                          cx="20"
                          cy="20"
                          r={latencyBreakdown.ringRadius}
                          className={cn("fill-none", segment.textClass)}
                          stroke="currentColor"
                          strokeWidth="5"
                          strokeLinecap="butt"
                          strokeDasharray={segment.dashArray}
                          strokeDashoffset={segment.dashOffset}
                        />
                      ))}
                    </svg>
                    <div className="min-w-0 space-y-0.5">
                      {latencyBreakdown.segments.map((segment) => (
                        <div key={`${segment.key}-legend`} className="flex items-center gap-2">
                          <span
                            className={cn("h-2 w-2 shrink-0 rounded-[2px]", segment.dotClass)}
                          />
                          <span className="text-muted-foreground">
                            {segment.key === "routing" && t("timelineRoutingOverhead")}
                            {segment.key === "ttft" && t("perfTtft")}
                            {segment.key === "generation" && t("perfGen")}
                            {segment.key === "other" && t("timelineOtherLatency")}
                          </span>
                          <span className={cn("ml-auto tabular-nums", segment.textClass)}>
                            {segment.key === "ttft"
                              ? formatTtft(segment.valueMs)
                              : formatDuration(segment.valueMs)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {requestTps != null && (
                <div className="mt-2 border-t border-dashed border-divider px-3 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{t("perfTps")}:</span>
                    <span className="ml-auto tabular-nums text-foreground">{requestTps} tok/s</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="w-full xl:min-w-0">
            <div className="space-y-4">
              <div className={DETAIL_PANEL_CLASS}>
                <div className={DETAIL_PANEL_HEADER_CLASS}>{t("tokenDetails")}</div>
                <div className={DETAIL_PANEL_BODY_CLASS}>
                  <TokenDetailContent
                    promptTokens={log.prompt_tokens}
                    completionTokens={log.completion_tokens}
                    totalTokens={log.total_tokens}
                    cachedTokens={log.cached_tokens}
                    reasoningTokens={log.reasoning_tokens}
                    cacheCreationTokens={log.cache_creation_tokens}
                    cacheReadTokens={log.cache_read_tokens}
                    showHeader={false}
                  />
                </div>
              </div>

              <div className={DETAIL_PANEL_CLASS}>
                <div className={DETAIL_PANEL_HEADER_CLASS}>{t("billingDetails")}</div>
                <div className={cn(DETAIL_PANEL_BODY_CLASS, "space-y-1")}>
                  {log.billing_status === "billed" ? (
                    (() => {
                      const currency = log.currency ?? "USD";

                      const billedInputTokens = log.billed_input_tokens ?? log.prompt_tokens;
                      const completionTokens = log.completion_tokens;
                      const cacheReadTokens = log.cache_read_tokens;
                      const cacheWriteTokens = log.cache_creation_tokens;

                      const inputPricePerMillion = log.base_input_price_per_million ?? null;
                      const outputPricePerMillion = log.base_output_price_per_million ?? null;
                      const cacheReadPricePerMillion =
                        log.base_cache_read_input_price_per_million ?? inputPricePerMillion;
                      const cacheWritePricePerMillion =
                        log.base_cache_write_input_price_per_million ?? inputPricePerMillion;

                      const inputMultiplier = log.input_multiplier ?? 1;
                      const outputMultiplier = log.output_multiplier ?? 1;

                      const inputCost =
                        inputPricePerMillion == null
                          ? null
                          : (billedInputTokens / 1_000_000) *
                            inputPricePerMillion *
                            inputMultiplier;
                      const outputCost =
                        outputPricePerMillion == null
                          ? null
                          : (completionTokens / 1_000_000) *
                            outputPricePerMillion *
                            outputMultiplier;

                      const computedCacheReadCost =
                        cacheReadTokens > 0 && cacheReadPricePerMillion != null
                          ? (cacheReadTokens / 1_000_000) *
                            cacheReadPricePerMillion *
                            inputMultiplier
                          : null;
                      const computedCacheWriteCost =
                        cacheWriteTokens > 0 && cacheWritePricePerMillion != null
                          ? (cacheWriteTokens / 1_000_000) *
                            cacheWritePricePerMillion *
                            inputMultiplier
                          : null;

                      const cacheReadCost = log.cache_read_cost ?? computedCacheReadCost;
                      const cacheWriteCost = log.cache_write_cost ?? computedCacheWriteCost;

                      const formatFormulaLine = (options: {
                        tokens: number;
                        pricePerMillion: number | null;
                        multiplier: number;
                        cost: number | null;
                      }) => {
                        const { tokens, pricePerMillion, multiplier, cost } = options;
                        if (pricePerMillion == null) {
                          return "-";
                        }
                        const tokensLabel = tokenFormatter.format(tokens);
                        const priceLabel = formatMoneyValue(pricePerMillion, currency);
                        const multiplierLabel = Number.isFinite(multiplier)
                          ? multiplier.toFixed(4).replace(/\.?0+$/, "")
                          : "1";
                        const costLabel = formatMoneyValue(cost, currency);
                        return `${tokensLabel} * ${priceLabel} / 1M * ${multiplierLabel} = ${costLabel}`;
                      };

                      return (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{t("billingTotal")}:</span>
                            <span className="ml-auto tabular-nums text-foreground">
                              {formatBillingCost(log)}
                            </span>
                          </div>

                          <div className="mt-2 space-y-1">
                            <div className="flex items-start gap-2">
                              <span className="text-muted-foreground">{t("tokenInput")}:</span>
                              <span className="ml-auto text-right tabular-nums text-foreground break-all">
                                {formatFormulaLine({
                                  tokens: billedInputTokens,
                                  pricePerMillion: inputPricePerMillion,
                                  multiplier: inputMultiplier,
                                  cost: inputCost,
                                })}
                              </span>
                            </div>

                            <div className="flex items-start gap-2">
                              <span className="text-muted-foreground">{t("tokenOutput")}:</span>
                              <span className="ml-auto text-right tabular-nums text-foreground break-all">
                                {formatFormulaLine({
                                  tokens: completionTokens,
                                  pricePerMillion: outputPricePerMillion,
                                  multiplier: outputMultiplier,
                                  cost: outputCost,
                                })}
                              </span>
                            </div>

                            {cacheReadTokens > 0 && (
                              <div className="flex items-start gap-2">
                                <span className="text-muted-foreground">
                                  {t("tokenCacheRead")}:
                                </span>
                                <span className="ml-auto text-right tabular-nums text-foreground break-all">
                                  {formatFormulaLine({
                                    tokens: cacheReadTokens,
                                    pricePerMillion: cacheReadPricePerMillion,
                                    multiplier: inputMultiplier,
                                    cost: cacheReadCost,
                                  })}
                                </span>
                              </div>
                            )}

                            {cacheWriteTokens > 0 && (
                              <div className="flex items-start gap-2">
                                <span className="text-muted-foreground">
                                  {t("tokenCacheWrite")}:
                                </span>
                                <span className="ml-auto text-right tabular-nums text-foreground break-all">
                                  {formatFormulaLine({
                                    tokens: cacheWriteTokens,
                                    pricePerMillion: cacheWritePricePerMillion,
                                    multiplier: inputMultiplier,
                                    cost: cacheWriteCost,
                                  })}
                                </span>
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()
                  ) : log.billing_status === "unbilled" ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{t("billingStatusLabel")}:</span>
                        <span className="ml-auto tabular-nums text-status-warning">
                          {t("billingStatusUnbilled")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{t("unbillableReason")}:</span>
                        <span className="ml-auto text-status-warning">
                          {resolveBillingReasonLabel(log.unbillable_reason)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">{t("billingStatusPending")}</div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        {log.header_diff && (
          <section className={DETAIL_PANEL_CLASS}>
            <div className={DETAIL_PANEL_HEADER_CLASS}>{t("headerDiffTitle")}</div>
            <div className={DETAIL_PANEL_BODY_CLASS}>
              <HeaderDiffPanel headerDiff={log.header_diff} />
            </div>
          </section>
        )}

        {isError && (
          <div className="text-status-error">
            <span className="text-surface-500">├─</span> ERROR_TYPE: HTTP_
            {log.status_code}
            <br />
            <span className="text-surface-500">└─</span> STATUS:{" "}
            {log.status_code && log.status_code >= 500 ? "SERVER_ERROR" : "CLIENT_ERROR"}
          </div>
        )}
      </div>
    );
  };

  const getLogDerived = (log: RequestLog) => {
    const isExpanded = expandedRows.has(log.id);
    const hasFailover = log.failover_attempts > 0;
    const hasRoutingDecision = !!log.routing_decision;
    // Token details moved from tooltip into the expanded row, so allow expansion
    // whenever there is something meaningful to show.
    // - In-progress requests: tokens may be 0 but routing_decision can exist
    // - Normal requests: routing_decision may be null but token stats usually exist
    const canExpand = hasFailover || hasRoutingDecision || log.total_tokens > 0;
    const isNew = newLogIds.has(log.id);
    const isError = hasErrorState(log);
    const upstreamDisplayName =
      log.upstream_id === null ? null : (log.upstream_name ?? t("upstreamUnknown"));
    const firstFailoverAttemptAt =
      log.failover_history && log.failover_history.length > 0
        ? log.failover_history[0]?.attempted_at
        : null;
    const requestStartMs = new Date(log.created_at).getTime();
    const requestEndMs =
      log.duration_ms !== null && !Number.isNaN(requestStartMs)
        ? requestStartMs + log.duration_ms
        : NaN;
    const firstFailoverMs = firstFailoverAttemptAt
      ? new Date(firstFailoverAttemptAt).getTime()
      : NaN;

    let failoverDurationMs: number | null = null;
    if (hasFailover) {
      if (!Number.isNaN(firstFailoverMs) && !Number.isNaN(requestEndMs)) {
        failoverDurationMs = Math.max(0, requestEndMs - firstFailoverMs);
      } else if (!Number.isNaN(firstFailoverMs) && !Number.isNaN(requestStartMs)) {
        failoverDurationMs = Math.max(0, requestStartMs - firstFailoverMs);
      } else if (log.duration_ms !== null) {
        failoverDurationMs = log.duration_ms;
      }
    }

    const generationMs = getGenerationMs(log);
    const requestTps = getRequestTps(log);
    const latencyBreakdown = buildLatencyBreakdown(
      log.duration_ms,
      log.routing_duration_ms,
      log.ttft_ms,
      generationMs
    );

    return {
      isExpanded,
      canExpand,
      isNew,
      isError,
      upstreamDisplayName,
      failoverDurationMs,
      requestTps,
      latencyBreakdown,
    };
  };

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-cf-md border border-divider bg-surface-300/80">
          <ScrollText className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <h3 className="type-title-medium mb-2 text-foreground">{t("noLogs")}</h3>
        <p className="type-body-medium text-muted-foreground">{t("noLogsDesc")}</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-cf-md border border-divider bg-surface-200/70">
      {/* Filter Controls */}
      <div className="border-b border-divider bg-surface-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="type-caption text-muted-foreground">{t("filters")}</span>
          </div>

          <div className="w-full sm:w-[180px]">
            <Select value={statusCodeFilter} onValueChange={setStatusCodeFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t("filterStatus")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("filterStatusAll")}</SelectItem>
                <SelectItem value="2xx">{t("filterStatus2xx")}</SelectItem>
                <SelectItem value="4xx">{t("filterStatus4xx")}</SelectItem>
                <SelectItem value="5xx">{t("filterStatus5xx")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-[220px]">
            <Input
              type="text"
              placeholder={t("filterModel")}
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
            />
          </div>

          <div className="w-full sm:ml-auto sm:w-auto">
            <TimeRangeSelector value={timeRangeFilter} onChange={setTimeRangeFilter} />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="type-caption text-muted-foreground">{t("quickFilters")}</span>
          {(
            [
              ["all", t("presetAll")],
              ["high_ttft", t("presetHighTtft")],
              ["low_tps", t("presetLowTps")],
              ["slow_duration", t("presetSlowDuration")],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setPerformancePreset(value)}
              className={cn(
                "rounded-cf-sm border px-2 py-1 font-mono text-xs transition-colors",
                performancePreset === value
                  ? "border-amber-500/45 bg-amber-500/10 text-amber-500"
                  : "border-divider bg-surface-300 text-muted-foreground hover:bg-surface-300/70"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-b border-divider bg-surface-200/70 px-4 py-3">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <div className="rounded-cf-sm border border-divider bg-surface-300/80 px-3 py-2">
            <p className="type-caption text-muted-foreground">{t("summaryP50Ttft")}</p>
            <p className="font-mono text-sm text-foreground">
              {formatSummaryTtft(performanceSummary.p50TtftMs)}
            </p>
          </div>
          <div className="rounded-cf-sm border border-divider bg-surface-300/80 px-3 py-2">
            <p className="type-caption text-muted-foreground">{t("summaryP90Ttft")}</p>
            <p className="font-mono text-sm text-foreground">
              {formatSummaryTtft(performanceSummary.p90TtftMs)}
            </p>
          </div>
          <div className="rounded-cf-sm border border-divider bg-surface-300/80 px-3 py-2">
            <p className="type-caption text-muted-foreground">{t("summaryP50Tps")}</p>
            <p className="font-mono text-sm text-foreground">
              {formatSummaryTps(performanceSummary.p50Tps)}
            </p>
          </div>
          <div className="rounded-cf-sm border border-divider bg-surface-300/80 px-3 py-2">
            <p className="type-caption text-muted-foreground">{t("summarySlowRatio")}</p>
            <p className="font-mono text-sm text-foreground">
              {formatPercent(performanceSummary.slowRatio)}
            </p>
          </div>
          <div className="rounded-cf-sm border border-divider bg-surface-300/80 px-3 py-2">
            <p className="type-caption text-muted-foreground">{t("summaryStreamRatio")}</p>
            <p className="font-mono text-sm text-foreground">
              {formatPercent(performanceSummary.streamRatio)}
            </p>
          </div>
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-cf-md border border-divider bg-surface-300/80">
            <Filter className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
          </div>
          <h3 className="type-title-medium mb-2 text-foreground">{t("noMatchingLogs")}</h3>
          <p className="type-body-medium text-muted-foreground">{t("noMatchingLogsDesc")}</p>
        </div>
      ) : (
        <>
          {isMobileLayout ? (
            <div className="space-y-3 p-3">
              {filteredLogs.map((log) => {
                const {
                  isExpanded,
                  canExpand,
                  isNew,
                  isError,
                  upstreamDisplayName,
                  failoverDurationMs,
                  requestTps,
                  latencyBreakdown,
                } = getLogDerived(log);

                return (
                  <div
                    key={log.id}
                    className={cn(
                      "rounded-cf-md border border-divider bg-surface-200/70 p-3",
                      isError && "border-l-2 border-l-status-error/45",
                      isNew && "bg-status-info-muted/25"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                          <span className="font-mono text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(log.created_at), {
                              addSuffix: true,
                              locale: dateLocale,
                            })}
                          </span>
                          {upstreamDisplayName && (
                            <span className="min-w-0 text-muted-foreground break-all">
                              • {upstreamDisplayName}
                            </span>
                          )}
                          {log.model && (
                            <span className="min-w-0 text-muted-foreground break-all">
                              • {log.model}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                          <code className="shrink-0 rounded-cf-sm border border-divider bg-surface-300 px-1.5 py-0.5 font-mono text-xs text-foreground">
                            {log.method || "-"}
                          </code>
                          <span className="min-w-0 font-mono text-xs text-foreground break-all">
                            {log.path || "-"}
                          </span>
                        </div>

                        {log.total_tokens > 0 && (
                          <div className="pt-1">
                            <TokenDisplay
                              promptTokens={log.prompt_tokens}
                              completionTokens={log.completion_tokens}
                              totalTokens={log.total_tokens}
                              cachedTokens={log.cached_tokens}
                              reasoningTokens={log.reasoning_tokens}
                              cacheCreationTokens={log.cache_creation_tokens}
                              cacheReadTokens={log.cache_read_tokens}
                            />
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 text-right font-mono text-xs leading-tight">
                        <Badge
                          variant={getStatusBadgeVariant(log.status_code)}
                          className={cn(
                            "px-2 py-0.5 text-[11px] leading-none font-mono tabular-nums",
                            log.status_code === null && "text-muted-foreground"
                          )}
                        >
                          {log.status_code ?? "-"}
                        </Badge>
                        <div className="mt-1 tabular-nums">{formatDuration(log.duration_ms)}</div>
                        <div className="mt-1 tabular-nums text-foreground">
                          {formatBillingCost(log)}
                        </div>
                        {log.billing_status === "unbilled" && log.unbillable_reason && (
                          <div className="mt-0.5 max-w-[160px] text-[11px] text-status-warning">
                            {resolveBillingReasonLabel(log.unbillable_reason)}
                          </div>
                        )}
                        {log.billing_status == null && (
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            {t("billingStatusPending")}
                          </div>
                        )}
                        {(log.ttft_ms != null || requestTps != null) && (
                          <div className="mt-0.5 flex flex-wrap justify-end gap-x-1.5 gap-y-0 text-[11px] text-muted-foreground">
                            {log.ttft_ms != null && (
                              <span className="whitespace-nowrap">
                                {t("perfTtft")}{" "}
                                <span
                                  className={cn(
                                    "tabular-nums",
                                    getTtftPerformanceClass(log.ttft_ms)
                                  )}
                                >
                                  {formatTtft(log.ttft_ms)}
                                </span>
                              </span>
                            )}
                            {requestTps != null && (
                              <span className="whitespace-nowrap">
                                {t("perfTps")} {requestTps} tok/s
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {canExpand && (
                      <button
                        type="button"
                        onClick={() => toggleRow(log.id)}
                        className="mt-3 inline-flex w-full items-center justify-between rounded-cf-sm border border-divider bg-surface-300/70 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-surface-300"
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? t("collapseDetails") : t("expandDetails")}
                      >
                        <span>{isExpanded ? t("collapseDetails") : t("expandDetails")}</span>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    )}

                    {isExpanded &&
                      canExpand &&
                      renderExpandedDetails({
                        log,
                        upstreamDisplayName,
                        failoverDurationMs,
                        latencyBreakdown,
                        requestTps,
                        isError,
                        className: "mt-3 border-t border-dashed border-divider pt-3",
                      })}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-hidden">
              <Table frame="none" className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>{t("tableTime")}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t("tableUpstream")}</TableHead>
                    <TableHead>{t("tableMethod")}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t("tablePath")}</TableHead>
                    <TableHead className="hidden xl:table-cell">{t("tableModel")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("tableTokens")}</TableHead>
                    <TableHead className="w-[130px] px-3">{t("tableCost")}</TableHead>
                    <TableHead className="w-[84px] px-3">{t("tableStatus")}</TableHead>
                    <TableHead className="w-[180px] px-3">{t("tableDuration")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => {
                    const {
                      isExpanded,
                      canExpand,
                      isNew,
                      isError,
                      upstreamDisplayName,
                      failoverDurationMs,
                      requestTps,
                      latencyBreakdown,
                    } = getLogDerived(log);

                    return (
                      <Fragment key={log.id}>
                        <TableRow
                          className={cn(
                            // Error row accent (subtle left border, no glow)
                            isError && "border-l-2 border-l-status-error/45",
                            // New row subtle highlight
                            isNew && "bg-status-info-muted/25",
                            canExpand &&
                              (isError
                                ? "cursor-pointer hover:bg-status-error-muted/15"
                                : "cursor-pointer hover:bg-surface-300/50")
                          )}
                          onClick={() => canExpand && toggleRow(log.id)}
                        >
                          <TableCell className="p-2">
                            {canExpand && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleRow(log.id);
                                }}
                                className="rounded-cf-sm p-1 transition-colors hover:bg-surface-300"
                                aria-label={isExpanded ? t("collapseDetails") : t("expandDetails")}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                )}
                              </button>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs whitespace-nowrap">
                            {formatDistanceToNow(new Date(log.created_at), {
                              addSuffix: true,
                              locale: dateLocale,
                            })}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <RoutingDecisionTimeline
                              routingDecision={log.routing_decision}
                              upstreamName={upstreamDisplayName}
                              routingType={log.routing_type}
                              groupName={log.group_name}
                              failoverAttempts={log.failover_attempts}
                              sessionId={log.session_id}
                              affinityHit={log.affinity_hit}
                              affinityMigrated={log.affinity_migrated}
                              compact={true}
                            />
                          </TableCell>
                          <TableCell>
                            <code className="rounded-cf-sm border border-divider bg-surface-300 px-1.5 py-0.5 font-mono text-xs text-foreground">
                              {log.method || "-"}
                            </code>
                          </TableCell>
                          <TableCell className="hidden max-w-[200px] truncate font-mono text-xs lg:table-cell">
                            {log.path || <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell className="hidden font-mono text-xs xl:table-cell">
                            {log.model || <span className="text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <TokenDisplay
                              promptTokens={log.prompt_tokens}
                              completionTokens={log.completion_tokens}
                              totalTokens={log.total_tokens}
                              cachedTokens={log.cached_tokens}
                              reasoningTokens={log.reasoning_tokens}
                              cacheCreationTokens={log.cache_creation_tokens}
                              cacheReadTokens={log.cache_read_tokens}
                            />
                          </TableCell>
                          <TableCell className="px-3">
                            <div className="flex flex-col gap-0">
                              <span className="font-mono text-xs tabular-nums">
                                {formatBillingCost(log)}
                              </span>
                              {log.billing_status === "unbilled" && (
                                <p className="mt-1 text-[11px] text-status-warning">
                                  {log.unbillable_reason
                                    ? resolveBillingReasonLabel(log.unbillable_reason)
                                    : t("billingStatusUnbilled")}
                                </p>
                              )}
                              {log.billing_status == null && (
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  {t("billingStatusPending")}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="px-3">
                            <Badge
                              variant={getStatusBadgeVariant(log.status_code)}
                              className={cn(
                                "px-2 py-0.5 text-[11px] leading-none font-mono tabular-nums",
                                log.status_code === null && "text-muted-foreground"
                              )}
                            >
                              {log.status_code ?? "-"}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-3 font-mono text-xs leading-tight">
                            <div className="flex flex-col gap-0">
                              <span className="tabular-nums">
                                {formatDuration(log.duration_ms)}
                              </span>
                              {(log.ttft_ms != null || requestTps != null) && (
                                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0 text-[11px] text-muted-foreground">
                                  {log.ttft_ms != null && (
                                    <span className="whitespace-nowrap">
                                      {t("perfTtft")}{" "}
                                      <span
                                        className={cn(
                                          "tabular-nums",
                                          getTtftPerformanceClass(log.ttft_ms)
                                        )}
                                      >
                                        {formatTtft(log.ttft_ms)}
                                      </span>
                                    </span>
                                  )}
                                  {requestTps != null && (
                                    <span className="whitespace-nowrap">
                                      {t("perfTps")} {requestTps} tok/s
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>

                        {isExpanded && canExpand && (
                          <TableRow className="bg-surface-300/30">
                            <TableCell colSpan={10} className="p-0">
                              {renderExpandedDetails({
                                log,
                                upstreamDisplayName,
                                failoverDurationMs,
                                latencyBreakdown,
                                requestTps,
                                isError,
                                className: "px-4 py-3 border-t border-dashed border-divider",
                              })}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
