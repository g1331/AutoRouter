"use client";

import { formatDistanceToNow } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { useState, useMemo, Fragment } from "react";
import { Pencil, Trash2, Server, Play, ChevronDown, ChevronRight } from "lucide-react";
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
      {/* Terminal Header */}
      <TerminalHeader systemId="UPSTREAM_ARRAY" nodeCount={upstreams.length} />

      {/* Tiered Table */}
      <div className="border border-t-0 border-surface-400 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>{tCommon("name")}</TableHead>
              <TableHead>{t("providerType")}</TableHead>
              <TableHead>{t("tableWeight")}</TableHead>
              <TableHead>{t("tableHealth")}</TableHead>
              <TableHead>{t("tableCircuitBreaker")}</TableHead>
              <TableHead>{t("tableBaseUrl")}</TableHead>
              <TableHead>{tCommon("createdAt")}</TableHead>
              <TableHead className="text-right">{tCommon("actions")}</TableHead>
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
                        <TableCell className="font-medium">{upstream.name}</TableCell>
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
