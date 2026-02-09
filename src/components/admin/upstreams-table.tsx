"use client";

import { formatDistanceToNow } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { useState, useMemo, Fragment } from "react";
import {
  Pencil,
  Trash2,
  Server,
  Play,
  ChevronDown,
  ChevronRight,
  Power,
  PowerOff,
  ShieldCheck,
} from "lucide-react";
import type { Upstream } from "@/types/api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { getDateLocale } from "@/lib/date-locale";
import { StatusLed, AsciiProgress, TerminalHeader, type LedStatus } from "@/components/ui/terminal";
import { cn } from "@/lib/utils";
import { useToggleUpstreamActive } from "@/hooks/use-upstreams";
import { useForceCircuitBreaker } from "@/hooks/use-circuit-breaker";
import { toast } from "sonner";

interface UpstreamsTableProps {
  upstreams: Upstream[];
  onEdit: (upstream: Upstream) => void;
  onDelete: (upstream: Upstream) => void;
  onTest: (upstream: Upstream) => void;
}

interface TierGroup {
  priority: number;
  upstreams: Upstream[];
  healthySummary: { healthy: number; total: number };
  circuitSummary: { closed: number; total: number };
  maxWeight: number;
}

/**
 * Cassette Futurism Upstreams Data Table
 *
 * Terminal-style data display with:
 * - Priority tier collapsible sections
 * - LED status indicators
 * - ASCII progress bars for weight
 * - Mono font for URL data
 */
