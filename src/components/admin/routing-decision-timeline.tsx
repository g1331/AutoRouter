"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Server,
  Route,
  RefreshCw,
  Zap,
  Lock,
  AlertTriangle,
  ChevronRight,
  CircleSlash,
  CheckCircle2,
  CircleDot,
  Link2,
  ArrowUpRight,
  Clock,
  Timer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RoutingDecisionLog, RoutingCircuitState, FailoverAttempt } from "@/types/api";

interface RoutingDecisionTimelineProps {
  routingDecision: RoutingDecisionLog | null;
  upstreamName: string | null;
  routingType: string | null;
  groupName: string | null;
  failoverAttempts: number;
  failoverHistory?: FailoverAttempt[] | null;
  failoverDurationMs?: number | null;
  routingDurationMs?: number | null;
  durationMs?: number | null;
  statusCode?: number | null;
  cachedTokens?: number;
  cacheReadTokens?: number;
  sessionId?: string | null;
  affinityHit?: boolean;
  affinityMigrated?: boolean;
  compact?: boolean;
}

const MAX_RETRY_DISPLAY = 5;

const CircuitStateIcon = ({ state }: { state: RoutingCircuitState }) => {
  switch (state) {
    case "closed":
      return <CheckCircle2 className="w-3 h-3 text-status-success" />;
    case "open":
      return <CircleSlash className="w-3 h-3 text-status-error" />;
    case "half_open":
      return <CircleDot className="w-3 h-3 text-status-warning" />;
    default:
      return null;
  }
};

function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "-";
  const safe = Math.max(0, Math.round(ms));
  if (safe < 1000) return `${safe}ms`;
  return `${(safe / 1000).toFixed(2)}s`;
}

function truncateId(id: string | null | undefined, len = 12): string {
  if (!id) return "-";
  if (id.length <= len) return id;
  return id.slice(0, len) + "...";
}

/**
 * Decision timeline with 5 stages for routing visualization.
 * Replaces the old RoutingDecisionDisplay in expanded view.
 * Compact view provides a summary chain for table cells.
 */
