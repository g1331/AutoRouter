"use client";

import { useState, useMemo, useEffect, useRef, Fragment, type ReactNode } from "react";
import { formatDistanceToNow, subDays, startOfDay } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { ScrollText, Filter, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import type { FailoverErrorType, RequestLog, RoutingSelectionReason, TimeRange } from "@/types/api";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ROUTE_CAPABILITY_ICON_META } from "@/components/admin/route-capability-badges";
import {
  TokenDisplay,
  TokenDetailContent,
  getDisplayTokenMetrics,
} from "@/components/admin/token-display";
import { RoutingDecisionTimeline } from "@/components/admin/routing-decision-timeline";
import { LifecycleTrack } from "@/components/admin/lifecycle-track";
import { HeaderDiffPanel } from "@/components/logs/header-diff-panel";
import { matchRouteCapability } from "@/lib/services/route-capability-matcher";
import { ROUTE_CAPABILITY_DEFINITIONS } from "@/lib/route-capabilities";

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

const DETAIL_PANEL_CLASS =
  "rounded-cf-sm border border-divider bg-surface-300/55 shadow-[var(--vr-shadow-xs)]";
const DETAIL_PANEL_HEADER_CLASS =
  "border-b border-divider/80 bg-surface-200/70 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground";
const DETAIL_PANEL_BODY_CLASS = "px-3 py-2.5";

function TruncatedTextTooltip({ text }: { text: string }) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span className="block min-w-0 truncate">{text}</span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        className={cn(
          "p-2.5",
          "border-divider bg-surface-200 text-foreground",
          "shadow-[var(--vr-shadow-md)]",
          "max-w-[80vw] sm:max-w-[640px]"
        )}
      >
        <div className="font-mono text-[11px] leading-snug whitespace-pre-wrap break-words">
          {text}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function RequestModeBadge({ isStream, compact = false }: { isStream: boolean; compact?: boolean }) {
  const t = useTranslations("logs");
  const label = isStream ? t("requestModeStreaming") : t("requestModeNonStreaming");
  const shortLabel = isStream ? t("requestModeStreamingShort") : t("requestModeNonStreamingShort");

  return (
    <Badge
      variant={isStream ? "info" : "neutral"}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-cf-sm px-1.5 py-0 text-[9px] leading-4",
        compact && "px-1 py-0 text-[8px] leading-4"
      )}
      aria-label={label}
      title={label}
    >
      <span>{compact ? shortLabel : label}</span>
    </Badge>
  );
}