export function UpstreamsTable({ upstreams, onEdit, onDelete, onTest }: UpstreamsTableProps) {
  const t = useTranslations("upstreams");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

  const toggleActiveMutation = useToggleUpstreamActive();
  const forceCircuitBreakerMutation = useForceCircuitBreaker();

  // Track collapsed state for each tier
  const [collapsedTiers, setCollapsedTiers] = useState<Set<number>>(new Set());

  // Group upstreams by priority tier
  const tieredData = useMemo(() => {
    const tiers = new Map<number, Upstream[]>();

    upstreams.forEach((upstream) => {
      const key = upstream.priority ?? 0;
      if (!tiers.has(key)) {
        tiers.set(key, []);
      }
      tiers.get(key)!.push(upstream);
    });

    // Sort by priority (lowest number = highest priority)
    const sortedKeys = Array.from(tiers.keys()).sort((a, b) => a - b);

    const result: TierGroup[] = sortedKeys.map((key) => {
      const tierUpstreams = tiers.get(key)!;
      const healthyCount = tierUpstreams.filter((u) => u.health_status?.is_healthy).length;
      const closedCount = tierUpstreams.filter((u) => u.circuit_breaker?.state === "closed").length;
      const maxWeight = Math.max(...tierUpstreams.map((u) => u.weight));

      return {
        priority: key,
        upstreams: tierUpstreams,
        healthySummary: { healthy: healthyCount, total: tierUpstreams.length },
        circuitSummary: { closed: closedCount, total: tierUpstreams.length },
        maxWeight,
      };
    });

    return result;
  }, [upstreams]);

  const toggleTier = (priority: number) => {
    setCollapsedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(priority)) {
        next.delete(priority);
      } else {
        next.add(priority);
      }
      return next;
    });
  };

  const formatProvider = (providerType: string) => {
    const providerMap: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
      openai: { label: "OpenAI", variant: "success" },
      anthropic: { label: "Anthropic", variant: "secondary" },
      google: { label: "Google", variant: "warning" },
      custom: { label: "Custom", variant: "outline" },
    };

    const config = providerMap[providerType.toLowerCase()] || {
      label: providerType,
      variant: "neutral" as const,
    };

    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getHealthLedStatus = (upstream: Upstream): LedStatus => {
    if (!upstream.health_status) return "degraded";
    if (upstream.health_status.is_healthy) return "healthy";
    return "offline";
  };

  const getCircuitLedStatus = (upstream: Upstream): LedStatus => {
    if (!upstream.circuit_breaker) return "degraded";
    if (upstream.circuit_breaker.state === "closed") return "healthy";
    if (upstream.circuit_breaker.state === "open") return "offline";
    return "degraded"; // half_open
  };

  const getTierHealthLedStatus = (summary: { healthy: number; total: number }): LedStatus => {
    if (summary.healthy === summary.total) return "healthy";
    if (summary.healthy === 0) return "offline";
    return "degraded";
  };

  const getCircuitBreakerLabel = (upstream: Upstream): string => {
    if (!upstream.circuit_breaker) return t("circuitBreakerUnknown");
    if (upstream.circuit_breaker.state === "closed") return t("circuitBreakerClosed");
    if (upstream.circuit_breaker.state === "open") return t("circuitBreakerOpen");
    return t("circuitBreakerHalfOpen");
  };

  const getHealthLabel = (upstream: Upstream): string => {
    if (!upstream.health_status) return t("healthUnknown");
    if (upstream.health_status.is_healthy) return t("healthHealthy");
    return t("healthUnhealthy");
  };

  // Check if upstream has error state (unhealthy or circuit open)
  const hasErrorState = (upstream: Upstream): boolean => {
    return (
      upstream.health_status?.is_healthy === false || upstream.circuit_breaker?.state === "open"
    );
  };

  if (upstreams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-cf-sm bg-surface-300 border border-divider flex items-center justify-center mb-4">
          <Server className="w-8 h-8 text-amber-700" aria-hidden="true" />
        </div>
        <h3 className="font-mono text-lg text-amber-500 mb-2">{t("noUpstreams")}</h3>
        <p className="font-sans text-sm text-amber-700">{t("noUpstreamsDesc")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <div className="rounded-cf-sm border border-surface-400 overflow-hidden bg-surface-200">
        {/* Terminal Header */}
        <TerminalHeader
          systemId="UPSTREAM_ARRAY"
          nodeCount={upstreams.length}
          className="border-0 rounded-none"
        />

        {/* Tiered Table */}
        <Table
          frame="none"
          containerClassName="rounded-none"
          className="table-fixed min-w-[1200px]"
        >
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead className="w-[220px]">{tCommon("name")}</TableHead>
              <TableHead className="w-[120px]">{t("providerType")}</TableHead>
              <TableHead className="w-[120px]">{t("tableWeight")}</TableHead>
              <TableHead className="w-[150px]">{t("tableHealth")}</TableHead>
              <TableHead className="w-[170px]">{t("tableCircuitBreaker")}</TableHead>
              <TableHead className="w-[340px]">{t("tableBaseUrl")}</TableHead>
              <TableHead className="w-[150px]">{tCommon("createdAt")}</TableHead>
              <TableHead className="w-[330px] text-right">{tCommon("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tieredData.map((tier) => {
              const isCollapsed = collapsedTiers.has(tier.priority);

              return (
                <Fragment key={`tier-${tier.priority}`}>
                  {/* Tier Header Row */}
                  <TableRow
                    className="bg-surface-300 hover:bg-surface-300 cursor-pointer"
                    onClick={() => toggleTier(tier.priority)}
                  >
                    <TableCell colSpan={9} className="py-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-amber-500"
                            aria-expanded={!isCollapsed}
                            aria-label={isCollapsed ? tCommon("expand") : tCommon("collapse")}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                          <span className="font-mono text-xs text-amber-500 font-semibold tracking-wider">
                            TIER P{tier.priority}
                          </span>
                          <span className="font-mono text-xs text-amber-700">
                            ({tier.upstreams.length}{" "}
                            {tier.upstreams.length === 1 ? "upstream" : "upstreams"})
                          </span>
                        </div>

                        <div className="flex items-center gap-4 font-mono text-xs">
                          {/* Health Summary */}
                          <div className="flex items-center gap-2">
                            <StatusLed status={getTierHealthLedStatus(tier.healthySummary)} />
                            <span className="text-amber-600">
                              {tier.healthySummary.healthy}/{tier.healthySummary.total} HEALTHY
                            </span>
                          </div>

                          {/* Circuit Summary */}
                          <div className="flex items-center gap-2">
                            <span className="text-amber-600">CIRCUIT:</span>
                            <AsciiProgress
                              value={tier.circuitSummary.closed}
                              max={tier.circuitSummary.total}
                              width={10}
                              showPercentage
                              variant={
                                tier.circuitSummary.closed === tier.circuitSummary.total
                                  ? "success"
                                  : tier.circuitSummary.closed === 0
                                    ? "error"
                                    : "warning"
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Upstream Rows */}
                  {!isCollapsed &&
                    tier.upstreams.map((upstream, index) => (
                      <TableRow
                        key={upstream.id}
                        className={cn(
                          "motion-safe:animate-[cf-flicker-in_0.3s_ease-out]",
                          hasErrorState(upstream) &&
                            "shadow-[inset_0_0_20px_-10px_var(--status-error)]",
                          // Stagger animation delay
                          index === 0 && "motion-safe:[animation-delay:0ms]",
                          index === 1 && "motion-safe:[animation-delay:50ms]",
                          index === 2 && "motion-safe:[animation-delay:100ms]",
                          index >= 3 && "motion-safe:[animation-delay:150ms]"
                        )}
                      >
                        <TableCell></TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center justify-between gap-3 min-w-0">
                            <span className="truncate">{upstream.name}</span>
                            <Badge
                              variant={upstream.is_active ? "success" : "neutral"}
                              className="min-w-[52px] justify-center"
                            >
                              {upstream.is_active ? t("active") : t("inactive")}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>{formatProvider(upstream.provider_type)}</TableCell>
                        <TableCell>
                          <AsciiProgress
                            value={upstream.weight}
                            max={tier.maxWeight}
                            width={10}
                            showValue
                          />
                        </TableCell>
                        <TableCell>
                          <StatusLed
                            status={getHealthLedStatus(upstream)}
                            label={getHealthLabel(upstream)}
                            showLabel
                          />
                        </TableCell>
                        <TableCell>
                          <StatusLed
                            status={getCircuitLedStatus(upstream)}
                            label={getCircuitBreakerLabel(upstream)}
                            showLabel
                          />
                        </TableCell>
                        <TableCell>
                          <code className="px-2 py-1 bg-surface-300 text-amber-500 rounded-cf-sm font-mono text-xs border border-divider max-w-xs truncate inline-block">
                            {upstream.base_url}
                          </code>
                        </TableCell>
                        <TableCell>
                          {formatDistanceToNow(new Date(upstream.created_at), {
                            addSuffix: true,
                            locale: dateLocale,
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {upstream.circuit_breaker &&
                              upstream.circuit_breaker.state !== "closed" && (
                                <Button
                                  variant="ghost"
                                  type="button"
                                  size="sm"
                                  className={cn(
                                    "group relative h-8 px-2 overflow-hidden",
                                    "border-2 border-status-error/60 text-status-error",
                                    "bg-black-900/60 hover:bg-black-900/70",
                                    "cf-scanlines cf-data-scan cf-pulse-glow",
                                    "shadow-[inset_0_0_0_1px_rgba(220,38,38,0.12)]",
                                    "hover:shadow-cf-glow-error",
                                    "active:translate-y-[1px]"
                                  )}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
                                      await forceCircuitBreakerMutation.mutateAsync({
                                        upstreamId: upstream.id,
                                        action: "close",
                                      });
                                      toast.success(t("recoverCircuitBreakerSuccess"));
                                    } catch (error) {
                                      toast.error(
                                        error instanceof Error
                                          ? error.message
                                          : t("recoverCircuitBreakerFailed")
                                      );
                                    }
                                  }}
                                  disabled={
                                    forceCircuitBreakerMutation.isPending &&
                                    forceCircuitBreakerMutation.variables?.upstreamId ===
                                      upstream.id
                                  }
                                  aria-label={`${t("recoverCircuitBreaker")}: ${upstream.name}`}
                                >
                                  <span
                                    className="absolute inset-0 opacity-80"
                                    style={{
                                      background:
                                        "repeating-linear-gradient(135deg, rgba(220,38,38,0.14) 0px, rgba(220,38,38,0.14) 6px, transparent 6px, transparent 12px)",
                                    }}
                                    aria-hidden="true"
                                  />
                                  <span className="relative z-20 flex items-center gap-2">
                                    <StatusLed status="offline" className="scale-90" />
                                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                                    <span className="text-[11px] font-mono uppercase tracking-widest">
                                      {t("recoverCircuitBreaker")}
                                    </span>
                                  </span>
                                </Button>
                              )}
                            <Button
                              variant="ghost"
                              size="sm"
                              type="button"
                              data-state={upstream.is_active ? "on" : "off"}
                              className={cn(
                                "group relative h-8 px-2 overflow-hidden",
                                "border-2 bg-black-900/60 hover:bg-black-900/70",
                                "cf-scanlines cf-data-scan",
                                "shadow-[inset_0_0_0_1px_rgba(255,191,0,0.10)]",
                                "hover:shadow-cf-glow-subtle",
                                "active:translate-y-[1px]",
                                upstream.is_active
                                  ? "text-amber-400 border-amber-500/60"
                                  : "text-amber-600 border-amber-500/30"
                              )}
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await toggleActiveMutation.mutateAsync({
                                    id: upstream.id,
                                    nextActive: !upstream.is_active,
                                  });
                                } catch {
                                  // Error toast handled in hook
                                }
                              }}
                              disabled={
                                toggleActiveMutation.isPending &&
                                toggleActiveMutation.variables?.id === upstream.id
                              }
                              aria-label={`${upstream.is_active ? t("quickDisable") : t("quickEnable")}: ${upstream.name}`}
                            >
                              <span className="relative z-20 flex items-center gap-2">
                                <StatusLed
                                  status={upstream.is_active ? "healthy" : "degraded"}
                                  className="scale-90"
                                />
                                {upstream.is_active ? (
                                  <PowerOff className="h-4 w-4" aria-hidden="true" />
                                ) : (
                                  <Power className="h-4 w-4" aria-hidden="true" />
                                )}
                                <span className="text-[11px] font-mono uppercase tracking-widest">
                                  {upstream.is_active ? t("quickDisable") : t("quickEnable")}
                                </span>
                                <span className="ml-1 flex items-center gap-1" aria-hidden="true">
                                  <span
                                    className={cn(
                                      "relative h-[14px] w-[34px] rounded-cf-sm border border-amber-500/40 bg-black-900/70",
                                      "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.35)]"
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "absolute top-[1px] left-[1px] h-[10px] w-[14px] rounded-[2px]",
                                        "transition-transform duration-200 ease-out",
                                        "shadow-[0_0_10px_rgba(255,191,0,0.25)]",
                                        upstream.is_active
                                          ? "translate-x-0 bg-amber-500"
                                          : "translate-x-[16px] bg-surface-400"
                                      )}
                                    />
                                  </span>
                                </span>
                              </span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              className="h-8 w-8 text-green-500 hover:bg-green-500/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                onTest(upstream);
                              }}
                              aria-label={`${tCommon("test")}: ${upstream.name}`}
                            >
                              <Play className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              className="h-8 w-8 text-amber-500 hover:bg-amber-500/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                onEdit(upstream);
                              }}
                              aria-label={`${tCommon("edit")}: ${upstream.name}`}
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              className="h-8 w-8 text-status-error hover:bg-status-error-muted"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(upstream);
                              }}
                              aria-label={`${tCommon("delete")}: ${upstream.name}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
