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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RoutingDecisionLog, RoutingCircuitState } from "@/types/api";

interface RoutingDecisionDisplayProps {
  routingDecision: RoutingDecisionLog | null;
  upstreamName: string | null;
  routingType: string | null;
  groupName: string | null;
  failoverAttempts: number;
  compact?: boolean;
}

/**
 * Display routing decision information with visual indicators.
 * Supports compact view (table cell) and expanded view (details row).
 */
export function RoutingDecisionDisplay({
  routingDecision,
  upstreamName,
  routingType,
  groupName,
  failoverAttempts,
  compact = true,
}: RoutingDecisionDisplayProps) {
  const t = useTranslations("logs");

  // Compute visual indicators
  const indicators = useMemo(() => {
    if (!routingDecision)
      return { redirect: false, failover: false, excluded: false, lowCandidates: false };

    return {
      redirect: routingDecision.model_redirect_applied,
      failover: failoverAttempts > 0,
      excluded: routingDecision.excluded.length > 0,
      lowCandidates: routingDecision.final_candidate_count <= 1,
    };
  }, [routingDecision, failoverAttempts]);

  // Format routing type label
  const routingTypeLabel = useMemo(() => {
    if (!routingDecision) {
      if (!routingType) return null;
      // Fallback for logs without routing decision
      const labels: Record<string, string> = {
        auto: t("routingAuto"),
        direct: t("routingDirect"),
        group: t("routingGroup"),
        default: t("routingDefault"),
      };
      return labels[routingType] || routingType;
    }

    const labels: Record<string, string> = {
      provider_type: t("routingProviderType"),
      group: t("routingGroup"),
      none: t("routingNone"),
    };
    return labels[routingDecision.routing_type] || routingDecision.routing_type;
  }, [routingDecision, routingType, t]);

  // Format circuit state icon
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

  // Compact view for table cell
  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <div className="space-y-1 cursor-help">
              {/* Upstream name */}
              <div className="flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-amber-600" />
                <span className="font-mono text-xs">{upstreamName || "-"}</span>
              </div>

              {/* Routing info with indicators */}
              <div className="flex items-center gap-1 flex-wrap">
                {/* Routing type badge */}
                {routingTypeLabel && (
                  <Badge variant="success" className="text-[10px] px-1.5 py-0">
                    <Route className="w-3 h-3 mr-1" />
                    {routingTypeLabel}
                  </Badge>
                )}

                {/* Group name */}
                {groupName && (
                  <span className="text-[10px] text-amber-700 font-mono">{groupName}</span>
                )}

                {/* Candidate count */}
                {routingDecision && (
                  <span className="text-[10px] text-amber-600 font-mono">
                    {routingDecision.final_candidate_count}/{routingDecision.candidate_count}
                  </span>
                )}

                {/* Visual indicators */}
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
                </div>
              </div>
            </div>
          </TooltipTrigger>

          {/* Tooltip content */}
          <TooltipContent side="right" className="max-w-sm p-0">
            {routingDecision ? (
              <div className="p-3 space-y-3 text-xs">
                {/* Model resolution */}
                <div>
                  <div className="font-medium text-amber-500 mb-1">
                    {t("tooltipModelResolution")}
                  </div>
                  <div className="font-mono text-amber-700">
                    {routingDecision.original_model}
                    {routingDecision.model_redirect_applied && (
                      <>
                        <ChevronRight className="w-3 h-3 inline mx-1" />
                        <span className="text-blue-500">{routingDecision.resolved_model}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Candidates */}
                {routingDecision.candidates.length > 0 && (
                  <div>
                    <div className="font-medium text-amber-500 mb-1">
                      {t("tooltipCandidates")} ({routingDecision.candidates.length})
                    </div>
                    <div className="space-y-1">
                      {routingDecision.candidates.slice(0, 5).map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center gap-2 font-mono text-amber-700"
                        >
                          <CircuitStateIcon state={c.circuit_state} />
                          <span
                            className={cn(
                              c.id === routingDecision.selected_upstream_id &&
                                "text-amber-500 font-medium"
                            )}
                          >
                            {c.name}
                          </span>
                          <span className="text-amber-600">w:{c.weight}</span>
                        </div>
                      ))}
                      {routingDecision.candidates.length > 5 && (
                        <div className="text-amber-600">
                          +{routingDecision.candidates.length - 5} {t("more")}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Excluded */}
                {routingDecision.excluded.length > 0 && (
                  <div>
                    <div className="font-medium text-red-500 mb-1">
                      {t("tooltipExcluded")} ({routingDecision.excluded.length})
                    </div>
                    <div className="space-y-1">
                      {routingDecision.excluded.slice(0, 3).map((e) => (
                        <div
                          key={e.id}
                          className="flex items-center gap-2 font-mono text-amber-700"
                        >
                          <Lock className="w-3 h-3 text-red-500" />
                          <span>{e.name}</span>
                          <span className="text-red-500">{t(`exclusionReason.${e.reason}`)}</span>
                        </div>
                      ))}
                      {routingDecision.excluded.length > 3 && (
                        <div className="text-amber-600">
                          +{routingDecision.excluded.length - 3} {t("more")}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Selection strategy */}
                <div className="text-amber-600 font-mono">
                  {t("tooltipStrategy")}: {routingDecision.selection_strategy}
                </div>
              </div>
            ) : (
              <div className="p-3 text-xs text-amber-700">{t("noRoutingDecision")}</div>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Expanded view for details row
  return (
    <div className="space-y-4">
      {/* Model resolution section */}
      {routingDecision && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="font-medium text-amber-500 mb-2 text-xs">
              {t("tooltipModelResolution")}
            </div>
            <div className="font-mono text-xs text-amber-700">
              <span>{routingDecision.original_model}</span>
              {routingDecision.model_redirect_applied && (
                <>
                  <ChevronRight className="w-3 h-3 inline mx-1" />
                  <span className="text-blue-500">{routingDecision.resolved_model}</span>
                  <RefreshCw className="w-3 h-3 inline ml-1 text-blue-500" />
                </>
              )}
            </div>
          </div>

          <div>
            <div className="font-medium text-amber-500 mb-2 text-xs">{t("tooltipStrategy")}</div>
            <div className="font-mono text-xs text-amber-700">
              {routingDecision.selection_strategy} ({routingDecision.routing_type})
            </div>
          </div>
        </div>
      )}

      {/* Candidates and excluded in two columns */}
      {routingDecision && (
        <div className="grid grid-cols-2 gap-4">
          {/* Candidates */}
          <div>
            <div className="font-medium text-amber-500 mb-2 text-xs">
              {t("tooltipCandidates")} ({routingDecision.final_candidate_count}/
              {routingDecision.candidate_count})
            </div>
            <div className="space-y-1">
              {routingDecision.candidates.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "flex items-center gap-2 font-mono text-xs p-1 rounded",
                    c.id === routingDecision.selected_upstream_id && "bg-surface-300"
                  )}
                >
                  <CircuitStateIcon state={c.circuit_state} />
                  <span
                    className={cn(
                      "text-amber-700",
                      c.id === routingDecision.selected_upstream_id && "text-amber-500 font-medium"
                    )}
                  >
                    {c.name}
                  </span>
                  <span className="text-amber-600 ml-auto">w:{c.weight}</span>
                  <span className="text-amber-600 text-[10px]">{c.circuit_state}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Excluded */}
          {routingDecision.excluded.length > 0 && (
            <div>
              <div className="font-medium text-red-500 mb-2 text-xs">
                {t("tooltipExcluded")} ({routingDecision.excluded.length})
              </div>
              <div className="space-y-1">
                {routingDecision.excluded.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 font-mono text-xs p-1">
                    <Lock className="w-3 h-3 text-red-500" />
                    <span className="text-amber-700">{e.name}</span>
                    <Badge variant="error" className="text-[10px] px-1 py-0 ml-auto">
                      {t(`exclusionReason.${e.reason}`)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!routingDecision && <div className="text-xs text-amber-700">{t("noRoutingDecision")}</div>}
    </div>
  );
}
