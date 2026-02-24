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

  // Shared action bar between table and card views
  const renderActionBar = (upstream: Upstream) => (
    <div className="flex flex-wrap items-center gap-1.5 rounded-cf-sm border border-divider bg-surface-300/65 px-2 py-1">
      <div className="flex items-center gap-1.5 ml-auto">
        {upstream.circuit_breaker && upstream.circuit_breaker.state !== "closed" && (
          <>
            <Button
              variant="outline"
              type="button"
              size="sm"
              className={cn(
                "h-7 gap-1.5 px-2 text-status-error",
                "border-status-error/50 bg-status-error-muted hover:border-status-error"
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
                    error instanceof Error ? error.message : t("recoverCircuitBreakerFailed")
                  );
                }
              }}
              disabled={
                forceCircuitBreakerMutation.isPending &&
                forceCircuitBreakerMutation.variables?.upstreamId === upstream.id
              }
              aria-label={`${t("recoverCircuitBreaker")}: ${upstream.name}`}
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden text-xs lg:inline">{t("recoverCircuitBreaker")}</span>
            </Button>
            <span className="h-3 w-px bg-divider" aria-hidden="true" />
          </>
        )}
        <Button
          variant="secondary"
          size="sm"
          type="button"
          data-state={upstream.is_active ? "on" : "off"}
          className={cn(
            "h-7 gap-1.5 px-2",
            upstream.is_active ? "text-foreground" : "text-muted-foreground"
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
            toggleActiveMutation.isPending && toggleActiveMutation.variables?.id === upstream.id
          }
          aria-label={`${upstream.is_active ? t("quickDisable") : t("quickEnable")}: ${upstream.name}`}
        >
          <span
            className={
              upstream.is_active
                ? "h-2 w-2 rounded-full bg-status-success"
                : "h-2 w-2 rounded-full bg-muted-foreground"
            }
            aria-hidden="true"
          />
          {upstream.is_active ? (
            <PowerOff className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Power className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span className="hidden text-xs lg:inline">
            {upstream.is_active ? t("quickDisable") : t("quickEnable")}
          </span>
        </Button>
        <span className="h-3 w-px bg-divider" aria-hidden="true" />
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="h-7 w-7 text-green-500 hover:bg-green-500/10"
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
    </div>
  );

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
      <div className="overflow-hidden rounded-cf-md border border-divider bg-surface-200/70">
        {/* Terminal Header */}
        <TerminalHeader
          systemId="UPSTREAM_ARRAY"
          nodeCount={upstreams.length}
          className="border-0 rounded-none"
        />

        {/* Desktop: Table Layout */}
        <div className="hidden lg:block">
          <Table
            frame="none"
            containerClassName="rounded-none"
            className="table-fixed min-w-[1040px]"
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
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
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
                      tier.upstreams.map((upstream) => (
                        <Fragment key={upstream.id}>
                          {/* Data Row */}
                          <TableRow
                            className={cn(
                              "border-b-0 [&>td]:pb-0",
                              hasErrorState(upstream) &&
                                "shadow-[inset_0_0_20px_-10px_var(--status-error)]"
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
                              <code className="inline-block max-w-xs truncate rounded-cf-sm border border-divider bg-surface-300 px-2 py-1 font-mono text-xs text-foreground">
                                {upstream.base_url}
                              </code>
                            </TableCell>
                            <TableCell>
                              {formatDistanceToNow(new Date(upstream.created_at), {
                                addSuffix: true,
                                locale: dateLocale,
                              })}
                            </TableCell>
                          </TableRow>
                          {/* Actions Row */}
                          <TableRow>
                            <TableCell colSpan={8} className="pt-0 pb-1.5 px-4">
                              {renderActionBar(upstream)}
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
                  className="flex items-center justify-between px-3 py-2 bg-surface-300 cursor-pointer"
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
                    <span className="font-mono text-xs text-amber-500 font-semibold tracking-wider">
                      TIER P{tier.priority}
                    </span>
                    <span className="font-mono text-xs text-amber-700">
                      ({tier.upstreams.length})
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <StatusLed status={getTierHealthLedStatus(tier.healthySummary)} />
                    <span className="text-amber-600">
                      {tier.healthySummary.healthy}/{tier.healthySummary.total}
                    </span>
                  </div>
                </div>

                {/* Upstream Cards */}
                {!isCollapsed &&
                  tier.upstreams.map((upstream) => (
                    <div
                      key={upstream.id}
                      className={cn(
                        "mx-2 my-2 px-2.5 py-2 space-y-1.5",
                        "border border-surface-400/50 rounded-cf-sm bg-surface-200/30",
                        hasErrorState(upstream) &&
                          "shadow-[inset_0_0_20px_-10px_var(--status-error)]"
                      )}
                    >
                      {/* Card Header: Name + Badge + Provider */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
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
                        <span className="font-mono text-[10px] text-amber-600 shrink-0">
                          {formatProvider(upstream.provider_type)}
                        </span>
                      </div>

                      {/* Card Body: Stats Grid - aligned label:value pairs */}
                      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-6 gap-y-0.5 font-mono text-[11px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-amber-700 shrink-0">{t("tableHealth")}</span>
                          <StatusLed
                            status={getHealthLedStatus(upstream)}
                            label={getHealthLabel(upstream)}
                            showLabel
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-amber-700 shrink-0">
                            {t("tableCircuitBreaker")}
                          </span>
                          <StatusLed
                            status={getCircuitLedStatus(upstream)}
                            label={getCircuitBreakerLabel(upstream)}
                            showLabel
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-amber-700 shrink-0">{t("tableWeight")}</span>
                          <AsciiProgress
                            value={upstream.weight}
                            max={tier.maxWeight}
                            width={8}
                            showValue
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-amber-700 shrink-0">{tCommon("createdAt")}</span>
                          <span className="text-foreground truncate text-right">
                            {formatDistanceToNow(new Date(upstream.created_at), {
                              addSuffix: true,
                              locale: dateLocale,
                            })}
                          </span>
                        </div>
                      </div>

                      {/* URL */}
                      <code className="block truncate rounded-cf-sm border border-divider bg-surface-300 px-2 py-0.5 font-mono text-[11px] text-foreground">
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