export function RoutingDecisionTimeline({
  routingDecision,
  upstreamName,
  routingType,
  groupName,
  failoverAttempts,
  failoverHistory,
  failoverDurationMs,
  routingDurationMs,
  durationMs,
  statusCode,
  cachedTokens = 0,
  cacheReadTokens = 0,
  sessionId,
  affinityHit,
  affinityMigrated,
  compact = true,
}: RoutingDecisionTimelineProps) {
  const t = useTranslations("logs");

  const indicators = useMemo(() => {
    if (!routingDecision)
      return {
        redirect: false,
        failover: false,
        excluded: false,
        lowCandidates: false,
        affinityHit: false,
        affinityMigrated: false,
      };

    return {
      redirect: routingDecision.model_redirect_applied,
      failover: failoverAttempts > 0,
      excluded: routingDecision.excluded.length > 0,
      lowCandidates: routingDecision.final_candidate_count <= 1,
      affinityHit: affinityHit === true,
      affinityMigrated: affinityMigrated === true,
    };
  }, [routingDecision, failoverAttempts, affinityHit, affinityMigrated]);

  const routingTypeLabel = useMemo(() => {
    if (!routingDecision) {
      if (!routingType) return null;
      const labels: Record<string, string> = {
        auto: t("routingAuto"),
        direct: t("routingDirect"),
        tiered: t("routingTiered"),
        group: t("routingGroup"),
        default: t("routingDefault"),
      };
      return labels[routingType] || routingType;
    }
    const labels: Record<string, string> = {
      provider_type: t("routingProviderType"),
      tiered: t("routingTiered"),
      none: t("routingNone"),
    };
    return labels[routingDecision.routing_type] || routingDecision.routing_type;
  }, [routingDecision, routingType, t]);

  // ---------- Compact View ----------
  if (compact) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5 text-amber-600" />
          <span className="font-mono text-xs">{upstreamName || "-"}</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {routingTypeLabel && (
            <Badge variant="success" className="text-[11px] px-1.5 py-0">
              <Route className="w-3 h-3 mr-1" />
              {routingTypeLabel}
            </Badge>
          )}
          {groupName && <span className="text-[11px] text-amber-700 font-mono">{groupName}</span>}
          {routingDecision && (
            <span className="text-[11px] text-amber-600 font-mono">
              {routingDecision.final_candidate_count}/{routingDecision.candidate_count}
            </span>
          )}
          <div className="flex items-center gap-0.5 ml-1">
            {indicators.redirect && (
              <span title={t("indicatorRedirect")}>
                <RefreshCw className="w-3 h-3 text-blue-500" />
              </span>
            )}
            {indicators.failover && (
              <span title={t("indicatorFailover")}>
                <Zap className="w-3 h-3 text-orange-500" />
              </span>
            )}
            {indicators.excluded && (
              <span title={t("indicatorExcluded")}>
                <Lock className="w-3 h-3 text-red-500" />
              </span>
            )}
            {indicators.lowCandidates && (
              <span title={t("indicatorLowCandidates")}>
                <AlertTriangle className="w-3 h-3 text-amber-500" />
              </span>
            )}
            {indicators.affinityHit && !indicators.affinityMigrated && (
              <span title={t("timelineAffinityHit")}>
                <Link2 className="w-3 h-3 text-status-success" />
              </span>
            )}
            {indicators.affinityMigrated && (
              <span title={t("timelineAffinityMigrated")}>
                <ArrowUpRight className="w-3 h-3 text-amber-500" />
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- Expanded View: 5-Stage Timeline ----------
  const hasSession = !!sessionId;
  const hasFailover = failoverAttempts > 0 && failoverHistory && failoverHistory.length > 0;
  const isSuccess =
    statusCode !== null && statusCode !== undefined && statusCode >= 200 && statusCode < 300;

  return (
    <div className="space-y-0 font-mono text-xs">
      {/* Stage 1: Model Resolution */}
      {routingDecision && (
        <TimelineStage number={1} label={t("timelineModelResolution")}>
          <div className="text-amber-700">
            <span>{routingDecision.original_model}</span>
            {routingDecision.model_redirect_applied ? (
              <>
                <ChevronRight className="w-3 h-3 inline mx-1" />
                <span className="text-blue-500">{routingDecision.resolved_model}</span>
                <RefreshCw className="w-3 h-3 inline ml-1 text-blue-500" />
              </>
            ) : (
              <span className="text-amber-600 ml-2">({t("timelineNoRedirect")})</span>
            )}
          </div>
        </TimelineStage>
      )}

      {/* Stage 2: Session Affinity */}
      <TimelineStage number={2} label={t("timelineSessionAffinity")}>
        {hasSession ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-amber-700">
              <span className="text-amber-600">{t("timelineSessionId")}:</span>
              <span title={sessionId!} className="cursor-help">
                {truncateId(sessionId)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {affinityHit && !affinityMigrated && (
                <span className="text-status-success flex items-center gap-1">
                  <Link2 className="w-3 h-3" />
                  {t("timelineAffinityHit")}
                </span>
              )}
              {affinityHit && affinityMigrated && (
                <span className="text-amber-500 flex items-center gap-1">
                  <ArrowUpRight className="w-3 h-3" />
                  {t("timelineAffinityMigrated")}
                </span>
              )}
              {!affinityHit && (
                <span className="text-amber-700 flex items-center gap-1">
                  {t("timelineAffinityMissed")}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="text-amber-700">{t("timelineNoSession")}</div>
        )}
      </TimelineStage>

      {/* Stage 3: Upstream Selection */}
      {routingDecision && (
        <TimelineStage number={3} label={t("timelineUpstreamSelection")}>
          <div className="space-y-1">
            <div className="text-amber-600 mb-1">
              {t("tooltipStrategy")}: {routingDecision.selection_strategy} (
              {routingDecision.routing_type})
              <span className="ml-2">
                {routingDecision.final_candidate_count}/{routingDecision.candidate_count}{" "}
                {t("tooltipCandidates").toLowerCase()}
              </span>
            </div>
            {routingDecision.candidates.map((c) => {
              const isSelected = c.id === routingDecision.selected_upstream_id;
              return (
                <div
                  key={c.id}
                  className={cn(
                    "flex items-center gap-2 p-1 rounded",
                    isSelected && "bg-surface-300"
                  )}
                >
                  {isSelected ? (
                    <span className="text-amber-500">●</span>
                  ) : (
                    <span className="text-amber-700">○</span>
                  )}
                  <CircuitStateIcon state={c.circuit_state} />
                  <span
                    className={cn("text-amber-700", isSelected && "text-amber-500 font-medium")}
                  >
                    {c.name}
                  </span>
                  <span className="text-amber-600 ml-auto">w:{c.weight}</span>
                  <span className="text-amber-600 text-[11px]">
                    {t(`circuitState.${c.circuit_state}`)}
                  </span>
                  {isSelected && (
                    <Badge variant="success" className="text-[11px] px-1 py-0">
                      {t("timelineSelected")}
                    </Badge>
                  )}
                </div>
              );
            })}
            {routingDecision.excluded.length > 0 && (
              <div className="mt-2">
                <div className="font-medium text-red-500 mb-1 text-[11px] uppercase">
                  {t("tooltipExcluded")} ({routingDecision.excluded.length})
                </div>
                {routingDecision.excluded.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 p-1">
                    <span className="text-red-500">&#x2717;</span>
                    <Lock className="w-3 h-3 text-red-500" />
                    <span className="text-amber-700">{e.name}</span>
                    <Badge variant="error" className="text-[11px] px-1 py-0 ml-auto">
                      {t(`exclusionReason.${e.reason}`)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TimelineStage>
      )}

      {/* Stage 4: Execution & Retries */}
      <TimelineStage number={4} label={t("timelineExecutionRetries")}>
        {hasFailover ? (
          <RetryTimeline
            failoverHistory={failoverHistory!}
            failoverDurationMs={failoverDurationMs ?? null}
          />
        ) : (
          <div className="text-amber-700">{t("timelineDirectSuccess")}</div>
        )}
      </TimelineStage>

      {/* Stage 5: Final Result */}
      <TimelineStage number={5} label={t("timelineFinalResult")} isLast>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Server className="w-3 h-3 text-amber-600" />
            <span className="text-amber-700">{t("timelineFinalUpstream")}:</span>
            <span
              className={cn("font-medium", isSuccess ? "text-status-success" : "text-status-error")}
            >
              {upstreamName || "-"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Timer className="w-3 h-3 text-amber-600" />
            <span className="text-amber-700">{t("timelineTotalDuration")}:</span>
            <span className="text-amber-500">{formatMs(durationMs)}</span>
          </div>
          {routingDurationMs != null && durationMs != null && (
            <>
              <div className="flex items-center gap-2 pl-5">
                <span className="text-amber-600">{t("timelineRoutingOverhead")}:</span>
                <span className="text-orange-500">{formatMs(routingDurationMs)}</span>
              </div>
              <div className="flex items-center gap-2 pl-5">
                <span className="text-amber-600">{t("timelineUpstreamLatency")}:</span>
                <span className="text-status-success">
                  {formatMs(Math.max(0, durationMs - routingDurationMs))}
                </span>
              </div>
            </>
          )}
          {(cachedTokens > 0 || cacheReadTokens > 0) && (
            <div className="flex items-center gap-2">
              <span className="text-amber-700">{t("timelineCacheEffect")}:</span>
              <span className="text-blue-500">
                {(cacheReadTokens || cachedTokens).toLocaleString()} tokens
              </span>
            </div>
          )}
        </div>
      </TimelineStage>
    </div>
  );
}

// ---------- Timeline Stage wrapper ----------

function TimelineStage({
  number,
  label,
  isLast = false,
  children,
}: {
  number: number;
  label: string;
  isLast?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("relative pl-8", !isLast && "pb-3")}>
      {/* Vertical connector line */}
      {!isLast && (
        <div className="absolute left-[11px] top-7 bottom-0 w-px border-l border-dashed border-surface-500" />
      )}
      {/* Stage header with CSS circle number */}
      <div className="flex items-center gap-2 mb-1">
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-black font-bold text-[10px]">
          {number}
        </span>
        <span className="font-semibold text-amber-500 uppercase text-xs tracking-wider">
          {label}
        </span>
      </div>
      {/* Stage content */}
      <div className="text-amber-700">{children}</div>
    </div>
  );
}

// ---------- Retry Timeline sub-component ----------

function RetryTimeline({
  failoverHistory,
  failoverDurationMs,
}: {
  failoverHistory: FailoverAttempt[];
  failoverDurationMs: number | null;
}) {
  const t = useTranslations("logs");

  const displayAttempts = failoverHistory.slice(0, MAX_RETRY_DISPLAY);
  const hiddenCount = failoverHistory.length - displayAttempts.length;

  const errorTypeIcon = (errorType: FailoverAttempt["error_type"]) => {
    switch (errorType) {
      case "timeout":
        return <Clock className="w-3 h-3 text-amber-600" />;
      case "http_5xx":
        return <Zap className="w-3 h-3 text-status-error" />;
      case "http_429":
        return <AlertTriangle className="w-3 h-3 text-orange-500" />;
      case "http_4xx":
        return <AlertTriangle className="w-3 h-3 text-red-400" />;
      case "connection_error":
        return <CircleSlash className="w-3 h-3 text-red-500" />;
      case "circuit_open":
        return <Lock className="w-3 h-3 text-amber-500" />;
      default:
        return <Zap className="w-3 h-3 text-status-error" />;
    }
  };

  const formatAttemptTime = (isoStr: string): string => {
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return isoStr;
    return d.toLocaleTimeString(undefined, {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    } as Intl.DateTimeFormatOptions);
  };

  return (
    <div className="space-y-2">
      {displayAttempts.map((attempt, idx) => {
        const attemptNum = idx + 1;
        const statusLabel = attempt.status_code
          ? `${attempt.error_type}/${attempt.status_code}`
          : attempt.error_type;

        return (
          <div key={idx} className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-amber-500 font-medium">
                {t("retryAttempt")} {attemptNum}
              </span>
            </div>
            <div className="pl-2 space-y-0.5">
              <div className="flex items-center gap-2 text-amber-700">
                <span className="tabular-nums">{formatAttemptTime(attempt.attempted_at)}</span>
                <span>{attempt.upstream_name}</span>
                <span className="text-amber-500">●</span>
              </div>
              <div className="flex items-center gap-2">
                {errorTypeIcon(attempt.error_type)}
                <span
                  className={cn(
                    "tabular-nums",
                    attempt.error_type === "http_5xx" && "text-status-error",
                    attempt.error_type === "timeout" && "text-amber-600",
                    attempt.error_type === "http_429" && "text-orange-500"
                  )}
                >
                  [{statusLabel}]
                </span>
                <span className="text-amber-700">{t("retryFailoverTriggered")}</span>
              </div>
              {attempt.error_message && (
                <div
                  className="text-amber-700 text-[11px] pl-5 truncate max-w-md"
                  title={attempt.error_message}
                >
                  {attempt.error_message}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {hiddenCount > 0 && (
        <div className="text-amber-600 text-[11px]">
          {t("retryHiddenAttempts", { count: hiddenCount })}
        </div>
      )}

      {/* Summary bar */}
      <div className="border-t border-dashed border-surface-500 pt-1 mt-1">
        <div className="flex items-center gap-2 text-amber-600">
          <Timer className="w-3 h-3" />
          <span>
            {t("retryTotalDuration")}: {formatMs(failoverDurationMs)}
          </span>
          <span className="text-amber-700">
            ({failoverHistory.length} {t("retryAttemptsSummary")})
          </span>
        </div>
      </div>
    </div>
  );
}
