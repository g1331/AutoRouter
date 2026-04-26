"use client";

import { useState, useMemo, useEffect, useRef, Fragment, type ReactNode } from "react";
import { subDays, startOfDay } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { ScrollText, Filter, ChevronDown, Loader2 } from "lucide-react";
import type {
  ExclusionReason,
  FailoverErrorType,
  RequestLog,
  RoutingCircuitState,
  RoutingQueueStatus,
  RoutingSelectionReason,
  TimeRange,
} from "@/types/api";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
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
import { getRequestThinkingBadgeLabel } from "@/lib/utils/request-thinking-config";

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
const DESKTOP_MODEL_COLUMN_MAX_WIDTH = 264;
const DESKTOP_MODEL_COLUMN_MIN_WIDTH = 136;
const DESKTOP_TABLE_BASE_WIDTHS = {
  expand: 36,
  time: 148,
  key: 148,
  upstream: 96,
  method: 60,
  interfaceType: 84,
  tokens: 104,
  cost: 84,
  status: 68,
  duration: 112,
} as const;

const DETAIL_PANEL_CLASS =
  "overflow-hidden rounded-cf-md border border-divider/80 bg-surface-200/82 shadow-[var(--vr-shadow-xs)]";
const DETAIL_PANEL_HEADER_CLASS =
  "border-b border-divider/70 bg-surface-300/72 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground";
const DETAIL_PANEL_BODY_CLASS = "px-4 py-3";
const DETAIL_PANEL_STACK_CLASS = "space-y-3 text-[12px]";
const DETAIL_PANEL_ROW_CLASS =
  "flex items-start gap-3 border-b border-divider/35 py-2 first:pt-0 last:border-b-0 last:pb-0";
const DETAIL_PANEL_LABEL_CLASS =
  "min-w-0 shrink-0 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/82";
const DETAIL_PANEL_VALUE_CLASS = "ml-auto min-w-0 text-right text-foreground break-all";
const DETAIL_PANEL_MUTED_TEXT_CLASS = "text-[12px] text-muted-foreground";
const DETAIL_SUMMARY_BANNER_CLASS =
  "relative overflow-hidden rounded-cf-md border px-4 py-3 shadow-[var(--vr-shadow-xs)]";
const LOGS_COLOR_TRANSITION_CLASS =
  "transition-[background-color,border-color,color,opacity] duration-cf-fast ease-cf-standard motion-reduce:transition-none";
const LOGS_SURFACE_TRANSITION_CLASS =
  "transition-[transform,background-color,border-color,box-shadow,color,opacity] duration-cf-fast ease-cf-standard motion-reduce:transform-none motion-reduce:transition-none";
const LOGS_ICON_TRANSFORM_CLASS =
  "transition-transform duration-cf-fast ease-cf-standard motion-reduce:transform-none motion-reduce:transition-none";
const LOGS_INTERACTIVE_RAISE_CLASS =
  "motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0";
const LOGS_SECTION_ENTER_CLASS = "animate-log-section-enter motion-reduce:animate-none";
const LOGS_CARD_ENTER_CLASS = "animate-log-card-enter motion-reduce:animate-none";
const LOGS_CARD_EMPHASIS_CLASS = "animate-log-card-emphasis motion-reduce:animate-none";
const LOGS_ROW_ENTER_CLASS = "animate-log-row-enter motion-reduce:animate-none";
const LOGS_ROW_EMPHASIS_CLASS = "animate-log-row-emphasis motion-reduce:animate-none";
const LOGS_DETAIL_ENTER_CLASS = "animate-log-detail-enter motion-reduce:animate-none";
const LOGS_LIVE_HIGHLIGHT_CLASS = "animate-log-live-highlight motion-reduce:animate-none";

function getLogEntryAnimationDelay(index: number) {
  return `${Math.min(index * 35, 210)}ms`;
}

function ExpandChevron({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <ChevronDown
      className={cn("h-4 w-4", LOGS_ICON_TRANSFORM_CLASS, expanded && "rotate-180", className)}
      aria-hidden="true"
    />
  );
}

type ReasoningEffortLevel = NonNullable<RequestLog["reasoning_effort"]>;

type RequestLogReasoningMeta = RequestLog & {
  reasoning_effort?: unknown;
  reasoningEffort?: unknown;
  thinking_level?: unknown;
  thinkingLevel?: unknown;
};

const REASONING_EFFORT_LABELS: Record<ReasoningEffortLevel, string> = {
  none: "None",
  enabled: "Think",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "XHigh",
};

const REASONING_EFFORT_BADGE_CLASSES: Record<ReasoningEffortLevel, string> = {
  none: "border-divider/70 bg-surface-300/65 text-muted-foreground/85",
  enabled: "border-status-info/25 bg-status-info-muted/25 text-status-info",
  minimal: "border-divider/70 bg-surface-300/70 text-muted-foreground",
  low: "border-divider bg-surface-300/85 text-foreground/85",
  medium: "border-status-info/30 bg-status-info-muted/35 text-status-info",
  high: "border-amber-500/35 bg-amber-500/10 text-amber-300",
  xhigh: "border-status-warning/40 bg-status-warning-muted/25 text-status-warning",
};

const THINKING_BADGE_BASE_CLASS =
  "h-5 shrink-0 rounded-full px-1.5 py-0 font-mono text-[9px] font-medium leading-none tracking-[0.12em] shadow-none";

function extractThinkingBudgetBadgeValue(label: string): string | null {
  return label.startsWith("budget:") ? label.slice("budget:".length).trim() : null;
}

