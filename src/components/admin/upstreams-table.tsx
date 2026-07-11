"use client";

import { formatDistanceToNow } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import {
  ChevronDown,
  Clock,
  ExternalLink,
  Pencil,
  PlugZap,
  Server,
  ShieldCheck,
  Trash2,
  Wallet,
} from "lucide-react";
import type { Upstream } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDateLocale } from "@/lib/date-locale";
import { AsciiProgress, type ProgressVariant } from "@/components/ui/terminal";
import { StatusLed, type StatusLedTone } from "@/components/ui/status-led";
import { StateChip } from "@/components/ui/state-chip";
import { statusTone } from "@/lib/status-tone";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/navigation";
import { useToggleUpstreamActive, useUpstreamQuota } from "@/hooks/use-upstreams";
import { useForceCircuitBreaker } from "@/hooks/use-circuit-breaker";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { RouteCapabilityBadges } from "@/components/admin/route-capability-badges";

interface UpstreamsTableProps {
  upstreams: Upstream[];
  onDelete: (upstream: Upstream, source: HTMLElement | null) => void;
  onTest: (upstream: Upstream) => void;
  density?: "comfortable" | "compact";
  hasActiveFilters?: boolean;
}

interface QuotaRule {
  period_type: "daily" | "monthly" | "rolling";
  period_hours: number | null;
  current_spending: number;
  spending_limit: number;
  percent_used: number;
  is_exceeded: boolean;
  resets_at: string | null;
  estimated_recovery_at: string | null;
}

interface TierSummary {
  operational: number;
  total: number;
  active: number;
  concurrencyFull: number;
  quotaExceeded: number;
}

interface TierGroup {
  priority: number;
  upstreams: Upstream[];
  summary: TierSummary;
}

type RuntimeStatus = "healthy" | "degraded" | "offline";

const RUNTIME_TONE: Record<RuntimeStatus, StatusLedTone> = {
  healthy: "ok",
  degraded: "warn",
  offline: "bad",
};

const TIER_COLLAPSE_ANIMATION_MS = 260;