function InterfaceTypeCell({
  method,
  path,
  matchedCapability,
  className,
  variant = "desktop",
}: {
  method: string | null;
  path: string | null;
  matchedCapability?: string | null;
  className?: string;
  variant?: "desktop" | "mobile";
}) {
  const tUpstreams = useTranslations("upstreams");

  if (!path) {
    return <span className="text-muted-foreground">-</span>;
  }

  const capability = matchedCapability ?? (method ? matchRouteCapability(method, path) : null);
  if (!capability) {
    return <TruncatedTextTooltip text={path} />;
  }

  const definition = ROUTE_CAPABILITY_DEFINITIONS.find((item) => item.value === capability);
  if (!definition) {
    return <TruncatedTextTooltip text={path} />;
  }

  const iconMeta =
    ROUTE_CAPABILITY_ICON_META[definition.iconKey] ?? ROUTE_CAPABILITY_ICON_META.circle_help;
  const label = tUpstreams(definition.labelKey);
  const requestLabel = method ? `${method} ${path}` : path;
  const isMobile = variant === "mobile";

  const trigger = (
    <div
      className={cn(
        isMobile ? "flex min-w-0 items-center gap-1.5" : "inline-flex items-center justify-center",
        !isMobile && "cursor-help",
        className
      )}
      aria-label={`${label}: ${requestLabel}`}
      title={!isMobile ? label : undefined}
    >
      <span
        className={cn(
          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-cf-sm border",
          iconMeta.iconContainerClass
        )}
      >
        {iconMeta.render(cn("h-3.5 w-3.5", iconMeta.iconColorClass))}
      </span>
      {isMobile && <span className="min-w-0 truncate text-foreground">{label}</span>}
    </div>
  );

  if (isMobile) {
    return trigger;
  }

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        className={cn(
          "p-2.5",
          "border-divider bg-surface-200 text-foreground",
          "shadow-[var(--vr-shadow-md)]",
          "max-w-[80vw] sm:max-w-[640px]"
        )}
      >
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="font-mono text-[11px] leading-snug whitespace-pre-wrap break-words">
            {requestLabel}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
function getTtftPerformanceClass(ttftMs: number): string {
  if (ttftMs >= 1000) return "text-status-error";
  if (ttftMs >= 500) return "text-status-warning";
  return "text-status-success";
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

  const shouldShowBillingCost = (log: RequestLog): boolean => {
    return !(log.billing_status === "unbilled" && log.unbillable_reason && log.final_cost == null);
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
  const [focusedJourneySteps, setFocusedJourneySteps] = useState<Record<string, number>>({});
  const [journeyViewMode, setJourneyViewMode] = useState<"focused" | "sequential">("focused");

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

  const getLifecycleStageInfo = (log: RequestLog) => {
    const status = log.lifecycle_status;

    switch (status) {
      case "decision":
        return {
          icon: true,
          color: "text-blue-500",
          bgColor: "bg-blue-500/10",
          borderColor: "border-blue-500/20",
        };
      case "requesting":
        return {
          icon: true,
          color: "text-purple-500",
          bgColor: "bg-purple-500/10",
          borderColor: "border-purple-500/20",
        };
      case "completed_success":
      case "completed_failed":
        return null;
      default:
        return null;
    }
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
    requestTps: number | null;
    isError: boolean;
    className: string;
  }) => {
    const { log, upstreamDisplayName, failoverDurationMs, requestTps, isError, className } =
      options;

    const totalMs = log.stage_timings_ms?.total_ms ?? log.duration_ms ?? null;
    const routingMs = log.stage_timings_ms?.decision_ms ?? log.routing_duration_ms ?? null;
    const upstreamResponseMs = log.stage_timings_ms?.upstream_response_ms ?? null;
    const ttftMs = log.stage_timings_ms?.first_token_ms ?? log.ttft_ms ?? null;
    const genMs = log.stage_timings_ms?.generation_ms ?? getGenerationMs(log);

    const routingDecision = log.routing_decision;
    const groupName = log.group_name;
    const hasSession = Boolean(log.session_id || log.session_id_compensated);
    const hasFailoverHistory =
      log.failover_attempts > 0 && !!log.failover_history && log.failover_history.length > 0;
    const hasFailoverWithoutHistory = log.failover_attempts > 0 && !hasFailoverHistory;
    const hasLifecycleFusion = Boolean(
      totalMs != null ||
      routingDecision ||
      hasSession ||
      log.failover_attempts > 0 ||
      log.status_code != null ||
      requestTps != null ||
      upstreamDisplayName ||
      log.routing_type
    );

    const routingTypeLabel = (() => {
      const labels: Record<string, string> = {
        auto: t("routingAuto"),
        direct: t("routingDirect"),
        provider_type: t("routingProviderType"),
        tiered: t("routingTiered"),
        group: t("routingGroup"),
        default: t("routingDefault"),
        path_capability: t("routingPathCapability"),
        none: t("routingNone"),
      };
      const key = routingDecision?.routing_type ?? log.routing_type;
      return key ? (labels[key] ?? key) : null;
    })();

    const modelDisplay = routingDecision
      ? routingDecision.model_redirect_applied
        ? routingDecision.original_model + " → " + routingDecision.resolved_model
        : routingDecision.resolved_model || routingDecision.original_model
      : null;

    const didSendUpstream = routingDecision?.did_send_upstream;
    const finalUpstreamLabel =
      didSendUpstream === false ? t("timelineNoUpstreamSent") : (upstreamDisplayName ?? "-");

    const selectedCandidateId =
      didSendUpstream === false
        ? null
        : (routingDecision?.candidate_upstream_id ?? routingDecision?.selected_upstream_id ?? null);

    const failureStageLabel = routingDecision?.failure_stage
      ? t("failureStage." + routingDecision.failure_stage)
      : null;

    const formatMetricText = (value: number) =>
      value < 1000 ? Math.round(value) + "ms" : (value / 1000).toFixed(2) + "s";

    const statusVariant: "neutral" | "info" | "success" | "warning" | "error" =
      log.status_code == null
        ? "neutral"
        : log.status_code >= 200 && log.status_code < 300
          ? "success"
          : log.status_code >= 500
            ? "error"
            : "warning";

    const renderMetricPill = (
      label: string,
      value: string,
      variant: "neutral" | "info" | "success" | "warning" | "error" = "neutral"
    ) => (
      <Badge variant={variant} className="px-1.5 py-0 text-[10px] leading-4">
        <span className="font-mono">
          {label}
          {value ? " " + value : ""}
        </span>
      </Badge>
    );

    const requestModeLabel = t(log.is_stream ? "requestModeStreaming" : "requestModeNonStreaming");
    const cumulativeFirstOutputMs =
      routingMs != null && ttftMs != null ? routingMs + ttftMs : ttftMs;
    const finalSelectionReason = routingDecision?.final_selection_reason ?? null;
    const firstFailoverAttempt = hasFailoverHistory ? log.failover_history![0] : null;
    const decisionSelectionReason =
      firstFailoverAttempt?.selection_reason ?? (hasFailoverHistory ? null : finalSelectionReason);
    const decisionUpstreamLabel =
      firstFailoverAttempt?.upstream_name ??
      firstFailoverAttempt?.upstream_id ??
      finalUpstreamLabel;
    const decisionSelectedCandidateId =
      firstFailoverAttempt?.selection_reason?.selected_upstream_id ??
      firstFailoverAttempt?.upstream_id ??
      selectedCandidateId;

    const formatStageDurationText = (cumulativeMs: number | null, deltaMs: number | null) => {
      if (cumulativeMs != null && deltaMs != null) {
        return formatMetricText(cumulativeMs) + " (+" + formatMetricText(deltaMs) + ")";
      }
      if (cumulativeMs != null) {
        return formatMetricText(cumulativeMs);
      }
      if (deltaMs != null) {
        return formatMetricText(deltaMs);
      }
      return null;
    };

    const formatRetryErrorType = (errorType: FailoverErrorType | null | undefined) => {
      if (!errorType) {
        return t("retryErrorType.unknown");
      }
      return t("retryErrorType." + errorType);
    };

    const getSelectionReasonText = (reason: RoutingSelectionReason | null | undefined) => {
      if (!reason) {
        return t("journeySelectionReasonUnavailable");
      }

      switch (reason.code) {
        case "affinity_hit":
          return t("journeySelectionReasonAffinityHit");
        case "affinity_migrated":
          return t("journeySelectionReasonAffinityMigrated");
        case "half_open_probe":
          return t("journeySelectionReasonHalfOpen");
        case "single_candidate_remaining":
          return t("journeySelectionReasonSingleCandidate");
        case "weighted_selection":
        default:
          return t("journeySelectionReasonWeighted");
      }
    };

    const getRetryReasonText = (reason: RoutingSelectionReason | null | undefined) => {
      const retryReason = reason?.retry_reason;
      if (!retryReason) {
        return null;
      }

      return t("journeyRetryReasonText", {
        upstream: retryReason.previous_upstream_name ?? t("upstreamUnknown"),
        reason: formatRetryErrorType(retryReason.previous_error_type),
      });
    };

    const decisionDurationText = formatStageDurationText(routingMs, routingMs);
    const requestPhaseDurationText =
      didSendUpstream === false || log.is_stream
        ? null
        : formatStageDurationText(totalMs, upstreamResponseMs);
    const responsePhaseDurationText =
      genMs != null ? formatStageDurationText(totalMs, genMs) : null;
    const failoverDurationText =
      failoverDurationMs != null
        ? formatStageDurationText(failoverDurationMs, failoverDurationMs)
        : null;

    const renderJourneyField = (options: {
      label: string;
      value: ReactNode;
      className?: string;
      valueClassName?: string;
      title?: string;
    }) => {
      const { label, value, className: fieldClassName, valueClassName, title } = options;
      return (
        <div className={cn("flex flex-wrap items-start gap-2", fieldClassName)}>
          <span className="text-muted-foreground">{label}:</span>
          <span title={title} className={cn("min-w-0 flex-1 text-foreground", valueClassName)}>
            {value}
          </span>
        </div>
      );
    };

    type JourneyTone = "neutral" | "info" | "warning" | "success" | "error";

    const JOURNEY_TONE_STYLES: Record<
      JourneyTone,
      {
        tab: string;
        tabActive: string;
        number: string;
        accent: string;
        panel: string;
      }
    > = {
      neutral: {
        tab: "border-divider bg-surface-200/70 hover:border-foreground/10 hover:bg-surface-200",
        tabActive:
          "border-foreground/15 bg-surface-200 text-foreground shadow-[0_12px_30px_rgba(15,23,42,0.08)]",
        number: "border-divider bg-surface-300 text-muted-foreground",
        accent: "bg-[linear-gradient(90deg,rgba(148,163,184,0.65),rgba(148,163,184,0.15))]",
        panel: "border-divider bg-surface-200/75",
      },
      info: {
        tab: "border-divider bg-surface-200/70 hover:border-sky-500/20 hover:bg-sky-500/5",
        tabActive:
          "border-sky-500/25 bg-[linear-gradient(180deg,rgba(14,165,233,0.08),rgba(15,23,42,0.02))] text-foreground shadow-[0_12px_30px_rgba(2,132,199,0.12)]",
        number: "border-sky-500/20 bg-sky-500/10 text-sky-600",
        accent: "bg-[linear-gradient(90deg,rgba(14,165,233,0.85),rgba(14,165,233,0.2))]",
        panel:
          "border-sky-500/20 bg-[linear-gradient(180deg,rgba(14,165,233,0.07),rgba(15,23,42,0.02))]",
      },
      warning: {
        tab: "border-divider bg-surface-200/70 hover:border-amber-500/20 hover:bg-amber-500/5",
        tabActive:
          "border-amber-500/25 bg-[linear-gradient(180deg,rgba(245,158,11,0.08),rgba(15,23,42,0.02))] text-foreground shadow-[0_12px_30px_rgba(217,119,6,0.12)]",
        number: "border-amber-500/20 bg-amber-500/10 text-amber-600",
        accent: "bg-[linear-gradient(90deg,rgba(245,158,11,0.85),rgba(245,158,11,0.18))]",
        panel:
          "border-amber-500/20 bg-[linear-gradient(180deg,rgba(245,158,11,0.07),rgba(15,23,42,0.02))]",
      },
      success: {
        tab: "border-divider bg-surface-200/70 hover:border-emerald-500/20 hover:bg-emerald-500/5",
        tabActive:
          "border-emerald-500/25 bg-[linear-gradient(180deg,rgba(16,185,129,0.08),rgba(15,23,42,0.02))] text-foreground shadow-[0_12px_30px_rgba(5,150,105,0.12)]",
        number: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
        accent: "bg-[linear-gradient(90deg,rgba(16,185,129,0.85),rgba(16,185,129,0.18))]",
        panel:
          "border-emerald-500/20 bg-[linear-gradient(180deg,rgba(16,185,129,0.07),rgba(15,23,42,0.02))]",
      },
      error: {
        tab: "border-divider bg-surface-200/70 hover:border-status-error/20 hover:bg-status-error-muted/10",
        tabActive:
          "border-status-error/25 bg-[linear-gradient(180deg,rgba(220,38,38,0.08),rgba(15,23,42,0.02))] text-foreground shadow-[0_12px_30px_rgba(185,28,28,0.12)]",
        number: "border-status-error/20 bg-status-error-muted/20 text-status-error",
        accent: "bg-[linear-gradient(90deg,rgba(220,38,38,0.9),rgba(220,38,38,0.2))]",
        panel:
          "border-status-error/20 bg-[linear-gradient(180deg,rgba(220,38,38,0.07),rgba(15,23,42,0.02))]",
      },
    };

    const requestSignature = [log.method, log.path].filter(Boolean).join(" ");
    const candidateSummary = routingDecision
      ? String(routingDecision.final_candidate_count) +
        "/" +
        String(routingDecision.candidate_count) +
        " " +
        t("tooltipCandidates").toLowerCase()
      : null;
    const requestArrivedSummary = (modelDisplay ?? log.model ?? requestSignature) || "-";
    const requestArrivedMeta = [requestSignature || null, requestModeLabel, groupName]
      .filter(Boolean)
      .join(" · ");
    const decisionStepSummary = routingDecision
      ? getSelectionReasonText(decisionSelectionReason)
      : t("noRoutingDecision");
    const decisionStepMeta = [
      decisionUpstreamLabel !== "-" ? decisionUpstreamLabel : null,
      candidateSummary,
    ]
      .filter(Boolean)
      .join(" · ");
    const requestExecutionSummary =
      didSendUpstream === false
        ? t("journeyRequestNotSent")
        : t("journeyRequestSentTo") + " " + finalUpstreamLabel;
    const requestExecutionMeta = hasFailoverHistory
      ? String(log.failover_attempts) + " " + t("retryAttemptsSummary")
      : finalSelectionReason
        ? getSelectionReasonText(finalSelectionReason)
        : didSendUpstream === false
          ? t("timelineNoUpstreamSent")
          : t("timelineDirectSuccess");
    const responseStepSummary =
      ttftMs != null
        ? t("journeyFirstOutput") +
          " " +
          (formatStageDurationText(cumulativeFirstOutputMs, ttftMs) ?? "")
        : genMs != null
          ? t("journeyGenerationFinished") + " " + (responsePhaseDurationText ?? "")
          : requestModeLabel;
    const responseStepMeta =
      requestTps != null
        ? t("perfTps") + " " + requestTps.toFixed(1) + " tok/s"
        : genMs != null
          ? t("perfGen")
          : null;
    const completeStepSummary =
      log.status_code != null
        ? totalMs != null
          ? String(log.status_code) + " · " + formatMetricText(totalMs)
          : String(log.status_code)
        : finalUpstreamLabel;
    const completeStepMeta = [failureStageLabel, totalMs != null ? formatMetricText(totalMs) : null]
      .filter(Boolean)
      .join(" · ");
    const getDefaultJourneyStepIndex = () => {
      if (didSendUpstream === false || hasFailoverHistory || hasFailoverWithoutHistory) {
        return 3;
      }
      if (log.is_stream && (ttftMs != null || genMs != null)) {
        return 4;
      }
      if (isError) {
        return 5;
      }
      return 2;
    };

    const activeJourneyStepIndex = focusedJourneySteps[log.id] ?? getDefaultJourneyStepIndex();
    const setActiveJourneyStep = (stepIndex: number) => {
      setFocusedJourneySteps((prev) =>
        prev[log.id] === stepIndex ? prev : { ...prev, [log.id]: stepIndex }
      );
    };

    const journeySteps = [
      {
        index: 1,
        title: t("journeyRequestArrived"),
        summary: requestArrivedSummary,
        meta: requestArrivedMeta,
        tone: "neutral" as JourneyTone,
        metrics: (
          <>
            {renderMetricPill(requestModeLabel, "", "neutral")}
            {routingTypeLabel ? renderMetricPill(routingTypeLabel, "", "neutral") : null}
          </>
        ),
        content: (
          <>
            <div className="font-medium text-foreground">{modelDisplay ?? log.model ?? "-"}</div>
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
              {log.method ? <span>{log.method}</span> : null}
              {log.path ? <span className="break-all">{log.path}</span> : null}
              {groupName ? <span>{groupName}</span> : null}
              {routingDecision?.model_redirect_applied ? (
                <Badge variant="info" className="px-1.5 py-0 text-[10px]">
                  {t("timelineModelResolution")}
                </Badge>
              ) : null}
            </div>
          </>
        ),
        focusedContent: null,
      },
      {
        index: 2,
        title: t("lifecycleDecision"),
        summary: decisionStepSummary,
        meta: decisionStepMeta,
        tone: routingDecision ? ("info" as JourneyTone) : ("neutral" as JourneyTone),
        metrics: (
          <>
            {routingTypeLabel ? renderMetricPill(routingTypeLabel, "", "neutral") : null}
            {routingDecision
              ? renderMetricPill(
                  t("tooltipCandidates"),
                  String(routingDecision.final_candidate_count) +
                    "/" +
                    String(routingDecision.candidate_count),
                  "neutral"
                )
              : null}
            {decisionDurationText
              ? renderMetricPill(t("tableDuration"), decisionDurationText, "info")
              : null}
          </>
        ),
        content: (
          <>
            <div className="rounded-cf-sm border border-divider bg-surface-200/60 p-2.5">
              <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("timelineModelResolution")}
              </div>
              {routingDecision ? (
                <div className="space-y-2">
                  <div className="font-medium text-foreground">{modelDisplay}</div>
                  <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                    {groupName ? <span>{groupName}</span> : null}
                    <span>
                      {t("tooltipStrategy")}:{" "}
                      <span className="text-foreground">{routingDecision.selection_strategy}</span>
                    </span>
                    <span>{candidateSummary}</span>
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground">{t("noRoutingDecision")}</div>
              )}
            </div>

            <div className="rounded-cf-sm border border-divider bg-surface-200/60 p-2.5">
              <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("journeySelectionBasis")}
              </div>
              <div className="space-y-2">
                {routingDecision?.matched_route_capability ? (
                  <div className="text-muted-foreground">
                    {t("matchedRouteCapability")}:{" "}
                    <span className="text-foreground">
                      {routingDecision.matched_route_capability}
                    </span>
                    {routingDecision.route_match_source ? (
                      <span className="ml-2">
                        ({t("routeMatchSource")}:{" "}
                        {routingDecision.route_match_source === "path"
                          ? t("routeMatchSourcePath")
                          : t("routeMatchSourceModelFallback")}
                        )
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-2 rounded-cf-sm border border-divider/80 bg-surface-300/65 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("timelineSessionAffinity")}
                  </div>
                  {hasSession ? (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {log.affinity_hit && !log.affinity_migrated
                          ? renderMetricPill(t("timelineAffinityHit"), "", "success")
                          : null}
                        {log.affinity_migrated
                          ? renderMetricPill(t("timelineAffinityMigrated"), "", "warning")
                          : null}
                        {!log.affinity_hit
                          ? renderMetricPill(t("timelineAffinityMissed"), "", "neutral")
                          : null}
                        {log.session_id_compensated ? (
                          <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                            {t("compensationBadge")}
                          </Badge>
                        ) : null}
                      </div>
                      {renderJourneyField({
                        label: t("timelineSessionId"),
                        value: log.session_id ?? "-",
                        title: log.session_id ?? undefined,
                        valueClassName: "break-all",
                      })}
                    </>
                  ) : (
                    <div className="text-muted-foreground">{t("timelineNoSession")}</div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-cf-sm border border-divider bg-surface-200/60 p-2.5">
              <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("journeyDecisionResult")}
              </div>
              <div className="space-y-2">
                {renderJourneyField({
                  label: t("journeyInitialUpstream"),
                  value: (
                    <span className="font-medium text-foreground">{decisionUpstreamLabel}</span>
                  ),
                })}
                {renderJourneyField({
                  label: t("journeySelectionReason"),
                  value: getSelectionReasonText(decisionSelectionReason),
                  valueClassName: decisionSelectionReason ? undefined : "text-muted-foreground",
                })}
                {routingDecision?.candidates?.length ? (
                  <div className="space-y-1.5">
                    {routingDecision.candidates.map((candidate) => {
                      const isSelected = candidate.id === decisionSelectedCandidateId;
                      return (
                        <div
                          key={candidate.id}
                          className={cn(
                            "flex flex-wrap items-center gap-2 rounded-cf-sm border border-divider bg-surface-300/65 px-2 py-1.5",
                            isSelected && "border-emerald-500/30 bg-emerald-500/10"
                          )}
                        >
                          <span
                            className={cn(
                              "font-medium",
                              isSelected ? "text-foreground" : "text-muted-foreground"
                            )}
                          >
                            {isSelected ? "●" : "○"}
                          </span>
                          <span className="min-w-0 flex-1 text-foreground">{candidate.name}</span>
                          <Badge variant="neutral" className="px-1.5 py-0 text-[10px]">
                            {t("circuitState." + candidate.circuit_state)}
                          </Badge>
                          <span className="rounded-cf-sm border border-divider bg-surface-300 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {"w:" + String(candidate.weight)}
                          </span>
                          {isSelected ? (
                            <Badge variant="success" className="px-1.5 py-0 text-[10px]">
                              {t("timelineSelected")}
                            </Badge>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-muted-foreground">{t("noRoutingDecision")}</div>
                )}
                {routingDecision?.excluded?.length ? (
                  <div className="space-y-1.5">
                    {routingDecision.excluded.map((excluded) => (
                      <div
                        key={excluded.id}
                        className="flex flex-wrap items-center gap-2 rounded-cf-sm border border-red-500/20 bg-red-500/5 px-2 py-1.5"
                      >
                        <span className="min-w-0 flex-1 text-foreground">{excluded.name}</span>
                        <Badge variant="error" className="px-1.5 py-0 text-[10px]">
                          {t("exclusionReason." + excluded.reason)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </>
        ),
      },
      {
        index: 3,
        title: t("lifecycleRequest"),
        summary: requestExecutionSummary,
        meta: requestExecutionMeta,
        tone:
          hasFailoverHistory || hasFailoverWithoutHistory
            ? ("warning" as JourneyTone)
            : didSendUpstream === false
              ? ("error" as JourneyTone)
              : ("warning" as JourneyTone),
        metrics: (
          <>
            {requestPhaseDurationText
              ? renderMetricPill(t("tableDuration"), requestPhaseDurationText, "warning")
              : null}
            {failoverDurationText
              ? renderMetricPill(t("retryTotalDuration"), failoverDurationText, "warning")
              : null}
          </>
        ),
        content: (
          <div className="space-y-2 rounded-cf-sm border border-divider bg-surface-200/60 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("timelineExecutionRetries")}
            </div>
            {renderJourneyField({
              label: t("journeyRequestAction"),
              value:
                didSendUpstream === false ? (
                  <span className="text-muted-foreground">{t("journeyRequestNotSent")}</span>
                ) : (
                  <span>
                    {t("journeyRequestSentTo")}{" "}
                    <span className="font-medium text-foreground">{finalUpstreamLabel}</span>
                  </span>
                ),
            })}
            {hasFailoverHistory ? (
              <>
                {finalSelectionReason
                  ? renderJourneyField({
                      label: t("journeySelectionReason"),
                      value: getSelectionReasonText(finalSelectionReason),
                    })
                  : null}
                {getRetryReasonText(finalSelectionReason)
                  ? renderJourneyField({
                      label: t("journeyRetryReason"),
                      value: getRetryReasonText(finalSelectionReason)!,
                      valueClassName: "text-muted-foreground",
                    })
                  : null}
                {failoverDurationText
                  ? renderJourneyField({
                      label: t("retryTotalDuration"),
                      value: failoverDurationText,
                      valueClassName: "text-muted-foreground",
                    })
                  : null}
                <div className="space-y-1.5">
                  {log.failover_history!.map((attempt, index) => (
                    <div
                      key={
                        (attempt.upstream_id ?? attempt.upstream_name ?? "attempt") + "-" + index
                      }
                      className="rounded-cf-sm border border-divider bg-surface-300/65 px-2 py-1.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">
                          {t("retryAttempt")} {index + 1}
                        </span>
                        <span className="text-muted-foreground">
                          {attempt.upstream_name || t("upstreamUnknown")}
                        </span>
                        <span className="text-muted-foreground">[{attempt.error_type}]</span>
                      </div>
                      {attempt.selection_reason
                        ? renderJourneyField({
                            label: t("journeySelectionReason"),
                            value: getSelectionReasonText(attempt.selection_reason),
                            className: "mt-1",
                          })
                        : null}
                      {getRetryReasonText(attempt.selection_reason)
                        ? renderJourneyField({
                            label: t("journeyRetryReason"),
                            value: getRetryReasonText(attempt.selection_reason)!,
                            className: "mt-1",
                            valueClassName: "text-muted-foreground",
                          })
                        : null}
                      {attempt.error_message ? (
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {attempt.error_message}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            ) : hasFailoverWithoutHistory ? (
              <div className="text-muted-foreground">
                {t("timelineFailoverNoDetails", { count: log.failover_attempts })}
              </div>
            ) : didSendUpstream === false ? (
              <div className="text-muted-foreground">{t("timelineNoUpstreamSent")}</div>
            ) : (
              <div className="text-muted-foreground">{t("timelineDirectSuccess")}</div>
            )}
          </div>
        ),
      },
      {
        index: 4,
        title: t("lifecycleResponse"),
        summary: responseStepSummary,
        meta: responseStepMeta,
        tone:
          isError && routingDecision?.failure_stage === "downstream_streaming"
            ? ("error" as JourneyTone)
            : ("success" as JourneyTone),
        metrics: (
          <>
            {responsePhaseDurationText
              ? renderMetricPill(t("tableDuration"), responsePhaseDurationText, "success")
              : null}
            {requestTps != null
              ? renderMetricPill(t("perfTps"), requestTps.toFixed(1) + " tok/s", "success")
              : null}
          </>
        ),
        content: (
          <div className="space-y-2">
            {ttftMs != null ? (
              <div className="rounded-cf-sm border border-divider bg-surface-200/60 p-2.5">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("journeyFirstOutput")}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {formatStageDurationText(cumulativeFirstOutputMs, ttftMs)
                      ? renderMetricPill(
                          t("tableDuration"),
                          formatStageDurationText(cumulativeFirstOutputMs, ttftMs)!,
                          "warning"
                        )
                      : null}
                  </div>
                </div>
                <div className="text-muted-foreground">{t("perfTtft")}</div>
              </div>
            ) : null}

            {genMs != null ? (
              <div className="rounded-cf-sm border border-divider bg-surface-200/60 p-2.5">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t("journeyGenerationFinished")}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {responsePhaseDurationText
                      ? renderMetricPill(t("tableDuration"), responsePhaseDurationText, "success")
                      : null}
                  </div>
                </div>
                {requestTps != null ? (
                  <div className="text-muted-foreground">
                    {t("perfTps")}:{" "}
                    <span className="text-foreground">{requestTps.toFixed(1) + " tok/s"}</span>
                  </div>
                ) : null}
              </div>
            ) : ttftMs == null ? (
              <div className="text-muted-foreground">{requestModeLabel}</div>
            ) : null}
          </div>
        ),
      },
      {
        index: 5,
        title: t("lifecycleComplete"),
        summary: completeStepSummary,
        meta: completeStepMeta,
        tone:
          statusVariant === "error"
            ? ("error" as JourneyTone)
            : statusVariant === "success"
              ? ("success" as JourneyTone)
              : ("neutral" as JourneyTone),
        metrics: (
          <>
            {log.status_code != null
              ? renderMetricPill(t("tableStatus"), String(log.status_code), statusVariant)
              : null}
            {totalMs != null
              ? renderMetricPill(t("tableDuration"), formatMetricText(totalMs), "info")
              : null}
          </>
        ),
        content: (
          <>
            {renderJourneyField({
              label: t("timelineFinalUpstream"),
              value: (
                <span
                  className={cn(
                    "font-medium",
                    log.status_code != null && log.status_code >= 200 && log.status_code < 300
                      ? "text-status-success"
                      : isError
                        ? "text-status-error"
                        : "text-foreground"
                  )}
                >
                  {finalUpstreamLabel}
                </span>
              ),
            })}
            {failureStageLabel
              ? renderJourneyField({
                  label: t("timelineFailureStage"),
                  value: <span className="text-status-error">{failureStageLabel}</span>,
                })
              : null}
            {requestTps != null
              ? renderJourneyField({
                  label: t("perfTps"),
                  value: requestTps.toFixed(1) + " tok/s",
                })
              : null}
          </>
        ),
      },
    ];

    const activeJourneyStep =
      journeySteps.find((step) => step.index === activeJourneyStepIndex) ?? journeySteps[0];
    const activeJourneyTone = JOURNEY_TONE_STYLES[activeJourneyStep.tone];
    const activeJourneyDetail =
      activeJourneyStep.focusedContent !== undefined
        ? activeJourneyStep.focusedContent
        : activeJourneyStep.content;
    const journeyViewOptions = [
      { value: "focused" as const, label: t("journeyViewFocused") },
      { value: "sequential" as const, label: t("journeyViewSequential") },
    ];

    return (
      <div className={cn("space-y-4 font-mono text-xs", className)}>
        {hasLifecycleFusion && (
          <section className="space-y-3">
            <div className="px-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {t("lifecycleTimeline")}
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="sm:hidden">
                  <LifecycleTrack
                    lifecycleStatus={log.lifecycle_status ?? undefined}
                    stageTimings={log.stage_timings_ms}
                    upstreamError={log.upstream_error}
                    statusCode={log.status_code}
                    isStream={log.is_stream}
                    failureStage={routingDecision?.failure_stage ?? null}
                    durationMs={totalMs}
                    compact
                  />
                </div>
                <div className="hidden sm:block">
                  <LifecycleTrack
                    lifecycleStatus={log.lifecycle_status ?? undefined}
                    stageTimings={log.stage_timings_ms}
                    upstreamError={log.upstream_error}
                    statusCode={log.status_code}
                    isStream={log.is_stream}
                    failureStage={routingDecision?.failure_stage ?? null}
                    durationMs={totalMs}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {log.status_code != null
                    ? renderMetricPill(t("tableStatus"), String(log.status_code), statusVariant)
                    : null}
                  {totalMs != null
                    ? renderMetricPill(t("tableDuration"), formatMetricText(totalMs), "info")
                    : null}
                  {renderMetricPill(requestModeLabel, "", "neutral")}
                  {finalUpstreamLabel
                    ? renderMetricPill(t("timelineFinalUpstream"), finalUpstreamLabel, "neutral")
                    : null}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {t("journeyViewLabel")}
                    </div>
                    <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground/80">
                      {journeyViewMode === "focused"
                        ? t("journeyViewFocused")
                        : t("journeyViewSequential")}
                    </div>
                  </div>
                  <div
                    className="flex flex-wrap items-center gap-1"
                    role="group"
                    aria-label={t("journeyViewLabel")}
                  >
                    {journeyViewOptions.map((option) => {
                      const isActive = journeyViewMode === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setJourneyViewMode(option.value)}
                          aria-pressed={isActive}
                          aria-label={option.label}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] transition-all duration-200 ease-out",
                            isActive
                              ? "bg-foreground text-background shadow-[0_10px_24px_rgba(15,23,42,0.16)]"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {journeyViewMode === "focused" ? (
                  <>
                    <div className="relative">
                      <div className="pointer-events-none absolute left-7 right-7 top-7 hidden h-px bg-[linear-gradient(90deg,transparent,rgba(148,163,184,0.4),transparent)] xl:block" />
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                        {journeySteps.map((step) => {
                          const tone = JOURNEY_TONE_STYLES[step.tone];
                          const isActive = step.index === activeJourneyStep.index;
                          return (
                            <button
                              key={step.index}
                              type="button"
                              onClick={() => setActiveJourneyStep(step.index)}
                              aria-pressed={isActive}
                              aria-label={step.title}
                              className={cn(
                                "group relative overflow-hidden rounded-[20px] border px-3 py-3 text-left transition-all duration-200 ease-out",
                                "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)]",
                                "hover:-translate-y-0.5 active:translate-y-0",
                                tone.tab,
                                isActive && cn("-translate-y-0.5", tone.tabActive)
                              )}
                            >
                              <div
                                className={cn(
                                  "absolute inset-x-3 top-0 h-0.5 rounded-full opacity-0 transition-opacity duration-200",
                                  tone.accent,
                                  isActive && "opacity-100"
                                )}
                              />
                              <div className="flex items-start gap-3">
                                <span
                                  className={cn(
                                    "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors duration-200",
                                    tone.number
                                  )}
                                >
                                  {step.index}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                    {step.title}
                                  </div>
                                  <div className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-foreground">
                                    {step.summary}
                                  </div>
                                  {step.meta ? (
                                    <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground/80">
                                      {step.meta}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div
                      className={cn(
                        "relative overflow-hidden rounded-[22px] border p-3 shadow-[0_12px_32px_rgba(15,23,42,0.06)] transition-all duration-200 ease-out",
                        activeJourneyTone.panel
                      )}
                    >
                      <div
                        className={cn("absolute inset-x-0 top-0 h-0.5", activeJourneyTone.accent)}
                      />
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                                activeJourneyTone.number
                              )}
                            >
                              {activeJourneyStep.index}
                            </span>
                            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                              {activeJourneyStep.title}
                            </div>
                          </div>
                          <div className="mt-2 text-[11px] leading-relaxed text-foreground">
                            {activeJourneyStep.summary}
                          </div>
                          {activeJourneyStep.meta ? (
                            <div className="mt-1 text-[10px] leading-relaxed text-muted-foreground/80">
                              {activeJourneyStep.meta}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap justify-end gap-1">
                          {activeJourneyStep.metrics}
                        </div>
                      </div>
                      {activeJourneyDetail ? (
                        <div className="space-y-2 text-[11px]">{activeJourneyDetail}</div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    {journeySteps.map((step) => {
                      const tone = JOURNEY_TONE_STYLES[step.tone];
                      return (
                        <section
                          key={step.index}
                          aria-label={step.title}
                          className={cn(
                            "relative overflow-hidden rounded-[22px] border p-3 shadow-[0_12px_30px_rgba(15,23,42,0.06)] transition-all duration-200 ease-out sm:p-3.5",
                            tone.panel
                          )}
                        >
                          <div className={cn("absolute inset-x-0 top-0 h-0.5", tone.accent)} />
                          <div className="flex items-start gap-3">
                            <div className="relative z-10 pt-0.5">
                              <span
                                className={cn(
                                  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                                  tone.number
                                )}
                              >
                                {step.index}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1 space-y-3">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                    {step.title}
                                  </div>
                                  <div className="mt-1 text-[11px] leading-relaxed text-foreground">
                                    {step.summary}
                                  </div>
                                  {step.meta ? (
                                    <div className="mt-1 text-[10px] leading-relaxed text-muted-foreground/80">
                                      {step.meta}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="flex flex-wrap justify-end gap-1">
                                  {step.metrics}
                                </div>
                              </div>
                              <div className="space-y-2 text-[11px]">{step.content}</div>
                            </div>
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Token & Billing Details (2-column grid) */}
        <div className="grid gap-4 xl:grid-cols-2">
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
                cacheCreation5mTokens={log.cache_creation_5m_tokens}
                cacheCreation1hTokens={log.cache_creation_1h_tokens}
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
                      : (billedInputTokens / 1_000_000) * inputPricePerMillion * inputMultiplier;
                  const outputCost =
                    outputPricePerMillion == null
                      ? null
                      : (completionTokens / 1_000_000) * outputPricePerMillion * outputMultiplier;

                  const computedCacheReadCost =
                    cacheReadTokens > 0 && cacheReadPricePerMillion != null
                      ? (cacheReadTokens / 1_000_000) * cacheReadPricePerMillion * inputMultiplier
                      : null;
                  const computedCacheWriteCost =
                    cacheWriteTokens > 0 && cacheWritePricePerMillion != null
                      ? (cacheWriteTokens / 1_000_000) * cacheWritePricePerMillion * inputMultiplier
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
                            <span className="text-muted-foreground">{t("tokenCacheRead")}:</span>
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
                            <span className="text-muted-foreground">{t("tokenCacheWrite")}:</span>
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

        {/* Header Diff Panel */}
        {log.header_diff && (
          <section className={DETAIL_PANEL_CLASS}>
            <div className={DETAIL_PANEL_HEADER_CLASS}>{t("headerDiffTitle")}</div>
            <div className={DETAIL_PANEL_BODY_CLASS}>
              <HeaderDiffPanel headerDiff={log.header_diff} />
            </div>
          </section>
        )}

        {/* Error Display */}
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
    const hasSessionDiagnostics = !!log.session_id || !!log.session_id_compensated;
    const hasHeaderDiff = !!log.header_diff;
    const { displayTotalTokens } = getDisplayTokenMetrics({
      promptTokens: log.prompt_tokens,
      completionTokens: log.completion_tokens,
      totalTokens: log.total_tokens,
      cachedTokens: log.cached_tokens,
      cacheCreationTokens: log.cache_creation_tokens,
      cacheReadTokens: log.cache_read_tokens,
    });
    // Token details moved from tooltip into the expanded row, so allow expansion
    // whenever there is something meaningful to show.
    // - In-progress requests: tokens may be 0 but routing_decision can exist
    // - Normal requests: routing_decision may be null but token stats usually exist
    const canExpand =
      hasFailover ||
      hasRoutingDecision ||
      hasSessionDiagnostics ||
      hasHeaderDiff ||
      displayTotalTokens > 0;
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

    const requestTps = getRequestTps(log);

    return {
      isExpanded,
      canExpand,
      isNew,
      isError,
      upstreamDisplayName,
      failoverDurationMs,
      requestTps,
      displayTotalTokens,
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
              id="logs-model-filter"
              name="logs-model-filter"
              aria-label={t("filterModel")}
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
                  displayTotalTokens,
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
                          <RequestModeBadge isStream={log.is_stream} />
                          <InterfaceTypeCell
                            method={log.method}
                            path={log.path}
                            matchedCapability={log.routing_decision?.matched_route_capability}
                            className="text-xs"
                            variant="mobile"
                          />
                        </div>

                        {displayTotalTokens > 0 && (
                          <div className="pt-1">
                            <TokenDisplay
                              promptTokens={log.prompt_tokens}
                              completionTokens={log.completion_tokens}
                              totalTokens={log.total_tokens}
                              cachedTokens={log.cached_tokens}
                              reasoningTokens={log.reasoning_tokens}
                              cacheCreationTokens={log.cache_creation_tokens}
                              cacheCreation5mTokens={log.cache_creation_5m_tokens}
                              cacheCreation1hTokens={log.cache_creation_1h_tokens}
                              cacheReadTokens={log.cache_read_tokens}
                            />
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 text-right font-mono text-xs leading-tight">
                        <div className="flex flex-col items-end gap-1">
                          <Badge
                            variant={getStatusBadgeVariant(log.status_code)}
                            className={cn(
                              "px-2 py-0.5 text-[11px] leading-none font-mono tabular-nums",
                              log.status_code === null && "text-muted-foreground"
                            )}
                          >
                            {log.status_code ?? "-"}
                          </Badge>
                          {(() => {
                            const stageInfo = getLifecycleStageInfo(log);
                            if (!stageInfo) return null;
                            return (
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-cf-sm border px-1.5 py-0.5 text-[10px] font-medium leading-none",
                                  stageInfo.color,
                                  stageInfo.bgColor,
                                  stageInfo.borderColor
                                )}
                              >
                                <Loader2 className="h-3 w-3 animate-spin" />
                              </span>
                            );
                          })()}
                        </div>
                        <div className="mt-1 tabular-nums">{formatDuration(log.duration_ms)}</div>
                        {shouldShowBillingCost(log) ? (
                          <div className="mt-1 tabular-nums text-foreground">
                            {formatBillingCost(log)}
                          </div>
                        ) : null}
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
              <TooltipProvider>
                <Table
                  frame="none"
                  containerClassName="overflow-x-hidden"
                  className="table-fixed border-collapse"
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10 px-2"></TableHead>
                      <TableHead className="w-[110px] px-2">{t("tableTime")}</TableHead>
                      <TableHead className="hidden lg:table-cell px-2">
                        {t("tableUpstream")}
                      </TableHead>
                      <TableHead className="w-[72px] px-2">{t("tableMethod")}</TableHead>
                      <TableHead className="hidden lg:table-cell w-[84px] px-2 text-left">
                        {t("tableInterfaceType")}
                      </TableHead>
                      <TableHead className="hidden xl:table-cell px-2 pl-1">
                        {t("tableModel")}
                      </TableHead>
                      <TableHead className="hidden md:table-cell px-2">
                        {t("tableTokens")}
                      </TableHead>
                      <TableHead className="w-[120px] px-2 text-right">{t("tableCost")}</TableHead>
                      <TableHead className="w-[84px] px-2">{t("tableStatus")}</TableHead>
                      <TableHead className="w-[170px] px-2">{t("tableDuration")}</TableHead>
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
                            <TableCell className="px-2 py-1.5">
                              {canExpand && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleRow(log.id);
                                  }}
                                  className="rounded-cf-sm p-1 transition-colors hover:bg-surface-300"
                                  aria-label={
                                    isExpanded ? t("collapseDetails") : t("expandDetails")
                                  }
                                >
                                  {isExpanded ? (
                                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </button>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-[8px] whitespace-nowrap px-2 py-1.5">
                              {formatDistanceToNow(new Date(log.created_at), {
                                addSuffix: true,
                                locale: dateLocale,
                              })}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell px-2 py-1.5 min-w-0 overflow-hidden text-[10px]">
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
                            <TableCell className="px-2 py-1">
                              <div className="flex flex-col items-start gap-0.5">
                                <code className="rounded-cf-sm border border-divider bg-surface-300 px-1 py-0.5 font-mono text-[10px] text-foreground whitespace-nowrap">
                                  {log.method || "-"}
                                </code>
                                <RequestModeBadge isStream={log.is_stream} compact />
                              </div>
                            </TableCell>
                            <TableCell className="hidden text-[10px] lg:table-cell w-[84px] px-2 py-1 pr-1 min-w-0">
                              <InterfaceTypeCell
                                method={log.method}
                                path={log.path}
                                matchedCapability={log.routing_decision?.matched_route_capability}
                                variant="desktop"
                                className="ml-auto"
                              />
                            </TableCell>
                            <TableCell className="hidden font-mono text-[10px] xl:table-cell px-2 py-1 pl-1 min-w-0">
                              {log.model ? (
                                <TruncatedTextTooltip text={log.model} />
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="hidden md:table-cell px-2 py-1 min-w-0 overflow-hidden text-[10px]">
                              <TokenDisplay
                                promptTokens={log.prompt_tokens}
                                completionTokens={log.completion_tokens}
                                totalTokens={log.total_tokens}
                                cachedTokens={log.cached_tokens}
                                reasoningTokens={log.reasoning_tokens}
                                cacheCreationTokens={log.cache_creation_tokens}
                                cacheCreation5mTokens={log.cache_creation_5m_tokens}
                                cacheCreation1hTokens={log.cache_creation_1h_tokens}
                                cacheReadTokens={log.cache_read_tokens}
                              />
                            </TableCell>
                            <TableCell className="px-2 py-1 text-right">
                              <div className="flex flex-col items-end gap-0">
                                {shouldShowBillingCost(log) ? (
                                  <span className="font-mono text-[11px] tabular-nums whitespace-nowrap">
                                    {formatBillingCost(log)}
                                  </span>
                                ) : null}
                                {log.billing_status === "unbilled" && (
                                  <p className="mt-1 text-[10px] text-status-warning">
                                    {log.unbillable_reason
                                      ? resolveBillingReasonLabel(log.unbillable_reason)
                                      : t("billingStatusUnbilled")}
                                  </p>
                                )}
                                {log.billing_status == null && (
                                  <p className="mt-1 text-[10px] text-muted-foreground">
                                    {t("billingStatusPending")}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="px-2 py-1">
                              <div className="flex flex-col items-start gap-1">
                                <Badge
                                  variant={getStatusBadgeVariant(log.status_code)}
                                  className={cn(
                                    "px-1.5 py-0.5 text-[10px] leading-none font-mono tabular-nums whitespace-nowrap",
                                    log.status_code === null && "text-muted-foreground"
                                  )}
                                >
                                  {log.status_code ?? "-"}
                                </Badge>
                                {(() => {
                                  const stageInfo = getLifecycleStageInfo(log);
                                  if (!stageInfo) return null;
                                  return (
                                    <span
                                      className={cn(
                                        "inline-flex items-center rounded-cf-sm border px-1.5 py-0.5 text-[10px] font-medium leading-none",
                                        stageInfo.color,
                                        stageInfo.bgColor,
                                        stageInfo.borderColor
                                      )}
                                    >
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    </span>
                                  );
                                })()}
                              </div>
                            </TableCell>
                            <TableCell className="px-2 py-1 font-mono text-[10px] leading-tight">
                              <div className="flex flex-col gap-0">
                                <span className="tabular-nums whitespace-nowrap">
                                  {formatDuration(log.duration_ms)}
                                </span>
                                {(log.ttft_ms != null || requestTps != null) && (
                                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0 text-[10px] text-muted-foreground">
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
                            <TableRow className="border-b-0 bg-transparent hover:bg-transparent">
                              <TableCell colSpan={10} className="p-0">
                                {renderExpandedDetails({
                                  log,
                                  upstreamDisplayName,
                                  failoverDurationMs,
                                  requestTps,
                                  isError,
                                  className: "px-4 py-3",
                                })}
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </TooltipProvider>
            </div>
          )}
        </>
      )}
    </div>
  );
}