function TruncatedTextTooltip({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span className={cn("block min-w-0 truncate", className)}>{text}</span>
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

function getRequestKeyDisplayMeta(options: {
  keyName: string | null | undefined;
  keyPrefix: string | null | undefined;
  fallbackLabel: string;
}) {
  const keyName = options.keyName?.trim() ? options.keyName.trim() : null;
  const keyPrefix = options.keyPrefix?.trim() ? options.keyPrefix.trim() : null;

  if (keyName && keyPrefix) {
    return {
      primaryLabel: keyName,
      secondaryLabel: keyPrefix,
      tooltipLabel: `${keyName} · ${keyPrefix}`,
      hasKeyData: true,
    };
  }

  if (keyName) {
    return {
      primaryLabel: keyName,
      secondaryLabel: null,
      tooltipLabel: keyName,
      hasKeyData: true,
    };
  }

  if (keyPrefix) {
    return {
      primaryLabel: keyPrefix,
      secondaryLabel: null,
      tooltipLabel: keyPrefix,
      hasKeyData: true,
    };
  }

  return {
    primaryLabel: options.fallbackLabel,
    secondaryLabel: null,
    tooltipLabel: options.fallbackLabel,
    hasKeyData: false,
  };
}

function RequestKeyIdentity({
  keyName,
  keyPrefix,
  className,
  textClassName,
  compact = false,
}: {
  keyName: RequestLog["api_key_name"] | null | undefined;
  keyPrefix: RequestLog["api_key_prefix"] | null | undefined;
  className?: string;
  textClassName?: string;
  compact?: boolean;
}) {
  const t = useTranslations("logs");
  const keyMeta = getRequestKeyDisplayMeta({
    keyName,
    keyPrefix,
    fallbackLabel: t("unknownKey"),
  });

  if (!keyMeta.hasKeyData) {
    return <span className="text-muted-foreground">{keyMeta.primaryLabel}</span>;
  }

  return (
    <div className={cn("flex min-w-0 max-w-full items-center gap-1.5", className)}>
      <TruncatedTextTooltip text={keyMeta.primaryLabel} className={cn("shrink", textClassName)} />
      {keyMeta.secondaryLabel ? (
        <span
          className={cn(
            "shrink-0 rounded-cf-sm border border-divider bg-surface-300 px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground",
            compact && "px-1 py-0 text-[9px]"
          )}
          title={keyMeta.secondaryLabel}
        >
          {keyMeta.secondaryLabel}
        </span>
      ) : null}
    </div>
  );
}

function getReasoningEffortLevel(log: RequestLog): ReasoningEffortLevel | null {
  const requestLogWithMeta = log as RequestLogReasoningMeta;
  const rawValue =
    requestLogWithMeta.reasoning_effort ??
    requestLogWithMeta.reasoningEffort ??
    requestLogWithMeta.thinking_level ??
    requestLogWithMeta.thinkingLevel;

  if (typeof rawValue !== "string") {
    return null;
  }

  const normalizedValue = rawValue.trim().toLowerCase();
  return normalizedValue === "none" ||
    normalizedValue === "enabled" ||
    normalizedValue === "minimal" ||
    normalizedValue === "low" ||
    normalizedValue === "medium" ||
    normalizedValue === "high" ||
    normalizedValue === "xhigh"
    ? normalizedValue
    : null;
}

function ReasoningEffortBadge({ level }: { level: ReasoningEffortLevel }) {
  const label = REASONING_EFFORT_LABELS[level];

  return (
    <Badge
      variant="neutral"
      className={cn(
        "h-5 shrink-0 rounded-full px-1.5 py-0 font-mono text-[9px] font-medium leading-none tracking-[0.12em] shadow-none",
        REASONING_EFFORT_BADGE_CLASSES[level]
      )}
      aria-label={label}
      title={label}
    >
      <span>{label}</span>
    </Badge>
  );
}

function isThinkingBadgeDuplicatedByReasoningEffort(
  thinkingConfig: RequestLog["thinking_config"] | null | undefined,
  reasoningEffort: ReasoningEffortLevel | null | undefined
): boolean {
  if (!thinkingConfig || !reasoningEffort) {
    return false;
  }

  const badgeLabel = getRequestThinkingBadgeLabel(thinkingConfig);
  if (!badgeLabel) {
    return false;
  }

  return badgeLabel.trim().toLowerCase() === reasoningEffort;
}

function ModelIdentity({
  label,
  reasoningEffort,
  thinkingConfig,
  compactBadges = false,
  className,
  textClassName,
}: {
  label: string | null | undefined;
  reasoningEffort?: ReasoningEffortLevel | null;
  thinkingConfig?: RequestLog["thinking_config"] | null;
  compactBadges?: boolean;
  className?: string;
  textClassName?: string;
}) {
  if (!label) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <div className={cn("flex min-w-0 max-w-full items-center gap-1", className)}>
      <TruncatedTextTooltip text={label} className={cn("shrink", textClassName)} />
      {reasoningEffort ? <ReasoningEffortBadge level={reasoningEffort} /> : null}
      <ThinkingConfigBadge
        thinkingConfig={thinkingConfig}
        dedupeWithReasoningEffort={reasoningEffort}
        compact={compactBadges}
      />
    </div>
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

function ThinkingConfigBadge({
  thinkingConfig,
  dedupeWithReasoningEffort,
  compact = false,
}: {
  thinkingConfig: RequestLog["thinking_config"] | null | undefined;
  dedupeWithReasoningEffort?: ReasoningEffortLevel | null;
  compact?: boolean;
}) {
  const t = useTranslations("logs");
  const badgeLabel = getRequestThinkingBadgeLabel(thinkingConfig ?? null);
  const budgetValue = badgeLabel ? extractThinkingBudgetBadgeValue(badgeLabel) : null;

  if (
    !badgeLabel ||
    isThinkingBadgeDuplicatedByReasoningEffort(thinkingConfig, dedupeWithReasoningEffort)
  ) {
    return null;
  }

  if (budgetValue) {
    return (
      <Badge
        variant="success"
        className={cn(
          THINKING_BADGE_BASE_CLASS,
          "gap-1 border-status-success/30 bg-status-success-muted/35 text-status-success",
          compact && "gap-0.5 px-1 py-0 text-[8px]"
        )}
        aria-label={t("thinkingBadgeAria", { value: badgeLabel })}
        title={t("thinkingBadgeAria", { value: badgeLabel })}
      >
        <span className="uppercase tracking-[0.16em]">Budget</span>
        <span
          className={cn(
            "rounded-full bg-background/65 px-1 py-[1px] text-[8px] leading-none tracking-[0.08em] text-foreground/85",
            compact && "px-0.5 text-[7px]"
          )}
        >
          {budgetValue}
        </span>
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 border-divider px-1.5 py-0 font-mono text-[10px] leading-4 text-muted-foreground",
        compact && "px-1 py-0 text-[9px]"
      )}
      aria-label={t("thinkingBadgeAria", { value: badgeLabel })}
      title={t("thinkingBadgeAria", { value: badgeLabel })}
    >
      [{badgeLabel}]
    </Badge>
  );
}

function ThinkingConfigPanel({
  thinkingConfig,
}: {
  thinkingConfig: RequestLog["thinking_config"] | null | undefined;
}) {
  const t = useTranslations("logs");
  const locale = useLocale();
  const [isExpanded, setIsExpanded] = useState(false);
  const isZh = locale === "zh-CN" || locale === "zh";
  const panelTitle = t("thinkingConfig");
  const expandLabel = isZh ? "展开思考信息" : "Expand thinking details";
  const collapseLabel = isZh ? "收起思考信息" : "Collapse thinking details";

  const summaryText = thinkingConfig
    ? [
        t(`thinkingProviderValue.${thinkingConfig.provider}`),
        t(`thinkingModeValue.${thinkingConfig.mode}`),
        getRequestThinkingBadgeLabel(thinkingConfig),
      ]
        .filter(Boolean)
        .join(" · ")
    : t("thinkingNotExplicitlySpecified");

  if (!thinkingConfig) {
    return (
      <div className={DETAIL_PANEL_CLASS}>
        <div className={DETAIL_PANEL_HEADER_CLASS}>{panelTitle}</div>
        <div className={DETAIL_PANEL_BODY_CLASS}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className={cn(DETAIL_PANEL_MUTED_TEXT_CLASS, "min-w-0 flex-1")}>{summaryText}</div>
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-divider px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? collapseLabel : expandLabel}
            >
              <ChevronDown
                className={cn("h-3 w-3", LOGS_ICON_TRANSFORM_CLASS, isExpanded && "rotate-180")}
                aria-hidden="true"
              />
              <span>{isExpanded ? collapseLabel : expandLabel}</span>
            </button>
          </div>
          {isExpanded ? (
            <div
              className={cn("mt-3 border-t border-divider/40 pt-3", DETAIL_PANEL_MUTED_TEXT_CLASS)}
            >
              {t("thinkingNotExplicitlySpecified")}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const detailRows = [
    {
      label: t("thinkingProvider"),
      value: t(`thinkingProviderValue.${thinkingConfig.provider}`),
    },
    {
      label: t("thinkingProtocol"),
      value: t(`thinkingProtocolValue.${thinkingConfig.protocol}`),
    },
    {
      label: t("thinkingMode"),
      value: t(`thinkingModeValue.${thinkingConfig.mode}`),
    },
    {
      label: t("thinkingLevel"),
      value: thinkingConfig.level ?? t("thinkingValueUnset"),
    },
    {
      label: t("thinkingBudgetTokens"),
      value:
        thinkingConfig.budget_tokens != null
          ? thinkingConfig.budget_tokens.toLocaleString(locale)
          : t("thinkingValueUnset"),
    },
    {
      label: t("thinkingIncludeThoughts"),
      value:
        thinkingConfig.include_thoughts == null
          ? t("thinkingValueUnset")
          : thinkingConfig.include_thoughts
            ? t("thinkingBooleanEnabled")
            : t("thinkingBooleanDisabled"),
    },
    {
      label: t("thinkingSourcePaths"),
      value:
        thinkingConfig.source_paths.length > 0
          ? thinkingConfig.source_paths.join(" · ")
          : t("thinkingValueUnset"),
    },
  ];

  return (
    <div className={DETAIL_PANEL_CLASS}>
      <div className={DETAIL_PANEL_HEADER_CLASS}>{panelTitle}</div>
      <div className={DETAIL_PANEL_BODY_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1 text-[12px] text-muted-foreground">{summaryText}</div>
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-divider px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? collapseLabel : expandLabel}
          >
            <ChevronDown
              className={cn("h-3 w-3", LOGS_ICON_TRANSFORM_CLASS, isExpanded && "rotate-180")}
              aria-hidden="true"
            />
            <span>{isExpanded ? collapseLabel : expandLabel}</span>
          </button>
        </div>
        {isExpanded ? (
          <div className={cn("mt-3 border-t border-divider/40 pt-3", DETAIL_PANEL_STACK_CLASS)}>
            {detailRows.map((row) => (
              <div key={row.label} className={DETAIL_PANEL_ROW_CLASS}>
                <span className={DETAIL_PANEL_LABEL_CLASS}>{row.label}</span>
                <span className={DETAIL_PANEL_VALUE_CLASS}>{row.value}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
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

function hasConcurrencyFullSignal(
  log: Pick<RequestLog, "routing_decision" | "failover_history">
): boolean {
  return (
    log.routing_decision?.excluded?.some((item) => item.reason === "concurrency_full") === true ||
    log.failover_history?.some((attempt) => attempt.error_type === "concurrency_full") === true
  );
}

function hasQueueSignal(log: Pick<RequestLog, "routing_decision">): boolean {
  return log.routing_decision?.queue != null;
}

function getQueueStatusVariant(
  status: RoutingQueueStatus
): "neutral" | "success" | "warning" | "error" {
  switch (status) {
    case "resumed":
      return "success";
    case "waiting":
      return "warning";
    case "timed_out":
    case "aborted":
      return "error";
    default:
      return "neutral";
  }
}

function getPercentile(values: number[], percentile: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

export function LogsTable({ logs, isLive = false }: LogsTableProps) {
  const t = useTranslations("logs");
  const locale = useLocale();
  const [desktopTableContainerElement, setDesktopTableContainerElement] =
    useState<HTMLDivElement | null>(null);
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
  const serverTimestampFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "UTC",
      }),
    [locale]
  );
  const localTimestampFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    [locale]
  );

  const formatLogTimestamp = (value: string) => {
    const timestamp = new Date(value);
    if (hydratedAt !== null && hydratedAt - timestamp.getTime() < 60_000) {
      return t("logTimeLessThanMinute");
    }
    return hydratedAt === null
      ? serverTimestampFormatter.format(timestamp)
      : localTimestampFormatter.format(timestamp);
  };

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
  const [desktopBreakpointState, setDesktopBreakpointState] = useState({
    md: true,
    lg: true,
    xl: true,
  });
  const [desktopTableWidth, setDesktopTableWidth] = useState<number | null>(null);
  const [hydratedAt, setHydratedAt] = useState<number | null>(null);

  // Expanded rows state for failover details
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [hasExpansionInteraction, setHasExpansionInteraction] = useState(false);
  const [focusedJourneySteps, setFocusedJourneySteps] = useState<Record<string, number>>({});
  const [journeyViewMode, setJourneyViewMode] = useState<"focused" | "sequential">("focused");

  // Track new log IDs for scan animation
  const [newLogIds, setNewLogIds] = useState<Set<string>>(new Set());
  const [changedLogIds, setChangedLogIds] = useState<Set<string>>(new Set());
  const prevLogIdsRef = useRef<Set<string> | null>(null); // null = initial load
  const prevLogSignaturesRef = useRef<Map<string, string> | null>(null);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mobileMediaQuery = window.matchMedia("(max-width: 1023px)");
    const mdMediaQuery = window.matchMedia("(min-width: 768px)");
    const lgMediaQuery = window.matchMedia("(min-width: 1024px)");
    const xlMediaQuery = window.matchMedia("(min-width: 1280px)");
    const updateLayout = () => {
      setIsMobileLayout(mobileMediaQuery.matches);
      setDesktopBreakpointState({
        md: mdMediaQuery.matches,
        lg: lgMediaQuery.matches,
        xl: xlMediaQuery.matches,
      });
    };
    updateLayout();

    mobileMediaQuery.addEventListener("change", updateLayout);
    mdMediaQuery.addEventListener("change", updateLayout);
    lgMediaQuery.addEventListener("change", updateLayout);
    xlMediaQuery.addEventListener("change", updateLayout);
    return () => {
      mobileMediaQuery.removeEventListener("change", updateLayout);
      mdMediaQuery.removeEventListener("change", updateLayout);
      lgMediaQuery.removeEventListener("change", updateLayout);
      xlMediaQuery.removeEventListener("change", updateLayout);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (isMobileLayout || !desktopTableContainerElement) {
      return;
    }

    const updateDesktopTableWidth = () => {
      const nextWidth = desktopTableContainerElement.clientWidth;
      setDesktopTableWidth(nextWidth > 0 ? nextWidth : null);
    };

    updateDesktopTableWidth();

    if (typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver(() => {
        updateDesktopTableWidth();
      });
      resizeObserver.observe(desktopTableContainerElement);

      return () => {
        resizeObserver.disconnect();
      };
    }

    window.addEventListener("resize", updateDesktopTableWidth);

    return () => {
      window.removeEventListener("resize", updateDesktopTableWidth);
    };
  }, [desktopTableContainerElement, isMobileLayout]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setHydratedAt(Date.now());
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  // Detect new logs and trigger animation (skip initial load)
  useEffect(() => {
    const currentIds = new Set(logs.map((log) => log.id));
    const currentSignatures = new Map(
      logs.map((log) => [
        log.id,
        `${log.status_code ?? "pending"}:${log.lifecycle_status ?? "unknown"}:${log.failure_stage ?? "unknown"}`,
      ])
    );

    // Skip animation on initial load
    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      prevLogIdsRef.current = currentIds;
      prevLogSignaturesRef.current = currentSignatures;
      return;
    }

    const prevIds = prevLogIdsRef.current;
    const prevSignatures = prevLogSignaturesRef.current;
    if (!prevIds) {
      prevLogIdsRef.current = currentIds;
      prevLogSignaturesRef.current = currentSignatures;
      return;
    }

    const newIds = new Set<string>();
    const changedIds = new Set<string>();
    currentIds.forEach((id) => {
      if (!prevIds.has(id)) {
        newIds.add(id);
        return;
      }

      const prevSignature = prevSignatures?.get(id);
      const currentSignature = currentSignatures.get(id);
      if (prevSignature && currentSignature && prevSignature !== currentSignature) {
        changedIds.add(id);
      }
    });

    // Always update the ref first
    prevLogIdsRef.current = currentIds;
    prevLogSignaturesRef.current = currentSignatures;

    if (newIds.size > 0 || changedIds.size > 0) {
      // Use queueMicrotask to defer state updates
      queueMicrotask(() => {
        setNewLogIds(newIds);
        setChangedLogIds(changedIds);
      });

      // Clear animation after it completes
      const clearTimer = setTimeout(() => {
        setNewLogIds(new Set());
        setChangedLogIds(new Set());
      }, 1200);

      return () => {
        clearTimeout(clearTimer);
      };
    }
  }, [logs]);

  const hasLiveActivity = newLogIds.size > 0 || changedLogIds.size > 0;

  const toggleRow = (logId: string) => {
    if (!hasExpansionInteraction) {
      setHasExpansionInteraction(true);
    }

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

  const getCircuitStateVariant = (
    circuitState: RoutingCircuitState
  ): "neutral" | "warning" | "error" => {
    if (circuitState === "open") {
      return "error";
    }
    if (circuitState === "half_open") {
      return "warning";
    }
    return "neutral";
  };

  const getCandidateStateClasses = (circuitState: RoutingCircuitState, isSelected: boolean) => {
    if (circuitState === "open") {
      return {
        row: "border-status-error/20 bg-status-error-muted/10",
        text: "text-status-error",
        marker: "text-status-error",
      };
    }

    if (circuitState === "half_open") {
      return {
        row: "border-status-warning/20 bg-status-warning-muted/10",
        text: "text-status-warning",
        marker: "text-status-warning",
      };
    }

    if (isSelected) {
      return {
        row: "border-emerald-500/30 bg-emerald-500/10",
        text: "text-foreground",
        marker: "text-foreground",
      };
    }

    return {
      row: "border-divider bg-surface-300/65",
      text: "text-foreground",
      marker: "text-muted-foreground",
    };
  };

  const getExcludedReasonVariant = (reason: ExclusionReason): "neutral" | "warning" | "error" => {
    if (reason === "concurrency_full") {
      return "warning";
    }
    if (reason === "model_not_allowed") {
      return "neutral";
    }
    return "error";
  };

  const getExcludedReasonClasses = (reason: ExclusionReason) => {
    switch (reason) {
      case "concurrency_full":
        return {
          row: "border-status-warning/20 bg-status-warning-muted/10",
          text: "text-status-warning",
        };
      case "model_not_allowed":
        return {
          row: "border-divider bg-surface-300/65",
          text: "text-foreground",
        };
      default:
        return {
          row: "border-status-error/20 bg-status-error-muted/10",
          text: "text-status-error",
        };
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

  const isLogInProgress = (log: RequestLog) => log.status_code == null;

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
    const reasoningEffort = getReasoningEffortLevel(log);

    const didSendUpstream = routingDecision?.did_send_upstream;
    const finalUpstreamLabel =
      didSendUpstream === false ? t("timelineNoUpstreamSent") : (upstreamDisplayName ?? "-");
    const queueLog = routingDecision?.queue ?? null;
    const queueStatusLabel = queueLog ? t("queueStatus." + queueLog.status) : null;
    const queueLifecycleLabel = queueLog ? t("journeyQueueLifecycle." + queueLog.status) : null;
    const requestKeyMeta = getRequestKeyDisplayMeta({
      keyName: log.api_key_name,
      keyPrefix: log.api_key_prefix,
      fallbackLabel: t("unknownKey"),
    });

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
    type JourneyProgressState = "done" | "active" | "failed" | "pending";
    type JourneyStep = {
      index: number;
      title: string;
      summary: string;
      meta: string | null;
      tone: JourneyTone;
      metrics: ReactNode;
      content: ReactNode;
      focusedContent?: ReactNode | null;
    };

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
        tab: "border-divider/80 bg-surface-200/78 text-foreground hover:border-divider hover:bg-surface-200",
        tabActive: "border-divider bg-surface-200 text-foreground shadow-[var(--vr-shadow-xs)]",
        number: "border-divider bg-surface-300 text-muted-foreground",
        accent: "bg-foreground/12",
        panel: "border-divider/80 bg-surface-200/82",
      },
      info: {
        tab: "border-divider/80 bg-surface-200/78 text-foreground hover:border-divider hover:bg-surface-200",
        tabActive: "border-divider bg-surface-200 text-foreground shadow-[var(--vr-shadow-xs)]",
        number: "border-divider bg-surface-300 text-muted-foreground",
        accent: "bg-foreground/12",
        panel: "border-divider/80 bg-surface-200/82",
      },
      warning: {
        tab: "border-divider/80 bg-surface-200/78 text-foreground hover:border-amber-400/20 hover:bg-surface-200",
        tabActive:
          "border-amber-400/25 bg-surface-200 text-foreground shadow-[var(--vr-shadow-glow-subtle)]",
        number: "border-amber-400/20 bg-amber-500/10 text-amber-300",
        accent: "bg-amber-400/75",
        panel: "border-amber-400/22 bg-surface-200/82",
      },
      success: {
        tab: "border-divider/80 bg-surface-200/78 text-foreground hover:border-status-success/20 hover:bg-surface-200",
        tabActive:
          "border-status-success/25 bg-surface-200 text-foreground shadow-[var(--vr-shadow-xs)]",
        number: "border-status-success/20 bg-status-success-muted/18 text-status-success",
        accent: "bg-status-success/80",
        panel: "border-status-success/22 bg-surface-200/82",
      },
      error: {
        tab: "border-divider/80 bg-surface-200/78 text-foreground hover:border-status-error/20 hover:bg-surface-200",
        tabActive:
          "border-status-error/25 bg-surface-200 text-foreground shadow-[var(--vr-shadow-xs)]",
        number: "border-status-error/20 bg-status-error-muted/18 text-status-error",
        accent: "bg-status-error/85",
        panel: "border-status-error/22 bg-surface-200/82",
      },
    };

    const requestSignature = [log.method, log.path].filter(Boolean).join(" ");
    const candidateSummary =
      routingDecision && didSendUpstream !== false
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
      queueStatusLabel,
    ]
      .filter(Boolean)
      .join(" · ");
    const requestExecutionSummary =
      queueLog?.status === "timed_out"
        ? t("journeyRequestQueuedTimedOut")
        : queueLog?.status === "aborted"
          ? t("journeyRequestQueuedAborted")
          : queueLog?.status === "resumed"
            ? t("journeyRequestQueuedResumed")
            : queueLog?.status === "waiting"
              ? t("journeyRequestQueuedWaiting")
              : didSendUpstream === false
                ? t("journeyRequestNotSent")
                : t("journeyRequestSentTo") + " " + finalUpstreamLabel;
    const queueExecutionMeta = [
      queueStatusLabel,
      queueLog?.wait_duration_ms != null
        ? `${t("journeyQueueWaitDuration")} ${formatMetricText(queueLog.wait_duration_ms)}`
        : null,
      queueLog?.timeout_ms != null
        ? `${t("journeyQueueTimeout")} ${formatMetricText(queueLog.timeout_ms)}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const requestExecutionMeta = [
      queueExecutionMeta || null,
      hasFailoverHistory
        ? String(log.failover_attempts) + " " + t("retryAttemptsSummary")
        : finalSelectionReason
          ? getSelectionReasonText(finalSelectionReason)
          : didSendUpstream === false
            ? t("timelineNoUpstreamSent")
            : t("timelineDirectSuccess"),
    ]
      .filter(Boolean)
      .join(" · ");
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
    const summaryTone: JourneyTone =
      statusVariant === "error"
        ? "error"
        : hasFailoverHistory || hasFailoverWithoutHistory || statusVariant === "warning"
          ? "warning"
          : statusVariant === "success"
            ? "success"
            : "neutral";
    const summaryToneStyles = JOURNEY_TONE_STYLES[summaryTone];
    const summaryBadge =
      statusVariant === "error"
        ? t("tableStatus")
        : hasFailoverHistory || hasFailoverWithoutHistory
          ? t("retryAttemptsSummary")
          : statusVariant === "success"
            ? t("lifecycleComplete")
            : t("lifecycleTimeline");
    const summaryHeadline =
      statusVariant === "error"
        ? `HTTP ${log.status_code ?? "-"}`
        : didSendUpstream === false
          ? t("journeyRequestNotSent")
          : finalUpstreamLabel;
    const summaryReason =
      statusVariant === "error"
        ? [
            failureStageLabel,
            log.upstream_error?.error_type ?? null,
            log.upstream_error?.error_message ?? null,
          ]
            .filter(Boolean)
            .join(" · ")
        : hasFailoverHistory || hasFailoverWithoutHistory
          ? [requestExecutionMeta, failoverDurationText].filter(Boolean).join(" · ")
          : [completeStepMeta, responseStepMeta].filter(Boolean).join(" · ");
    const errorSummaryLines = isError
      ? [
          `ERROR_TYPE: HTTP_${log.status_code ?? "UNKNOWN"}`,
          `STATUS: ${log.status_code != null && log.status_code >= 500 ? "SERVER_ERROR" : "CLIENT_ERROR"}`,
        ]
      : [];
    const errorSummaryCallout = isError
      ? [
          `HTTP ${log.status_code ?? "-"}`,
          failureStageLabel,
          log.billing_status === "unbilled"
            ? resolveBillingReasonLabel(log.unbillable_reason)
            : null,
          didSendUpstream === false ? t("timelineNoUpstreamSent") : null,
        ]
          .filter(Boolean)
          .join(" • ")
      : null;
    const getDefaultJourneyStepIndex = () => {
      if (didSendUpstream === false || hasFailoverHistory || hasFailoverWithoutHistory) {
        return 3;
      }
      if (routingDecision?.failure_stage === "downstream_streaming") {
        return 4;
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
    const failureJourneyStepIndex = (() => {
      if (!isError) {
        return null;
      }
      if (
        didSendUpstream === false ||
        hasFailoverHistory ||
        hasFailoverWithoutHistory ||
        routingDecision?.failure_stage === "upstream_request"
      ) {
        return 3;
      }
      if (routingDecision?.failure_stage === "downstream_streaming") {
        return 4;
      }
      return 5;
    })();
    const getJourneyProgressState = (stepIndex: number): JourneyProgressState => {
      if (failureJourneyStepIndex != null) {
        if (stepIndex < failureJourneyStepIndex) {
          return "done";
        }
        if (stepIndex === failureJourneyStepIndex) {
          return "failed";
        }
        return "pending";
      }

      if (log.status_code != null && log.status_code >= 200 && log.status_code < 300) {
        return "done";
      }

      if (stepIndex < activeJourneyStepIndex) {
        return "done";
      }
      if (stepIndex === activeJourneyStepIndex) {
        return "active";
      }
      return "pending";
    };
    const JOURNEY_PROGRESS_STYLES: Record<
      JourneyProgressState,
      {
        tab: string;
        number: string;
        accent: string;
        arrow: string;
      }
    > = {
      done: {
        tab: "border-status-success/30 bg-status-success-muted/16 text-foreground",
        number: "border-status-success/25 bg-status-success-muted/22 text-status-success",
        accent: "bg-status-success/80",
        arrow: "text-status-success/70",
      },
      active: {
        tab: "border-amber-400/30 bg-surface-200 text-foreground shadow-[var(--vr-shadow-glow-subtle)]",
        number: "border-amber-400/25 bg-amber-500/12 text-amber-300",
        accent: "bg-amber-400/80",
        arrow: "text-amber-300/70",
      },
      failed: {
        tab: "border-status-error/30 bg-status-error-muted/14 text-foreground",
        number: "border-status-error/24 bg-status-error-muted/22 text-status-error",
        accent: "bg-status-error/85",
        arrow: "text-status-error/70",
      },
      pending: {
        tab: "border-divider/80 bg-surface-200/58 text-muted-foreground",
        number: "border-divider/70 bg-surface-300/70 text-muted-foreground/70",
        accent: "bg-transparent",
        arrow: "text-muted-foreground/45",
      },
    };
    const setActiveJourneyStep = (stepIndex: number) => {
      setFocusedJourneySteps((prev) =>
        prev[log.id] === stepIndex ? prev : { ...prev, [log.id]: stepIndex }
      );
    };

    const journeySteps: JourneyStep[] = [
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
            <div className="flex flex-wrap items-center gap-2">
              <ModelIdentity
                label={modelDisplay ?? log.model}
                reasoningEffort={reasoningEffort}
                thinkingConfig={log.thinking_config}
                className="min-w-0"
                textClassName="font-medium text-foreground"
              />
            </div>
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
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <span>{t("requestKey")}:</span>
              <RequestKeyIdentity
                keyName={log.api_key_name}
                keyPrefix={log.api_key_prefix}
                textClassName="text-foreground"
              />
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
        tone: "neutral" as JourneyTone,
        metrics: (
          <>
            {routingTypeLabel ? renderMetricPill(routingTypeLabel, "", "neutral") : null}
            {routingDecision && didSendUpstream !== false
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
                  <ModelIdentity
                    label={modelDisplay}
                    reasoningEffort={reasoningEffort}
                    thinkingConfig={log.thinking_config}
                    textClassName="font-medium text-foreground"
                  />
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
                          : routingDecision.route_match_source === "path_header_profile"
                            ? t("routeMatchSourcePathHeaderProfile")
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
                {decisionSelectionReason?.selected_circuit_state
                  ? renderJourneyField({
                      label: t("journeySelectedCircuitState"),
                      value: t("circuitState." + decisionSelectionReason.selected_circuit_state),
                    })
                  : null}
                {routingDecision?.candidates?.length ? (
                  <div className="space-y-1.5">
                    {routingDecision.candidates.map((candidate) => {
                      const isSelected = candidate.id === decisionSelectedCandidateId;
                      const candidateStateClasses = getCandidateStateClasses(
                        candidate.circuit_state,
                        isSelected
                      );
                      return (
                        <div
                          key={candidate.id}
                          className={cn(
                            "flex flex-wrap items-center gap-2 rounded-cf-sm border px-2 py-1.5",
                            candidateStateClasses.row
                          )}
                        >
                          <span className={cn("font-medium", candidateStateClasses.marker)}>
                            {isSelected ? "●" : "○"}
                          </span>
                          <span className={cn("min-w-0 flex-1", candidateStateClasses.text)}>
                            {candidate.name}
                          </span>
                          <Badge
                            variant={getCircuitStateVariant(candidate.circuit_state)}
                            className="px-1.5 py-0 text-[10px]"
                          >
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
                    {routingDecision.excluded.map((excluded) => {
                      const excludedReasonClasses = getExcludedReasonClasses(excluded.reason);
                      return (
                        <div
                          key={excluded.id}
                          className={cn(
                            "flex flex-wrap items-center gap-2 rounded-cf-sm border px-2 py-1.5",
                            excludedReasonClasses.row
                          )}
                        >
                          <span className={cn("min-w-0 flex-1", excludedReasonClasses.text)}>
                            {excluded.name}
                          </span>
                          <Badge
                            variant={getExcludedReasonVariant(excluded.reason)}
                            className="px-1.5 py-0 text-[10px]"
                          >
                            {t("exclusionReason." + excluded.reason)}
                          </Badge>
                        </div>
                      );
                    })}
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
          didSendUpstream === false
            ? ("error" as JourneyTone)
            : hasFailoverHistory || hasFailoverWithoutHistory
              ? ("warning" as JourneyTone)
              : ("success" as JourneyTone),
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
            {queueLog && queueStatusLabel && queueLifecycleLabel ? (
              <div className="space-y-2 rounded-cf-sm border border-divider/70 bg-surface-300/65 p-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant={getQueueStatusVariant(queueLog.status)}
                    className="px-1.5 py-0 text-[10px]"
                  >
                    {queueStatusLabel}
                  </Badge>
                  {queueLog.wait_duration_ms != null
                    ? renderMetricPill(
                        t("journeyQueueWaitDuration"),
                        formatMetricText(queueLog.wait_duration_ms),
                        "warning"
                      )
                    : null}
                  {queueLog.timeout_ms != null
                    ? renderMetricPill(
                        t("journeyQueueTimeout"),
                        formatMetricText(queueLog.timeout_ms),
                        "neutral"
                      )
                    : null}
                </div>
                {renderJourneyField({
                  label: t("journeyQueueLifecycle"),
                  value: queueLifecycleLabel,
                })}
                {renderJourneyField({
                  label: t("journeyQueueTarget"),
                  value: queueLog.upstream_id,
                  valueClassName: "font-mono break-all",
                })}
              </div>
            ) : null}
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
                        {attempt.selection_reason?.selected_circuit_state ? (
                          <Badge
                            variant={getCircuitStateVariant(
                              attempt.selection_reason.selected_circuit_state
                            )}
                            className="px-1.5 py-0 text-[10px]"
                          >
                            {t("circuitState." + attempt.selection_reason.selected_circuit_state)}
                          </Badge>
                        ) : null}
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
                        <div className="mt-1 rounded-cf-sm border border-status-error/25 bg-status-error-muted/10 px-2 py-1 text-[11px] text-status-error">
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
            : ttftMs != null && requestTps == null
              ? ("warning" as JourneyTone)
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
              <div className="space-y-2 rounded-cf-sm border border-divider bg-surface-200/60 p-2.5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-[11px]">
                  <span className="text-foreground">{t("journeyFirstOutput")}</span>
                  <span className="text-muted-foreground">{t("perfTtft")}</span>
                  <span className="text-right text-status-warning">
                    {formatStageDurationText(cumulativeFirstOutputMs, ttftMs)}
                  </span>
                </div>
                {genMs != null ? (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-t border-divider/40 pt-2 text-[11px]">
                    <span className="text-foreground">{t("journeyGenerationFinished")}</span>
                    <span className="text-muted-foreground">
                      {requestTps != null
                        ? `${t("perfTps")} ${requestTps.toFixed(1)}`
                        : t("perfTps")}
                    </span>
                    <span className="text-right text-status-success">
                      {responsePhaseDurationText}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : genMs != null ? (
              <div className="space-y-2 rounded-cf-sm border border-divider bg-surface-200/60 p-2.5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-[11px]">
                  <span className="text-foreground">{t("journeyGenerationFinished")}</span>
                  <span className="text-muted-foreground">
                    {requestTps != null ? `${t("perfTps")} ${requestTps.toFixed(1)}` : t("perfTps")}
                  </span>
                  <span className="text-right text-status-success">
                    {responsePhaseDurationText}
                  </span>
                </div>
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
      activeJourneyStep.focusedContent != null
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
            <div className="space-y-3">
              <div className={cn(DETAIL_SUMMARY_BANNER_CLASS, summaryToneStyles.panel)}>
                <div className={cn("absolute inset-x-0 top-0 h-0.5", summaryToneStyles.accent)} />
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={
                          summaryTone === "error"
                            ? "destructive"
                            : summaryTone === "warning"
                              ? "warning"
                              : summaryTone === "success"
                                ? "success"
                                : "neutral"
                        }
                        className="px-1.5 py-0 text-[10px]"
                      >
                        {summaryBadge}
                      </Badge>
                    </div>
                    <div
                      className={cn(
                        "mt-2 text-sm font-medium",
                        summaryTone === "error"
                          ? "text-status-error"
                          : summaryTone === "success"
                            ? "text-status-success"
                            : "text-foreground"
                      )}
                    >
                      {summaryHeadline}
                    </div>
                    {summaryReason ? (
                      <div
                        className={cn(
                          "mt-1 text-[11px] leading-relaxed",
                          summaryTone === "error"
                            ? "text-status-error/80"
                            : "text-muted-foreground/82"
                        )}
                      >
                        {summaryReason}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {log.status_code != null
                      ? renderMetricPill(t("tableStatus"), String(log.status_code), statusVariant)
                      : null}
                    {totalMs != null
                      ? renderMetricPill(t("tableDuration"), formatMetricText(totalMs), "info")
                      : null}
                    {requestTps != null
                      ? renderMetricPill(t("perfTps"), requestTps.toFixed(1) + " tok/s", "success")
                      : null}
                  </div>
                </div>
                <div className="mt-3 border-t border-divider/35 pt-3 text-[11px] text-muted-foreground">
                  <span className="mr-2 uppercase tracking-[0.14em]">{t("requestKey")}</span>
                  <RequestKeyIdentity
                    keyName={log.api_key_name}
                    keyPrefix={log.api_key_prefix}
                    compact
                    className="inline-flex max-w-full align-middle"
                    textClassName={
                      requestKeyMeta.hasKeyData ? "text-foreground" : "text-muted-foreground"
                    }
                  />
                </div>
                {errorSummaryLines.length > 0 ? (
                  <div className="mt-3 space-y-2 border-t border-divider/35 pt-3">
                    <div className="rounded-cf-sm border border-divider/70 bg-surface-300/58 px-3 py-2 text-[10px] text-muted-foreground">
                      {errorSummaryLines.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </div>
                    {errorSummaryCallout ? (
                      <div className="rounded-cf-sm border border-status-error/30 bg-status-error-muted/12 px-3 py-2 text-[11px] text-status-error">
                        {errorSummaryCallout}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="px-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {t("lifecycleTimeline")}
              </div>

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
              </div>

              <div className="space-y-3">
                <div className="px-1">
                  <div className="flex w-full max-w-full flex-wrap items-center justify-start gap-1">
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
                            "rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.16em]",
                            LOGS_SURFACE_TRANSITION_CLASS,
                            LOGS_INTERACTIVE_RAISE_CLASS,
                            isActive
                              ? "border border-divider bg-surface-300 text-foreground shadow-[var(--vr-shadow-xs)]"
                              : "text-muted-foreground hover:bg-surface-200/70 hover:text-foreground"
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
                      <div className="flex flex-wrap items-center gap-1.5 xl:grid-cols-5">
                        {journeySteps.map((step, index) => {
                          const tone = JOURNEY_TONE_STYLES[step.tone];
                          const isActive = step.index === activeJourneyStep.index;
                          const progressState = getJourneyProgressState(step.index);
                          const progressTone = JOURNEY_PROGRESS_STYLES[progressState];
                          return (
                            <Fragment key={step.index}>
                              <button
                                type="button"
                                onClick={() => setActiveJourneyStep(step.index)}
                                aria-pressed={isActive}
                                aria-label={step.title}
                                className={cn(
                                  "group relative inline-flex min-w-0 items-center gap-2 overflow-hidden rounded-full border px-3 py-2 text-left",
                                  LOGS_SURFACE_TRANSITION_CLASS,
                                  "motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0",
                                  progressTone.tab,
                                  isActive && cn("motion-safe:-translate-y-0.5", tone.tabActive)
                                )}
                              >
                                <div
                                  className={cn(
                                    "absolute inset-x-0 top-0 h-0.5 opacity-0 transition-opacity duration-cf-fast ease-cf-standard motion-reduce:transition-none",
                                    progressTone.accent,
                                    isActive && "opacity-100"
                                  )}
                                />
                                <span
                                  className={cn(
                                    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold transition-[background-color,border-color,color] duration-cf-fast ease-cf-standard motion-reduce:transition-none",
                                    progressTone.number
                                  )}
                                >
                                  {step.index}
                                </span>
                                <div className="min-w-0">
                                  <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                    {step.title}
                                  </div>
                                  <div className="truncate text-[11px] text-foreground">
                                    {step.summary}
                                  </div>
                                </div>
                              </button>
                              {index < journeySteps.length - 1 ? (
                                <span
                                  className={cn(
                                    "inline-flex h-6 items-center px-0.5",
                                    progressTone.arrow
                                  )}
                                  aria-hidden="true"
                                >
                                  →
                                </span>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </div>
                    </div>

                    <div
                      key={`journey-panel-${activeJourneyStep.index}-${journeyViewMode}`}
                      className={cn(
                        "relative overflow-hidden rounded-[22px] border p-3 shadow-[var(--vr-shadow-xs)] transition-[background-color,border-color,box-shadow,opacity] duration-cf-normal ease-cf-standard motion-reduce:transition-none",
                        LOGS_CARD_ENTER_CLASS,
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
                            "relative overflow-hidden rounded-[22px] border p-3 shadow-[var(--vr-shadow-xs)] transition-[background-color,border-color,box-shadow,opacity] duration-cf-normal ease-cf-standard motion-reduce:transition-none sm:p-3.5",
                            LOGS_CARD_ENTER_CLASS,
                            tone.panel
                          )}
                          style={{ animationDelay: `${Math.min(step.index - 1, 4) * 45}ms` }}
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

        {/* Token, Billing & Thinking Details */}
        <section className={DETAIL_PANEL_CLASS}>
          <div className={DETAIL_PANEL_HEADER_CLASS}>
            {t("tokenDetails")} · {t("billingDetails")}
          </div>
          <div className={DETAIL_PANEL_BODY_CLASS}>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)]">
              <div className="space-y-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/78">
                  {t("tokenDetails")}
                </div>
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
                {(log.model_max_input_tokens != null || log.model_max_output_tokens != null) && (
                  <div className="border-t border-divider/40 pt-3">
                    <div className="space-y-2 text-[11px]">
                      <div className="uppercase tracking-[0.12em] text-muted-foreground/78">
                        {t("modelWindow")}
                      </div>
                      <div className="space-y-1.5">
                        {log.model_max_input_tokens != null ? (
                          <div className="flex items-start gap-3">
                            <span className={DETAIL_PANEL_LABEL_CLASS}>
                              {t("modelWindowMaxInput")}
                            </span>
                            <span className="ml-auto tabular-nums text-right text-foreground">
                              {log.model_max_input_tokens.toLocaleString()}
                            </span>
                          </div>
                        ) : null}
                        {log.model_max_output_tokens != null ? (
                          <div className="flex items-start gap-3">
                            <span className={DETAIL_PANEL_LABEL_CLASS}>
                              {t("modelWindowMaxOutput")}
                            </span>
                            <span className="ml-auto tabular-nums text-right text-foreground">
                              {log.model_max_output_tokens.toLocaleString()}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t border-divider/35 pt-4 xl:border-t-0 xl:border-l xl:border-divider/35 xl:pl-4 xl:pt-0">
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/78">
                  {t("billingDetails")}
                </div>
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
                        ? (cacheWriteTokens / 1_000_000) *
                          cacheWritePricePerMillion *
                          inputMultiplier
                        : null;

                    const cacheReadCost = log.cache_read_cost ?? computedCacheReadCost;
                    const cacheWriteCost = log.cache_write_cost ?? computedCacheWriteCost;

                    const renderFormulaLine = (options: {
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
                      return (
                        <span className="ml-auto flex min-w-0 flex-wrap justify-end gap-x-1 gap-y-0.5 text-right tabular-nums text-foreground">
                          <span className="whitespace-nowrap">{tokensLabel}</span>
                          <span className="whitespace-nowrap">*</span>
                          <span className="whitespace-nowrap">{priceLabel}</span>
                          <span className="whitespace-nowrap">/ 1M</span>
                          <span className="whitespace-nowrap">*</span>
                          <span className="whitespace-nowrap">{multiplierLabel}</span>
                          <span className="whitespace-nowrap">=</span>
                          <span className="whitespace-nowrap">{costLabel}</span>
                        </span>
                      );
                    };

                    const hasTierRule =
                      log.matched_rule_type === "tiered" || log.applied_tier_threshold != null;
                    const tierRuleSource = log.price_source ?? "litellm";

                    return (
                      <>
                        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-divider/40 pb-3">
                          <div className="space-y-1">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/78">
                              {t("billingTotalCostTitle")}
                            </div>
                            <span className="block tabular-nums text-lg text-foreground">
                              {formatBillingCost(log)}
                            </span>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] text-muted-foreground">
                              <span>
                                {t("billingRuleType")}:{" "}
                                <span className="text-foreground">
                                  {hasTierRule ? t("billingRuleTier") : t("billingRuleFlat")}
                                </span>
                              </span>
                              <span>
                                {t("billingPriceSource")}:{" "}
                                <span className="text-foreground">
                                  {tierRuleSource === "manual"
                                    ? t("billingSourceManual")
                                    : t("billingSourceSynced")}
                                </span>
                              </span>
                              {log.matched_rule_display_label ? (
                                <span>
                                  {t("billingRuleLabel")}:{" "}
                                  <span className="text-foreground">
                                    {log.matched_rule_display_label}
                                  </span>
                                </span>
                              ) : null}
                              {log.applied_tier_threshold != null ? (
                                <span>
                                  {t("billingThreshold")}:{" "}
                                  <span className="text-foreground">
                                    {log.applied_tier_threshold.toLocaleString()}
                                  </span>
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-cf-sm border border-divider/45 bg-surface-300/48 p-3">
                          <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/78">
                            {t("billingFormulaTitle")}
                          </div>
                          <div className={DETAIL_PANEL_STACK_CLASS}>
                            <div className={DETAIL_PANEL_ROW_CLASS}>
                              <span className={DETAIL_PANEL_LABEL_CLASS}>{t("tokenInput")}</span>
                              {renderFormulaLine({
                                tokens: billedInputTokens,
                                pricePerMillion: inputPricePerMillion,
                                multiplier: inputMultiplier,
                                cost: inputCost,
                              })}
                            </div>

                            <div className={DETAIL_PANEL_ROW_CLASS}>
                              <span className={DETAIL_PANEL_LABEL_CLASS}>{t("tokenOutput")}</span>
                              {renderFormulaLine({
                                tokens: completionTokens,
                                pricePerMillion: outputPricePerMillion,
                                multiplier: outputMultiplier,
                                cost: outputCost,
                              })}
                            </div>

                            {cacheReadTokens > 0 && (
                              <div className={DETAIL_PANEL_ROW_CLASS}>
                                <span className={DETAIL_PANEL_LABEL_CLASS}>
                                  {t("tokenCacheRead")}
                                </span>
                                {renderFormulaLine({
                                  tokens: cacheReadTokens,
                                  pricePerMillion: cacheReadPricePerMillion,
                                  multiplier: inputMultiplier,
                                  cost: cacheReadCost,
                                })}
                              </div>
                            )}

                            {cacheWriteTokens > 0 && (
                              <div className={DETAIL_PANEL_ROW_CLASS}>
                                <span className={DETAIL_PANEL_LABEL_CLASS}>
                                  {t("tokenCacheWrite")}
                                </span>
                                {renderFormulaLine({
                                  tokens: cacheWriteTokens,
                                  pricePerMillion: cacheWritePricePerMillion,
                                  multiplier: inputMultiplier,
                                  cost: cacheWriteCost,
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    );
                  })()
                ) : log.billing_status === "unbilled" ? (
                  <div className={DETAIL_PANEL_STACK_CLASS}>
                    <div className={DETAIL_PANEL_ROW_CLASS}>
                      <span className={DETAIL_PANEL_LABEL_CLASS}>{t("billingStatusLabel")}</span>
                      <span className="ml-auto tabular-nums text-status-warning">
                        {t("billingStatusUnbilled")}
                      </span>
                    </div>
                    <div className={DETAIL_PANEL_ROW_CLASS}>
                      <span className={DETAIL_PANEL_LABEL_CLASS}>{t("unbillableReason")}</span>
                      <span className="ml-auto text-status-warning">
                        {resolveBillingReasonLabel(log.unbillable_reason)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className={DETAIL_PANEL_MUTED_TEXT_CLASS}>{t("billingStatusPending")}</div>
                )}
              </div>
            </div>
          </div>
        </section>

        <ThinkingConfigPanel thinkingConfig={log.thinking_config} />

        {/* Header Diff Panel */}
        {log.header_diff && (
          <section className={DETAIL_PANEL_CLASS}>
            <div className={DETAIL_PANEL_HEADER_CLASS}>{t("headerDiffTitle")}</div>
            <div className={DETAIL_PANEL_BODY_CLASS}>
              <HeaderDiffPanel headerDiff={log.header_diff} />
            </div>
          </section>
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
    const hasThinkingConfig = !!log.thinking_config;
    const hasKeyIdentity = !!log.api_key_name || !!log.api_key_prefix;
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
      hasKeyIdentity ||
      hasThinkingConfig ||
      hasHeaderDiff ||
      displayTotalTokens > 0;
    const isNew = newLogIds.has(log.id);
    const isChanged = changedLogIds.has(log.id);
    const isError = hasErrorState(log);
    const reasoningEffort = getReasoningEffortLevel(log);
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
      isChanged,
      isError,
      reasoningEffort,
      upstreamDisplayName,
      failoverDurationMs,
      requestTps,
      displayTotalTokens,
    };
  };

  const desktopSections: Array<{
    key: string;
    rows: Array<{
      log: RequestLog;
      index: number;
      derived: ReturnType<typeof getLogDerived>;
    }>;
    expanded: {
      log: RequestLog;
      derived: ReturnType<typeof getLogDerived>;
    } | null;
  }> = [];

  if (!isMobileLayout) {
    let currentRows: Array<{
      log: RequestLog;
      index: number;
      derived: ReturnType<typeof getLogDerived>;
    }> = [];

    filteredLogs.forEach((log, index) => {
      const derived = getLogDerived(log);
      currentRows.push({ log, index, derived });

      if (derived.isExpanded && derived.canExpand) {
        desktopSections.push({
          key: `section-${log.id}`,
          rows: currentRows,
          expanded: { log, derived },
        });
        currentRows = [];
      }
    });

    if (currentRows.length > 0) {
      desktopSections.push({
        key: `section-tail-${currentRows[0]?.log.id ?? "empty"}`,
        rows: currentRows,
        expanded: null,
      });
    }
  }

  const desktopFixedColumnWidth =
    DESKTOP_TABLE_BASE_WIDTHS.expand +
    DESKTOP_TABLE_BASE_WIDTHS.time +
    DESKTOP_TABLE_BASE_WIDTHS.key +
    DESKTOP_TABLE_BASE_WIDTHS.method +
    DESKTOP_TABLE_BASE_WIDTHS.cost +
    DESKTOP_TABLE_BASE_WIDTHS.status +
    DESKTOP_TABLE_BASE_WIDTHS.duration +
    (desktopBreakpointState.md ? DESKTOP_TABLE_BASE_WIDTHS.tokens : 0) +
    (desktopBreakpointState.lg
      ? DESKTOP_TABLE_BASE_WIDTHS.upstream + DESKTOP_TABLE_BASE_WIDTHS.interfaceType
      : 0);
  const resolvedDesktopTableWidth =
    !isMobileLayout && desktopTableContainerElement ? desktopTableWidth : null;
  const desktopModelColumnWidth = desktopBreakpointState.xl
    ? Math.max(
        DESKTOP_MODEL_COLUMN_MIN_WIDTH,
        Math.min(
          DESKTOP_MODEL_COLUMN_MAX_WIDTH,
          (resolvedDesktopTableWidth ?? desktopFixedColumnWidth + DESKTOP_MODEL_COLUMN_MAX_WIDTH) -
            desktopFixedColumnWidth
        )
      )
    : DESKTOP_MODEL_COLUMN_MAX_WIDTH;
  const desktopTableMinWidth =
    desktopFixedColumnWidth + (desktopBreakpointState.xl ? desktopModelColumnWidth : 0);
  const desktopModelColumnStyle = { width: `${desktopModelColumnWidth}px` };
  const desktopTableStyle = { minWidth: `${desktopTableMinWidth}px` };

  if (logs.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center py-16 text-center",
          LOGS_SECTION_ENTER_CLASS
        )}
      >
        <div
          className={cn(
            "mb-4 flex h-14 w-14 items-center justify-center rounded-cf-md border border-divider bg-surface-300/80",
            LOGS_CARD_ENTER_CLASS
          )}
        >
          <ScrollText className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <h3 className="type-title-medium mb-2 text-foreground">{t("noLogs")}</h3>
        <p className="type-body-medium text-muted-foreground">{t("noLogsDesc")}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-cf-md border border-divider bg-surface-200/70",
        LOGS_SECTION_ENTER_CLASS
      )}
    >
      {/* Filter Controls */}
      <div
        className={cn("border-b border-divider bg-surface-200 p-4", LOGS_SECTION_ENTER_CLASS)}
        style={{ animationDelay: "40ms" }}
      >
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
            <TimeRangeSelector
              value={timeRangeFilter}
              onChange={(value) => setTimeRangeFilter(value as TimeRange)}
              hideCustom
            />
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
                "rounded-cf-sm border px-2 py-1 font-mono text-xs",
                LOGS_SURFACE_TRANSITION_CLASS,
                LOGS_INTERACTIVE_RAISE_CLASS,
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

      <div
        className={cn(
          "border-b border-divider bg-surface-200/70 px-4 py-3",
          LOGS_SECTION_ENTER_CLASS
        )}
        style={{ animationDelay: "90ms" }}
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <div
            className={cn(
              "rounded-cf-sm border border-divider bg-surface-300/80 px-3 py-2",
              LOGS_CARD_ENTER_CLASS,
              LOGS_SURFACE_TRANSITION_CLASS,
              LOGS_INTERACTIVE_RAISE_CLASS,
              hasLiveActivity && LOGS_LIVE_HIGHLIGHT_CLASS
            )}
            style={{ animationDelay: "130ms" }}
          >
            <p className="type-caption text-muted-foreground">{t("summaryP50Ttft")}</p>
            <p className="font-mono text-sm text-foreground">
              {formatSummaryTtft(performanceSummary.p50TtftMs)}
            </p>
          </div>
          <div
            className={cn(
              "rounded-cf-sm border border-divider bg-surface-300/80 px-3 py-2",
              LOGS_CARD_ENTER_CLASS,
              LOGS_SURFACE_TRANSITION_CLASS,
              LOGS_INTERACTIVE_RAISE_CLASS,
              hasLiveActivity && LOGS_LIVE_HIGHLIGHT_CLASS
            )}
            style={{ animationDelay: "170ms" }}
          >
            <p className="type-caption text-muted-foreground">{t("summaryP90Ttft")}</p>
            <p className="font-mono text-sm text-foreground">
              {formatSummaryTtft(performanceSummary.p90TtftMs)}
            </p>
          </div>
          <div
            className={cn(
              "rounded-cf-sm border border-divider bg-surface-300/80 px-3 py-2",
              LOGS_CARD_ENTER_CLASS,
              LOGS_SURFACE_TRANSITION_CLASS,
              LOGS_INTERACTIVE_RAISE_CLASS,
              hasLiveActivity && LOGS_LIVE_HIGHLIGHT_CLASS
            )}
            style={{ animationDelay: "210ms" }}
          >
            <p className="type-caption text-muted-foreground">{t("summaryP50Tps")}</p>
            <p className="font-mono text-sm text-foreground">
              {formatSummaryTps(performanceSummary.p50Tps)}
            </p>
          </div>
          <div
            className={cn(
              "rounded-cf-sm border border-divider bg-surface-300/80 px-3 py-2",
              LOGS_CARD_ENTER_CLASS,
              LOGS_SURFACE_TRANSITION_CLASS,
              LOGS_INTERACTIVE_RAISE_CLASS,
              hasLiveActivity && LOGS_LIVE_HIGHLIGHT_CLASS
            )}
            style={{ animationDelay: "250ms" }}
          >
            <p className="type-caption text-muted-foreground">{t("summarySlowRatio")}</p>
            <p className="font-mono text-sm text-foreground">
              {formatPercent(performanceSummary.slowRatio)}
            </p>
          </div>
          <div
            className={cn(
              "rounded-cf-sm border border-divider bg-surface-300/80 px-3 py-2",
              LOGS_CARD_ENTER_CLASS,
              LOGS_SURFACE_TRANSITION_CLASS,
              LOGS_INTERACTIVE_RAISE_CLASS,
              hasLiveActivity && LOGS_LIVE_HIGHLIGHT_CLASS
            )}
            style={{ animationDelay: "290ms" }}
          >
            <p className="type-caption text-muted-foreground">{t("summaryStreamRatio")}</p>
            <p className="font-mono text-sm text-foreground">
              {formatPercent(performanceSummary.streamRatio)}
            </p>
          </div>
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <div
          className={cn(
            "flex flex-col items-center justify-center py-16 text-center",
            LOGS_SECTION_ENTER_CLASS
          )}
        >
          <div
            className={cn(
              "mb-4 flex h-14 w-14 items-center justify-center rounded-cf-md border border-divider bg-surface-300/80",
              LOGS_CARD_ENTER_CLASS
            )}
          >
            <Filter className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
          </div>
          <h3 className="type-title-medium mb-2 text-foreground">{t("noMatchingLogs")}</h3>
          <p className="type-body-medium text-muted-foreground">{t("noMatchingLogsDesc")}</p>
        </div>
      ) : (
        <>
          {isMobileLayout ? (
            <TooltipProvider>
              <div className="space-y-3 p-3">
                {filteredLogs.map((log, index) => {
                  const {
                    isExpanded,
                    canExpand,
                    isNew,
                    isChanged,
                    isError,
                    reasoningEffort,
                    upstreamDisplayName,
                    failoverDurationMs,
                    requestTps,
                    displayTotalTokens,
                  } = getLogDerived(log);
                  const entryAnimationDelay = getLogEntryAnimationDelay(index);
                  const mobileEntryMotionClass =
                    isNew || isChanged ? LOGS_CARD_EMPHASIS_CLASS : LOGS_CARD_ENTER_CLASS;

                  return (
                    <div
                      key={log.id}
                      className={cn(
                        "rounded-cf-md border border-divider bg-surface-200/70 p-3 motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0",
                        LOGS_SURFACE_TRANSITION_CLASS,
                        mobileEntryMotionClass,
                        isError && "border-l-2 border-l-status-error/45",
                        (isNew || isChanged) && "bg-status-info-muted/25"
                      )}
                      style={{ animationDelay: entryAnimationDelay }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                            <span className="font-mono text-muted-foreground whitespace-nowrap">
                              {formatLogTimestamp(log.created_at)}
                            </span>
                            <div className="inline-flex min-w-0 items-center text-muted-foreground">
                              <span className="mr-1 shrink-0">•</span>
                              <RequestKeyIdentity
                                keyName={log.api_key_name}
                                keyPrefix={log.api_key_prefix}
                                compact
                                className="min-w-0 max-w-full"
                                textClassName="text-muted-foreground"
                              />
                            </div>
                            {upstreamDisplayName && (
                              <span className="min-w-0 text-muted-foreground break-all">
                                • {upstreamDisplayName}
                              </span>
                            )}
                            {log.model && (
                              <div className="inline-flex min-w-0 items-center text-muted-foreground">
                                <span className="mr-1 shrink-0">•</span>
                                <ModelIdentity
                                  label={log.model}
                                  reasoningEffort={reasoningEffort}
                                  thinkingConfig={log.thinking_config}
                                  compactBadges
                                  className="min-w-0 max-w-full"
                                  textClassName="text-muted-foreground"
                                />
                              </div>
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
                            {hasConcurrencyFullSignal(log) && (
                              <Badge
                                variant="warning"
                                className="px-1.5 py-0 text-[10px] leading-4"
                              >
                                {t("exclusionReason.concurrency_full")}
                              </Badge>
                            )}
                            {hasQueueSignal(log) ? (
                              <Badge
                                variant={getQueueStatusVariant(log.routing_decision!.queue!.status)}
                                className="px-1.5 py-0 text-[10px] leading-4"
                              >
                                {t("queueStatus." + log.routing_decision!.queue!.status)}
                              </Badge>
                            ) : null}
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
                                "flex min-h-6 min-w-6 items-center justify-center px-2 py-0.5 text-[11px] leading-none font-mono tabular-nums",
                                isLogInProgress(log) &&
                                  (isLive
                                    ? "border-status-info/30 bg-status-info-muted/25 text-status-info"
                                    : "text-muted-foreground")
                              )}
                              aria-label={
                                isLogInProgress(log) ? t("displayStatusInProgress") : undefined
                              }
                            >
                              {isLogInProgress(log) ? (
                                <Loader2 className="h-3 w-3 motion-safe:animate-spin motion-reduce:animate-none" />
                              ) : (
                                log.status_code
                              )}
                            </Badge>
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
                          className={cn(
                            "mt-3 inline-flex w-full items-center justify-between rounded-cf-sm border border-divider bg-surface-300/70 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-surface-300",
                            LOGS_COLOR_TRANSITION_CLASS
                          )}
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? t("collapseDetails") : t("expandDetails")}
                        >
                          <span>{isExpanded ? t("collapseDetails") : t("expandDetails")}</span>
                          <ExpandChevron expanded={isExpanded} />
                        </button>
                      )}

                      {isExpanded && canExpand && (
                        <div className={LOGS_DETAIL_ENTER_CLASS}>
                          {renderExpandedDetails({
                            log,
                            upstreamDisplayName,
                            failoverDurationMs,
                            requestTps,
                            isError,
                            className: "mt-3 border-t border-dashed border-divider pt-3",
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </TooltipProvider>
          ) : (
            <div ref={setDesktopTableContainerElement} className="overflow-x-auto bg-card">
              <TooltipProvider>
                {desktopSections.map((section, sectionIndex) => (
                  <Fragment key={section.key}>
                    <table
                      className="w-full table-fixed border-collapse text-sm text-foreground"
                      style={desktopTableStyle}
                    >
                      {sectionIndex === 0 ? (
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-9 px-1.5"></TableHead>
                            <TableHead className="w-[148px] px-1.5">{t("tableTime")}</TableHead>
                            <TableHead className="w-[148px] px-1.5">{t("tableKey")}</TableHead>
                            <TableHead className="hidden lg:table-cell w-[96px] px-1.5">
                              {t("tableUpstream")}
                            </TableHead>
                            <TableHead className="w-[60px] px-1.5">{t("tableMethod")}</TableHead>
                            <TableHead className="hidden lg:table-cell w-[84px] px-1.5 text-left whitespace-nowrap">
                              {t("tableInterfaceType")}
                            </TableHead>
                            <TableHead
                              className="hidden xl:table-cell px-1.5 pl-1"
                              style={desktopModelColumnStyle}
                            >
                              {t("tableModel")}
                            </TableHead>
                            <TableHead className="hidden md:table-cell w-[104px] px-1.5">
                              {t("tableTokens")}
                            </TableHead>
                            <TableHead className="w-[84px] px-1.5 text-right">
                              {t("tableCost")}
                            </TableHead>
                            <TableHead className="w-[68px] px-1.5">{t("tableStatus")}</TableHead>
                            <TableHead className="w-[112px] px-1.5">{t("tableDuration")}</TableHead>
                          </TableRow>
                        </TableHeader>
                      ) : null}
                      <TableBody>
                        {section.rows.map(({ log, index, derived }) => {
                          const {
                            isExpanded,
                            canExpand,
                            isNew,
                            isChanged,
                            isError,
                            reasoningEffort,
                            upstreamDisplayName,
                            requestTps,
                          } = derived;
                          const entryAnimationDelay = getLogEntryAnimationDelay(index);
                          const rowEntryMotionClass =
                            isNew || isChanged
                              ? LOGS_ROW_EMPHASIS_CLASS
                              : hasExpansionInteraction
                                ? ""
                                : LOGS_ROW_ENTER_CLASS;

                          return (
                            <TableRow
                              key={log.id}
                              className={cn(
                                rowEntryMotionClass,
                                LOGS_COLOR_TRANSITION_CLASS,
                                isError && "border-l-2 border-l-status-error/45",
                                (isNew || isChanged) && "bg-status-info-muted/25",
                                canExpand &&
                                  (isError
                                    ? "cursor-pointer hover:bg-status-error-muted/15"
                                    : "cursor-pointer hover:bg-surface-300/50"),
                                isExpanded && "bg-surface-300/55"
                              )}
                              style={{ animationDelay: entryAnimationDelay }}
                              onClick={() => canExpand && toggleRow(log.id)}
                            >
                              <TableCell className="px-1.5 py-1.5">
                                {canExpand && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleRow(log.id);
                                    }}
                                    className={cn(
                                      "rounded-cf-sm p-1 hover:bg-surface-300",
                                      LOGS_COLOR_TRANSITION_CLASS
                                    )}
                                    aria-label={
                                      isExpanded ? t("collapseDetails") : t("expandDetails")
                                    }
                                  >
                                    <ExpandChevron
                                      expanded={isExpanded}
                                      className="text-muted-foreground"
                                    />
                                  </button>
                                )}
                              </TableCell>
                              <TableCell className="w-[148px] font-mono text-[10px] whitespace-nowrap px-1.5 py-1.5">
                                {formatLogTimestamp(log.created_at)}
                              </TableCell>
                              <TableCell className="w-[148px] px-1.5 py-1.5 text-[10px] min-w-0">
                                <RequestKeyIdentity
                                  keyName={log.api_key_name}
                                  keyPrefix={log.api_key_prefix}
                                  compact
                                  className="min-w-0 w-full"
                                />
                              </TableCell>
                              <TableCell className="hidden lg:table-cell w-[96px] px-1.5 py-1.5 min-w-0 overflow-hidden text-[10px]">
                                <RoutingDecisionTimeline
                                  routingDecision={log.routing_decision}
                                  upstreamName={upstreamDisplayName}
                                  routingType={log.routing_type}
                                  groupName={log.group_name}
                                  failoverAttempts={log.failover_attempts}
                                  failoverHistory={log.failover_history}
                                  sessionId={log.session_id}
                                  affinityHit={log.affinity_hit}
                                  affinityMigrated={log.affinity_migrated}
                                  compact={true}
                                />
                              </TableCell>
                              <TableCell className="w-[60px] px-1.5 py-1">
                                <div className="flex flex-col items-start gap-0.5">
                                  <code className="rounded-cf-sm border border-divider bg-surface-300 px-1 py-0.5 font-mono text-[10px] text-foreground whitespace-nowrap">
                                    {log.method || "-"}
                                  </code>
                                  <RequestModeBadge isStream={log.is_stream} compact />
                                </div>
                              </TableCell>
                              <TableCell className="hidden text-[10px] lg:table-cell w-[84px] px-1.5 py-1 pr-1 min-w-0">
                                <InterfaceTypeCell
                                  method={log.method}
                                  path={log.path}
                                  matchedCapability={log.routing_decision?.matched_route_capability}
                                  variant="desktop"
                                />
                              </TableCell>
                              <TableCell
                                className="hidden font-mono text-[10px] xl:table-cell px-1.5 py-1 pl-1 min-w-0"
                                style={desktopModelColumnStyle}
                              >
                                {log.model ? (
                                  <ModelIdentity
                                    label={log.model}
                                    reasoningEffort={reasoningEffort}
                                    thinkingConfig={log.thinking_config}
                                    compactBadges
                                    className="min-w-0 w-full"
                                  />
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="hidden md:table-cell w-[104px] px-1.5 py-1 min-w-0 overflow-hidden text-[10px]">
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
                              <TableCell className="w-[84px] px-1.5 py-1 text-right">
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
                              <TableCell className="w-[68px] px-1.5 py-1">
                                <div className="flex flex-col items-start gap-1">
                                  <Badge
                                    variant={getStatusBadgeVariant(log.status_code)}
                                    className={cn(
                                      "flex min-h-5 min-w-5 items-center justify-center px-1.5 py-0.5 text-[10px] leading-none font-mono tabular-nums whitespace-nowrap",
                                      isLogInProgress(log) &&
                                        (isLive
                                          ? "border-status-info/30 bg-status-info-muted/25 text-status-info"
                                          : "text-muted-foreground")
                                    )}
                                    aria-label={
                                      isLogInProgress(log)
                                        ? t("displayStatusInProgress")
                                        : undefined
                                    }
                                  >
                                    {isLogInProgress(log) ? (
                                      <Loader2 className="h-3 w-3 motion-safe:animate-spin motion-reduce:animate-none" />
                                    ) : (
                                      log.status_code
                                    )}
                                  </Badge>
                                </div>
                              </TableCell>
                              <TableCell className="w-[112px] px-1.5 py-1 font-mono text-[10px] leading-tight">
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
                          );
                        })}
                      </TableBody>
                    </table>
                    {section.expanded ? (
                      <div
                        className={cn(
                          "border-t border-b border-divider bg-surface-200/35 px-4 py-3",
                          LOGS_DETAIL_ENTER_CLASS
                        )}
                      >
                        {renderExpandedDetails({
                          log: section.expanded.log,
                          upstreamDisplayName: section.expanded.derived.upstreamDisplayName,
                          failoverDurationMs: section.expanded.derived.failoverDurationMs,
                          requestTps: section.expanded.derived.requestTps,
                          isError: section.expanded.derived.isError,
                          className: "",
                        })}
                      </div>
                    ) : null}
                  </Fragment>
                ))}
              </TooltipProvider>
            </div>
          )}
        </>
      )}
    </div>
  );
}
