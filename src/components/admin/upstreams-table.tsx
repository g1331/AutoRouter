"use client";

import { formatDistanceToNow } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { useState, useMemo, Fragment, type SyntheticEvent } from "react";
import { Pencil, Trash2, Server, Play, ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { getDateLocale } from "@/lib/date-locale";
import { StatusLed, AsciiProgress, TerminalHeader, type LedStatus } from "@/components/ui/terminal";
import { cn } from "@/lib/utils";
import { useToggleUpstreamActive } from "@/hooks/use-upstreams";
import { useForceCircuitBreaker } from "@/hooks/use-circuit-breaker";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { RouteCapabilityBadges } from "@/components/admin/route-capability-badges";

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

  const handleRecoverCircuit = async (upstream: Upstream, e?: SyntheticEvent) => {
    e?.stopPropagation();
    try {
      await forceCircuitBreakerMutation.mutateAsync({
        upstreamId: upstream.id,
        action: "close",
      });
      toast.success(t("recoverCircuitBreakerSuccess"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("recoverCircuitBreakerFailed"));
    }
  };

  const handleToggleActive = async (upstream: Upstream, nextActive: boolean) => {
    if (nextActive === upstream.is_active) {
      return;
    }
    try {
      await toggleActiveMutation.mutateAsync({
        id: upstream.id,
        nextActive,
      });
    } catch {
      // Error toast handled in hook
    }
  };

  const renderDesktopActions = (upstream: Upstream) => (
    <div className="ml-auto inline-flex min-w-[10rem] items-center justify-end gap-1.5">
      {upstream.circuit_breaker && upstream.circuit_breaker.state !== "closed" ? (
        <Button
          variant="ghost"
          type="button"
          size="icon"
          className="h-6 w-6 text-status-error hover:bg-status-error-muted"
          onClick={(e) => {
            void handleRecoverCircuit(upstream, e);
          }}
          disabled={
            forceCircuitBreakerMutation.isPending &&
            forceCircuitBreakerMutation.variables?.upstreamId === upstream.id
          }
          aria-label={`${t("recoverCircuitBreaker")}: ${upstream.name}`}
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      ) : (
        <span className="h-6 w-6" aria-hidden="true" />
      )}
      <Switch
        checked={upstream.is_active}
        onClick={(e) => e.stopPropagation()}
        onCheckedChange={async (nextActive) => {
          await handleToggleActive(upstream, nextActive);
        }}
        disabled={
          toggleActiveMutation.isPending && toggleActiveMutation.variables?.id === upstream.id
        }
        className="h-5 w-10"
        aria-label={`${upstream.is_active ? t("quickDisable") : t("quickEnable")}: ${upstream.name}`}
      />
      <Button
        variant="ghost"
        size="icon"
        type="button"
        className="h-6 w-6 text-status-info hover:bg-status-info-muted"
        onClick={(e) => {
          e.stopPropagation();
          onTest(upstream);
        }}
        aria-label={`${tCommon("test")}: ${upstream.name}`}
      >
        <Play className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        className="h-6 w-6 text-foreground hover:bg-surface-400"
        onClick={(e) => {
          e.stopPropagation();
          onEdit(upstream);
        }}
        aria-label={`${tCommon("edit")}: ${upstream.name}`}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        className="h-6 w-6 text-status-error hover:bg-status-error-muted"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(upstream);
        }}
        aria-label={`${tCommon("delete")}: ${upstream.name}`}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </div>
  );

  // Shared action bar for mobile/tablet cards
  const renderActionBar = (upstream: Upstream) => {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-cf-sm border border-divider bg-surface-300/55 px-2.5 py-1.5">
        {upstream.circuit_breaker && upstream.circuit_breaker.state !== "closed" && (
          <Button
            variant="outline"
            type="button"
            size="sm"
            className="h-7 gap-1.5 border-status-error/50 bg-status-error-muted px-2.5 text-status-error hover:border-status-error"
            onClick={(e) => {
              void handleRecoverCircuit(upstream, e);
            }}
            disabled={
              forceCircuitBreakerMutation.isPending &&
              forceCircuitBreakerMutation.variables?.upstreamId === upstream.id
            }
            aria-label={`${t("recoverCircuitBreaker")}: ${upstream.name}`}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
        <div className="order-1 inline-flex items-center gap-2">
          <Switch
            checked={upstream.is_active}
            onClick={(e) => e.stopPropagation()}
            onCheckedChange={async (nextActive) => {
              await handleToggleActive(upstream, nextActive);
            }}
            disabled={
              toggleActiveMutation.isPending && toggleActiveMutation.variables?.id === upstream.id
            }
            className="h-5 w-10"
            aria-label={`${upstream.is_active ? t("quickDisable") : t("quickEnable")}: ${upstream.name}`}
          />
          <span
            className={cn(
              "text-xs",
              upstream.is_active ? "text-status-success" : "text-muted-foreground"
            )}
          >
            {upstream.is_active ? t("active") : t("inactive")}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="h-7 w-7 text-status-info hover:bg-status-info-muted"
            onClick={(e) => {
              e.stopPropagation();
              onTest(upstream);
            }}
            aria-label={`${tCommon("test")}: ${upstream.name}`}
          >
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="h-7 w-7 text-foreground hover:bg-surface-400"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(upstream);
            }}
            aria-label={`${tCommon("edit")}: ${upstream.name}`}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="h-7 w-7 text-status-error hover:bg-status-error-muted"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(upstream);
            }}
            aria-label={`${tCommon("delete")}: ${upstream.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    );
  };

  if (upstreams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-cf-md border border-divider bg-surface-300/80">
          <Server className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <h3 className="type-title-medium mb-2 text-foreground">{t("noUpstreams")}</h3>
        <p className="type-body-medium text-muted-foreground">{t("noUpstreamsDesc")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <div className="overflow-hidden rounded-cf-md border border-divider bg-card/92">
        {/* Terminal Header */}
        <TerminalHeader
          systemId="UPSTREAM_ARRAY"
          nodeCount={upstreams.length}
          className="border-0 border-b border-divider bg-transparent"
        />

        {/* Desktop: Table Layout */}
        <div className="hidden lg:block">
          <Table
            frame="none"
            containerClassName="rounded-none bg-transparent"
            className="w-full table-fixed"
          >
            <TableHeader>
              <TableRow>
                <TableHead className="w-[16%]">{tCommon("name")}</TableHead>
                <TableHead className="w-[24%]">{t("routeCapabilities")}</TableHead>
                <TableHead className="w-[9%]">{t("tableWeight")}</TableHead>
                <TableHead className="w-[10%]">{t("tableHealth")}</TableHead>
                <TableHead className="w-[11%]">{t("tableCircuitBreaker")}</TableHead>
                <TableHead className="w-[14%]">{t("tableBaseUrl")}</TableHead>
                <TableHead className="hidden w-[8%] text-right 2xl:table-cell">
                  {tCommon("createdAt")}
                </TableHead>
                <TableHead className="w-[170px] text-right">{tCommon("actions")}</TableHead>
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
                      <TableCell colSpan={8} className="py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-3">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:bg-surface-400"
                              aria-expanded={!isCollapsed}
                              aria-label={isCollapsed ? tCommon("expand") : tCommon("collapse")}
                            >
                              {isCollapsed ? (
                                <ChevronRight className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                            <span className="font-mono text-xs font-semibold tracking-wider text-foreground">
                              TIER P{tier.priority}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground">
                              ({tier.upstreams.length}{" "}
                              {tier.upstreams.length === 1 ? "upstream" : "upstreams"})
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center justify-end gap-3 font-mono text-xs">
                            {/* Health Summary */}
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <StatusLed status={getTierHealthLedStatus(tier.healthySummary)} />
                              <span className="text-muted-foreground">
                                {tier.healthySummary.healthy}/{tier.healthySummary.total} HEALTHY
                              </span>
                            </div>

                            {/* Circuit Summary */}
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <span className="text-muted-foreground">CIRCUIT:</span>
                              <AsciiProgress
                                value={tier.circuitSummary.closed}
                                max={tier.circuitSummary.total}
                                width={8}
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
                      tier.upstreams.map((upstream) => (
                        <Fragment key={upstream.id}>
                          {/* Data Row */}
                          <TableRow className="[&>td]:align-middle">
                            <TableCell className="font-medium pl-6 xl:pl-7">
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
                            <TableCell className="py-2.5">
                              <RouteCapabilityBadges
                                capabilities={upstream.route_capabilities}
                                className="max-w-full items-start gap-1 py-0.5"
                                badgeClassName="px-2 py-0.5 text-[11px] leading-4 xl:text-xs"
                              />
                            </TableCell>
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
                              <code className="block max-w-full truncate rounded-cf-sm border border-divider bg-surface-300 px-2 py-1 font-mono text-xs text-foreground">
                                {upstream.base_url}
                              </code>
                            </TableCell>
                            <TableCell className="hidden whitespace-nowrap pr-2 text-right 2xl:table-cell">
                              {formatDistanceToNow(new Date(upstream.created_at), {
                                addSuffix: true,
                                locale: dateLocale,
                              })}
                            </TableCell>
                            <TableCell className="min-w-[170px] pl-2 pr-4 text-right">
                              {renderDesktopActions(upstream)}
                            </TableCell>
                          </TableRow>
                        </Fragment>
                      ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Mobile/Tablet: Card Layout */}
        <div className="lg:hidden divide-y divide-dashed divide-divider">
          {tieredData.map((tier) => {
            const isCollapsed = collapsedTiers.has(tier.priority);

            return (
              <Fragment key={`tier-mobile-${tier.priority}`}>
                {/* Tier Header */}
                <div
                  className="flex cursor-pointer items-center justify-between bg-surface-300 px-3 py-2"
                  onClick={() => toggleTier(tier.priority)}
                >
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:bg-surface-400"
                      aria-expanded={!isCollapsed}
                      aria-label={isCollapsed ? tCommon("expand") : tCommon("collapse")}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                    <span className="font-mono text-xs font-semibold tracking-wider text-foreground">
                      TIER P{tier.priority}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      ({tier.upstreams.length})
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <StatusLed status={getTierHealthLedStatus(tier.healthySummary)} />
                    <span className="text-muted-foreground">
                      {tier.healthySummary.healthy}/{tier.healthySummary.total}
                    </span>
                  </div>
                </div>

                {/* Upstream Cards */}
                {!isCollapsed &&
                  tier.upstreams.map((upstream) => (
                    <div
                      key={upstream.id}
                      className="mx-2 my-2 space-y-2 rounded-cf-sm border border-surface-400/45 bg-surface-200/35 px-2.5 py-2.5"
                    >
                      {/* Card Header: Name + Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="font-mono text-xs text-foreground font-medium truncate">
                            {upstream.name}
                          </span>
                          <Badge
                            variant={upstream.is_active ? "success" : "neutral"}
                            className="min-w-[44px] justify-center shrink-0 text-[10px] px-1.5 py-0"
                          >
                            {upstream.is_active ? t("active") : t("inactive")}
                          </Badge>
                        </div>
                      </div>

                      <RouteCapabilityBadges
                        capabilities={upstream.route_capabilities}
                        className="mt-1.5 items-start gap-1.5"
                        badgeClassName="px-2 py-0.5 text-[11px] leading-4 sm:text-xs"
                      />

                      {/* Card Body: Stats Grid - aligned label:value pairs */}
                      <div className="grid grid-cols-1 gap-x-6 gap-y-1 font-mono text-[11px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="shrink-0 text-muted-foreground">{t("tableHealth")}</span>
                          <StatusLed
                            status={getHealthLedStatus(upstream)}
                            label={getHealthLabel(upstream)}
                            showLabel
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="shrink-0 text-muted-foreground">
                            {t("tableCircuitBreaker")}
                          </span>
                          <StatusLed
                            status={getCircuitLedStatus(upstream)}
                            label={getCircuitBreakerLabel(upstream)}
                            showLabel
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="shrink-0 text-muted-foreground">{t("tableWeight")}</span>
                          <AsciiProgress
                            value={upstream.weight}
                            max={tier.maxWeight}
                            width={8}
                            showValue
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="shrink-0 text-muted-foreground">
                            {tCommon("createdAt")}
                          </span>
                          <span className="text-foreground truncate text-right">
                            {formatDistanceToNow(new Date(upstream.created_at), {
                              addSuffix: true,
                              locale: dateLocale,
                            })}
                          </span>
                        </div>
                      </div>

                      {/* URL */}
                      <code className="block break-all rounded-cf-sm border border-divider bg-surface-300 px-2 py-1 font-mono text-[11px] text-foreground">
                        {upstream.base_url}
                      </code>

                      {/* Actions */}
                      {renderActionBar(upstream)}
                    </div>
                  ))}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