export function UpstreamsTable({
  upstreams,
  onDelete,
  onTest,
  density = "comfortable",
  hasActiveFilters = false,
}: UpstreamsTableProps) {
  const t = useTranslations("upstreams");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
  const [collapsedTiers, setCollapsedTiers] = useState<Set<number>>(new Set());
  const [closingTiers, setClosingTiers] = useState<Set<number>>(new Set());
  const [openingTiers, setOpeningTiers] = useState<Set<number>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const collapseTimersRef = useRef<Map<number, number>>(new Map());
  const openFramesRef = useRef<Map<number, number>>(new Map());
  const isCompactDensity = density === "compact";

  const toggleActiveMutation = useToggleUpstreamActive();
  const forceCircuitBreakerMutation = useForceCircuitBreaker();
  const { data: quotaData } = useUpstreamQuota();

  const quotaMap = useMemo(() => {
    const map = new Map<
      string,
      {
        is_exceeded: boolean;
        rules: QuotaRule[];
      }
    >();

    if (quotaData?.items) {
      for (const item of quotaData.items) {
        map.set(item.upstream_id, {
          is_exceeded: item.is_exceeded,
          rules: item.rules,
        });
      }
    }

    return map;
  }, [quotaData]);

  const tieredData = useMemo(() => {
    const tiers = new Map<number, Upstream[]>();

    for (const upstream of upstreams) {
      const key = upstream.priority ?? 0;
      if (!tiers.has(key)) {
        tiers.set(key, []);
      }
      tiers.get(key)!.push(upstream);
    }

    return Array.from(tiers.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([priority, tierUpstreams]) => {
        const summary: TierSummary = {
          operational: tierUpstreams.filter((upstream) => {
            const concurrencyFull =
              upstream.max_concurrency != null &&
              (upstream.current_concurrency ?? 0) >= upstream.max_concurrency;
            return (
              upstream.is_active &&
              upstream.circuit_breaker?.state !== "open" &&
              !concurrencyFull &&
              !quotaMap.get(upstream.id)?.is_exceeded
            );
          }).length,
          total: tierUpstreams.length,
          active: tierUpstreams.filter((upstream) => upstream.is_active).length,
          concurrencyFull: tierUpstreams.filter((upstream) => {
            if (upstream.max_concurrency == null) return false;
            return (upstream.current_concurrency ?? 0) >= upstream.max_concurrency;
          }).length,
          quotaExceeded: tierUpstreams.filter((upstream) => quotaMap.get(upstream.id)?.is_exceeded)
            .length,
        };

        return {
          priority,
          upstreams: tierUpstreams,
          summary,
        } satisfies TierGroup;
      });
  }, [quotaMap, upstreams]);

  useEffect(() => {
    const collapseTimers = collapseTimersRef.current;
    const openFrames = openFramesRef.current;
    return () => {
      for (const timer of collapseTimers.values()) {
        window.clearTimeout(timer);
      }
      for (const frame of openFrames.values()) {
        window.cancelAnimationFrame(frame);
      }
      collapseTimers.clear();
      openFrames.clear();
    };
  }, []);

  const clearCollapseTimer = (priority: number) => {
    const existingTimer = collapseTimersRef.current.get(priority);
    if (existingTimer != null) {
      window.clearTimeout(existingTimer);
      collapseTimersRef.current.delete(priority);
    }
  };

  const clearOpenFrame = (priority: number) => {
    const existingFrame = openFramesRef.current.get(priority);
    if (existingFrame != null) {
      window.cancelAnimationFrame(existingFrame);
      openFramesRef.current.delete(priority);
    }
  };

  const toggleTier = (priority: number) => {
    const isCollapsed = collapsedTiers.has(priority);
    const isClosing = closingTiers.has(priority);
    const isOpening = openingTiers.has(priority);

    clearCollapseTimer(priority);
    clearOpenFrame(priority);

    if (isCollapsed || isClosing) {
      setClosingTiers((prev) => {
        const next = new Set(prev);
        next.delete(priority);
        return next;
      });
      setCollapsedTiers((prev) => {
        const next = new Set(prev);
        next.delete(priority);
        return next;
      });

      setOpeningTiers((prev) => {
        const next = new Set(prev);
        next.add(priority);
        return next;
      });

      const frame = window.requestAnimationFrame(() => {
        setOpeningTiers((prev) => {
          const next = new Set(prev);
          next.delete(priority);
          return next;
        });
        openFramesRef.current.delete(priority);
      });
      openFramesRef.current.set(priority, frame);
      return;
    }

    if (isOpening) {
      setOpeningTiers((prev) => {
        const next = new Set(prev);
        next.delete(priority);
        return next;
      });
    }

    setClosingTiers((prev) => {
      const next = new Set(prev);
      next.add(priority);
      return next;
    });

    const timer = window.setTimeout(() => {
      setClosingTiers((prev) => {
        const next = new Set(prev);
        next.delete(priority);
        return next;
      });
      setCollapsedTiers((prev) => {
        const next = new Set(prev);
        next.add(priority);
        return next;
      });
      collapseTimersRef.current.delete(priority);
    }, TIER_COLLAPSE_ANIMATION_MS);
    collapseTimersRef.current.set(priority, timer);
  };

  const toggleRow = (upstreamId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(upstreamId)) {
        next.delete(upstreamId);
      } else {
        next.add(upstreamId);
      }
      return next;
    });
  };

  const getRuntimeStatus = (upstream: Upstream): RuntimeStatus => {
    const concurrencyFull =
      upstream.max_concurrency != null &&
      (upstream.current_concurrency ?? 0) >= upstream.max_concurrency;
    if (!upstream.is_active || upstream.circuit_breaker?.state === "open") return "offline";
    if (concurrencyFull || quotaMap.get(upstream.id)?.is_exceeded) return "degraded";
    return "healthy";
  };

  const getRuntimeLabel = (upstream: Upstream): string => {
    const concurrencyFull =
      upstream.max_concurrency != null &&
      (upstream.current_concurrency ?? 0) >= upstream.max_concurrency;
    if (!upstream.is_active) return t("inactive");
    if (upstream.circuit_breaker?.state === "open") return t("circuitBreakerOpen");
    if (quotaMap.get(upstream.id)?.is_exceeded) return t("quotaExceeded");
    if (concurrencyFull) return t("concurrencyFullStatus");
    return t("runtimeAvailable");
  };

  const getTierRuntimeStatus = (summary: TierSummary): RuntimeStatus => {
    if (summary.operational === summary.total) return "healthy";
    if (summary.operational === 0) return "offline";
    return "degraded";
  };

  const getConcurrencyInfo = (upstream: Upstream) => {
    const current = upstream.current_concurrency ?? 0;
    const max = upstream.max_concurrency;
    const unlimited = max == null;
    const full = !unlimited && current >= max;
    return {
      current,
      max,
      unlimited,
      full,
      label: unlimited ? t("maxConcurrencyUnlimited") : `${current}/${max}`,
      variant: full
        ? ("error" as ProgressVariant)
        : current > 0
          ? ("warning" as ProgressVariant)
          : ("default" as ProgressVariant),
    };
  };

  const getQuotaSummary = (upstream: Upstream) => {
    const quota = quotaMap.get(upstream.id);
    if (!quota || quota.rules.length === 0) {
      return { hasRules: false, maxPercent: 0, isExceeded: false };
    }
    const maxPercent = quota.rules.reduce((max, rule) => Math.max(max, rule.percent_used), 0);
    return { hasRules: true, maxPercent, isExceeded: quota.is_exceeded };
  };

  const getQueuePolicySummary = (upstream: Upstream) => {
    const policy = upstream.queue_policy;

    if (!policy?.enabled) {
      return {
        enabled: false,
        statusLabel: t("queuePolicyDisabled"),
        detailLabel: t("queuePolicyDisabledDesc"),
      };
    }

    return {
      enabled: true,
      statusLabel: t("queuePolicyEnabledBadge"),
      detailLabel:
        policy.max_queue_length == null
          ? t("queuePolicyRuntimeSummaryUnlimited", {
              timeoutMs: policy.timeout_ms,
            })
          : t("queuePolicyRuntimeSummary", {
              timeoutMs: policy.timeout_ms,
              maxQueueLength: policy.max_queue_length,
            }),
    };
  };

  const formatLastUsed = (upstream: Upstream): string => {
    if (!upstream.last_used_at) return t("neverUsed");
    return formatDistanceToNow(new Date(upstream.last_used_at), {
      addSuffix: true,
      locale: dateLocale,
    });
  };

  const formatQuotaTiming = (rule: QuotaRule): string | null => {
    if (rule.period_type === "rolling") {
      if (!rule.estimated_recovery_at) return null;
      return `${t("quotaRecovery")}: ${formatDistanceToNow(new Date(rule.estimated_recovery_at), {
        addSuffix: true,
        locale: dateLocale,
      })}`;
    }

    if (!rule.resets_at) return null;
    return `${t("quotaResets")}: ${formatDistanceToNow(new Date(rule.resets_at), {
      addSuffix: true,
      locale: dateLocale,
    })}`;
  };

  const formatQuotaPeriod = (rule: QuotaRule): string => {
    if (rule.period_type === "daily") return t("spendingPeriodDaily");
    if (rule.period_type === "monthly") return t("spendingPeriodMonthly");
    return `${t("spendingPeriodRolling")} ${rule.period_hours ?? "-"}h`;
  };

  const getCatalogSignal = (
    upstream: Upstream
  ): {
    label: string;
    variant: "success" | "error" | "info" | "outline";
    title?: string;
  } | null => {
    if (upstream.model_catalog_last_status === "failed") {
      return {
        label: t("catalogSignalFailed"),
        variant: "error",
        title: upstream.model_catalog_last_error ?? undefined,
      };
    }

    if ((upstream.model_catalog?.length ?? 0) > 0) {
      const hasLiteLlmEntries = upstream.model_catalog?.some((entry) => entry.source === "litellm");
      return {
        label: t("catalogSignalReady"),
        variant: hasLiteLlmEntries
          ? "outline"
          : upstream.model_catalog?.some((entry) => entry.source === "inferred")
            ? "info"
            : "success",
        title: t("catalogSignalReadyHint", { count: upstream.model_catalog?.length ?? 0 }),
      };
    }

    return null;
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

  if (upstreams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-cf-md border border-divider bg-surface-300/80">
          <Server className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <h3 className="type-title-medium mb-2 text-foreground">
          {hasActiveFilters ? t("noFilteredUpstreams") : t("noUpstreams")}
        </h3>
        <p className="type-body-medium text-muted-foreground">
          {hasActiveFilters ? t("noFilteredUpstreamsDesc") : t("noUpstreamsDesc")}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full space-y-4 overflow-hidden">
      {tieredData.map((tier) => {
        const isCollapsed = collapsedTiers.has(tier.priority);
        const isClosing = closingTiers.has(tier.priority);
        const isOpening = openingTiers.has(tier.priority);
        const showTierContent = !isCollapsed || isClosing || isOpening;
        const isCollapsedOrClosing = isCollapsed || isClosing;
        const tierStatus = getTierRuntimeStatus(tier.summary);
        const tierLedLabel =
          tierStatus === "healthy"
            ? t("tierLedHealthy")
            : tierStatus === "offline"
              ? t("tierLedOffline")
              : t("tierLedDegraded");

        return (
          <section
            key={`tier-${tier.priority}`}
            className="w-full max-w-full overflow-hidden rounded-cf-md border border-surface-400/55 bg-surface-300/24"
          >
            <button
              type="button"
              className={cn(
                "flex w-full items-start justify-between gap-3 border-b text-left",
                showTierContent ? "border-divider/90" : "border-transparent",
                isCompactDensity ? "px-3 py-2.5" : "px-4 py-3"
              )}
              onClick={() => toggleTier(tier.priority)}
              aria-expanded={!isCollapsedOrClosing}
            >
              <div className={cn("min-w-0", isCompactDensity ? "space-y-1.5" : "space-y-2")}>
                <div className="flex items-center gap-2">
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform duration-300 ease-cf-standard",
                      isCollapsedOrClosing && "-rotate-90"
                    )}
                    aria-hidden="true"
                  />
                  <span className="type-label-medium text-foreground">
                    {t("tier")} P{tier.priority}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {tier.summary.total}{" "}
                    {tier.summary.total === 1 ? t("tierUpstreamSingular") : t("tierUpstreamPlural")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <StatusLed tone={RUNTIME_TONE[tierStatus]} />
                    <span className="text-muted-foreground">{tierLedLabel}</span>
                  </span>
                  <Badge
                    variant="outline"
                    className="border-divider tabular-nums text-muted-foreground"
                  >
                    {t("tierOperational")} {tier.summary.operational}/{tier.summary.total}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-divider tabular-nums text-muted-foreground"
                  >
                    {t("active")} {tier.summary.active}/{tier.summary.total}
                  </Badge>
                  {tier.summary.concurrencyFull > 0 && (
                    <Badge
                      variant="outline"
                      className="border-status-warning/45 text-status-warning"
                    >
                      {t("concurrencyFullCount", { count: tier.summary.concurrencyFull })}
                    </Badge>
                  )}
                  {tier.summary.quotaExceeded > 0 && (
                    <Badge variant="outline" className="border-status-error/45 text-status-error">
                      {t("quotaExceededCount", { count: tier.summary.quotaExceeded })}
                    </Badge>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground">
                {isCollapsedOrClosing ? tCommon("expand") : tCommon("collapse")}
              </span>
            </button>

            {showTierContent && (
              <div
                data-state={isClosing ? "closed" : "open"}
                className={cn(
                  "origin-top motion-reduce:transition-none",
                  "transition-[max-height,opacity,transform] duration-[260ms] ease-cf-standard",
                  isClosing || isOpening
                    ? "max-h-0 -translate-y-1 opacity-0"
                    : "max-h-none overflow-visible translate-y-0 opacity-100"
                )}
              >
                <div className="min-w-0 divide-y divide-divider/60 [&>*]:min-w-0">
                  {tier.upstreams.map((upstream) => {
                    const runtimeStatus = getRuntimeStatus(upstream);
                    const runtimeLabel = getRuntimeLabel(upstream);
                    const concurrency = getConcurrencyInfo(upstream);
                    const quota = quotaMap.get(upstream.id);
                    const quotaSummary = getQuotaSummary(upstream);
                    const queuePolicy = getQueuePolicySummary(upstream);
                    const catalogSignal = getCatalogSignal(upstream);
                    const isExpanded = expandedRows.has(upstream.id);
                    const showRecover =
                      upstream.circuit_breaker != null &&
                      upstream.circuit_breaker.state !== "closed";
                    const quotaRuleNodes = quota?.rules.map((rule, index) => {
                      const timing = formatQuotaTiming(rule);
                      const variant: ProgressVariant = rule.is_exceeded
                        ? "error"
                        : rule.percent_used >= 80
                          ? "warning"
                          : "default";

                      return (
                        <div
                          key={`${upstream.id}-quota-${index}`}
                          className="rounded-cf-sm border border-divider bg-surface-200 px-2 py-1.5"
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-muted-foreground">{formatQuotaPeriod(rule)}</span>
                            <span
                              className={cn(
                                "font-mono tabular-nums",
                                rule.is_exceeded
                                  ? "text-status-error"
                                  : rule.percent_used >= 80
                                    ? "text-status-warning"
                                    : "text-foreground"
                              )}
                            >
                              ${rule.current_spending.toFixed(2)} / $
                              {rule.spending_limit.toFixed(2)} ({Math.round(rule.percent_used)}%)
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <AsciiProgress
                              value={rule.current_spending}
                              max={rule.spending_limit}
                              width={10}
                              variant={variant}
                              style="meter"
                            />
                            {timing && (
                              <span className="text-[10px] text-muted-foreground">{timing}</span>
                            )}
                          </div>
                        </div>
                      );
                    });

                    return (
                      <div
                        key={upstream.id}
                        data-morph-source
                        className={cn(
                          "w-full min-w-0 max-w-full",
                          !upstream.is_active && "bg-surface-300/45 opacity-80"
                        )}
                      >
                        {/* Compact row: always-visible summary line. The row
                            container is a plain layout element (no interactive
                            role); the expand affordance is a dedicated button so
                            no interactive control is nested inside a button. */}
                        <div
                          className={cn(
                            "flex w-full items-center gap-3",
                            isCompactDensity ? "px-3 py-2" : "px-4 py-2.5"
                          )}
                        >
                          {/* Expand control — contains only phrasing content, no
                              interactive descendants. Accessible name comes from
                              the runtime status + upstream name it wraps. */}
                          <button
                            type="button"
                            onClick={() => toggleRow(upstream.id)}
                            aria-expanded={isExpanded}
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left transition-opacity duration-cf-fast hover:opacity-90"
                          >
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-cf-standard",
                                !isExpanded && "-rotate-90"
                              )}
                              aria-hidden="true"
                            />

                            <StatusLed tone={RUNTIME_TONE[runtimeStatus]} className="shrink-0" />
                            <span className="sr-only">{runtimeLabel}</span>

                            {/* Name + base_url (phrasing-only so button nesting is valid) */}
                            <span className="min-w-0 flex-1">
                              <span
                                className={cn(
                                  "type-body-medium block truncate",
                                  upstream.is_active ? "text-foreground" : "text-muted-foreground"
                                )}
                                title={upstream.name}
                              >
                                {upstream.name}
                              </span>
                              <code
                                className="block truncate font-mono text-[11px] leading-4 tabular-nums text-muted-foreground"
                                title={upstream.base_url}
                              >
                                {upstream.base_url}
                              </code>
                            </span>
                          </button>

                          {!upstream.is_active && (
                            <Badge
                              variant="outline"
                              className="hidden shrink-0 border-divider text-[10px] text-muted-foreground sm:inline-flex"
                            >
                              {t("inactive")}
                            </Badge>
                          )}

                          {/* Circuit breaker state chip */}
                          {upstream.circuit_breaker && (
                            <StateChip
                              state={upstream.circuit_breaker.state}
                              className="hidden shrink-0 sm:inline-flex"
                            />
                          )}

                          {/* Key metrics (Tier-2 mono tabular) */}
                          <div className="hidden shrink-0 items-center gap-3 md:flex">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 font-mono text-xs tabular-nums",
                                concurrency.full ? "text-status-warning" : "text-muted-foreground"
                              )}
                              title={t("maxConcurrency")}
                            >
                              <Server className="h-3 w-3" aria-hidden="true" />
                              {concurrency.label}
                            </span>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 font-mono text-xs tabular-nums",
                                quotaSummary.isExceeded
                                  ? "text-status-error"
                                  : quotaSummary.maxPercent >= 80
                                    ? "text-status-warning"
                                    : "text-muted-foreground"
                              )}
                              title={t("tableQuota")}
                            >
                              <Wallet className="h-3 w-3" aria-hidden="true" />
                              {quotaSummary.hasRules
                                ? `${Math.round(quotaSummary.maxPercent)}%`
                                : "—"}
                            </span>
                          </div>

                          {/* Last-used relative time (Tier-3), always visible inline */}
                          <span
                            className="inline-flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground"
                            title={t("lastUsed")}
                          >
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {formatLastUsed(upstream)}
                          </span>

                          {/* Row actions — stop propagation so clicks do not toggle the row */}
                          <div
                            className="flex shrink-0 items-center gap-1.5"
                            onClick={(event) => event.stopPropagation()}
                            role="presentation"
                          >
                            <Switch
                              checked={upstream.is_active}
                              onCheckedChange={async (nextActive) => {
                                await handleToggleActive(upstream, nextActive);
                              }}
                              disabled={
                                toggleActiveMutation.isPending &&
                                toggleActiveMutation.variables?.id === upstream.id
                              }
                              aria-label={`${upstream.is_active ? t("quickDisable") : t("quickEnable")}: ${upstream.name}`}
                            />

                            <Button
                              variant="outline"
                              size="icon"
                              type="button"
                              className={cn(
                                "border-divider bg-surface-200",
                                isCompactDensity ? "h-7 w-7" : "h-8 w-8"
                              )}
                              onClick={() => onTest(upstream)}
                              title={t("testUpstream")}
                              aria-label={`${t("testUpstream")}: ${upstream.name}`}
                            >
                              <PlugZap className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>

                            <Button
                              variant="outline"
                              size="icon"
                              type="button"
                              className={cn(
                                "border-divider bg-surface-200",
                                isCompactDensity ? "h-7 w-7" : "h-8 w-8"
                              )}
                              asChild
                            >
                              <Link
                                href={`/upstreams/${upstream.id}`}
                                aria-label={`${tCommon("edit")}: ${upstream.name}`}
                              >
                                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              </Link>
                            </Button>

                            {showRecover && (
                              <Button
                                variant="outline"
                                size="sm"
                                type="button"
                                className={cn(
                                  "gap-1.5 px-2.5",
                                  statusTone("warning"),
                                  isCompactDensity ? "h-7 text-xs" : "h-8"
                                )}
                                onClick={() => {
                                  void handleRecoverCircuit(upstream);
                                }}
                                disabled={
                                  forceCircuitBreakerMutation.isPending &&
                                  forceCircuitBreakerMutation.variables?.upstreamId === upstream.id
                                }
                                aria-label={`${t("recoverCircuitBreaker")}: ${upstream.name}`}
                              >
                                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="hidden lg:inline">
                                  {t("recoverCircuitBreaker")}
                                </span>
                              </Button>
                            )}

                            <Button
                              variant="outline"
                              size="icon"
                              type="button"
                              className={cn(
                                statusTone("error"),
                                isCompactDensity ? "h-7 w-7" : "h-8 w-8"
                              )}
                              onClick={(event) =>
                                onDelete(
                                  upstream,
                                  event.currentTarget.closest<HTMLElement>("[data-morph-source]")
                                )
                              }
                              aria-label={`${tCommon("delete")}: ${upstream.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>

                        {/* Expanded detail: the dense information the card used to show */}
                        {isExpanded && (
                          <div
                            className={cn(
                              "grid gap-3 bg-surface-300/20",
                              isCompactDensity
                                ? "px-3 pb-3 pt-1"
                                : "px-4 pb-4 pt-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
                            )}
                          >
                            <section className="min-w-0 space-y-2.5">
                              <RouteCapabilityBadges
                                capabilities={upstream.route_capabilities}
                                className="max-w-full flex-wrap items-start gap-1.5 overflow-visible"
                                badgeClassName="px-2 py-0.5 text-[11px] leading-4"
                              />

                              <div className="min-w-0 overflow-hidden rounded-cf-sm bg-surface-300/35 p-3">
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="text-xs text-muted-foreground">
                                    {t("tableBaseUrl")}
                                  </span>
                                  {upstream.official_website_url ? (
                                    <a
                                      href={upstream.official_website_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-status-info"
                                    >
                                      {t("officialWebsiteAction")}
                                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                    </a>
                                  ) : null}
                                </div>
                                <code
                                  className="block break-all rounded-cf-sm border border-divider bg-surface-200 px-2 py-1 font-mono text-[11px] leading-5 tabular-nums text-foreground"
                                  title={upstream.base_url}
                                >
                                  {upstream.base_url}
                                </code>
                                <div className="mt-2 flex items-center justify-between text-[11px]">
                                  <span className="text-muted-foreground">
                                    {t("billingMultipliers")}
                                  </span>
                                  <span className="font-mono tabular-nums text-foreground">
                                    {(upstream.billing_input_multiplier ?? 1).toFixed(2)} /{" "}
                                    {(upstream.billing_output_multiplier ?? 1).toFixed(2)}
                                  </span>
                                </div>
                                {catalogSignal && (
                                  <div className="mt-2 flex items-center justify-between text-[11px]">
                                    <span className="text-muted-foreground">
                                      {t("modelBasedRouting")}
                                    </span>
                                    <Badge
                                      variant={catalogSignal.variant}
                                      className="text-[11px]"
                                      title={catalogSignal.title}
                                    >
                                      {catalogSignal.label}
                                    </Badge>
                                  </div>
                                )}
                              </div>
                            </section>

                            <section className="min-w-0 space-y-2.5">
                              <div className="min-w-0 overflow-hidden rounded-cf-sm bg-surface-300/35 p-3">
                                <div className="mb-2 text-xs text-muted-foreground">
                                  {t("runtimeStatus")}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center gap-1.5 text-[11px]">
                                    <StatusLed tone={RUNTIME_TONE[runtimeStatus]} />
                                    <span className="text-foreground">{runtimeLabel}</span>
                                  </span>
                                  {upstream.circuit_breaker && (
                                    <StateChip state={upstream.circuit_breaker.state} />
                                  )}
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[11px] tabular-nums",
                                      concurrency.full
                                        ? "border-status-warning/45 text-status-warning"
                                        : "border-divider text-muted-foreground"
                                    )}
                                  >
                                    {t("maxConcurrency")}: {concurrency.label}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "text-[11px]",
                                      queuePolicy.enabled
                                        ? "border-status-warning/45 text-status-warning"
                                        : "border-divider text-muted-foreground"
                                    )}
                                  >
                                    {t("queuePolicyStatus")}: {queuePolicy.statusLabel}
                                  </Badge>
                                </div>

                                {!concurrency.unlimited && (
                                  <div className="mt-2 flex items-center justify-between gap-2 rounded-cf-sm bg-surface-200/75 px-2 py-1.5">
                                    <span className="text-[11px] text-muted-foreground">
                                      {t("concurrencyUsage")}
                                    </span>
                                    <AsciiProgress
                                      value={concurrency.current}
                                      max={concurrency.max ?? 1}
                                      width={8}
                                      showPercentage
                                      variant={concurrency.variant}
                                      style="meter"
                                    />
                                  </div>
                                )}

                                <div className="mt-2 text-[11px] text-muted-foreground">
                                  {t("queuePolicySummary")}:{" "}
                                  <span className="text-foreground">{queuePolicy.detailLabel}</span>
                                </div>

                                <div className="mt-2 text-[11px] text-muted-foreground">
                                  {t("lastUsed")}:{" "}
                                  <span className="tabular-nums text-foreground">
                                    {formatLastUsed(upstream)}
                                  </span>
                                </div>
                              </div>

                              <div className="min-w-0 overflow-hidden rounded-cf-sm bg-surface-300/35 p-3">
                                <div className="mb-2 flex items-center justify-between">
                                  <span className="text-xs text-muted-foreground">
                                    {t("tableQuota")}
                                  </span>
                                  {quota?.is_exceeded && (
                                    <Badge
                                      variant="outline"
                                      className="border-status-error/45 text-status-error"
                                    >
                                      {t("quotaExceeded")}
                                    </Badge>
                                  )}
                                </div>

                                {!quota || quota.rules.length === 0 ? (
                                  <div className="text-[11px] text-muted-foreground">
                                    {tCommon("noData")}
                                  </div>
                                ) : (
                                  <div className="space-y-2">{quotaRuleNodes}</div>
                                )}
                              </div>
                            </section>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
