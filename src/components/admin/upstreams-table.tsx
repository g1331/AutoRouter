"use client";

import { formatDistanceToNow } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, type SyntheticEvent } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Pencil,
  Play,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { Upstream } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDateLocale } from "@/lib/date-locale";
import {
  StatusLed,
  AsciiProgress,
  type LedStatus,
  type ProgressVariant,
} from "@/components/ui/terminal";
import { cn } from "@/lib/utils";
import { useToggleUpstreamActive, useUpstreamQuota } from "@/hooks/use-upstreams";
import { useForceCircuitBreaker } from "@/hooks/use-circuit-breaker";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { RouteCapabilityBadges } from "@/components/admin/route-capability-badges";

interface UpstreamsTableProps {
  upstreams: Upstream[];
  onEdit: (upstream: Upstream) => void;
  onDelete: (upstream: Upstream) => void;
  onTest: (upstream: Upstream) => void;
  density?: "comfortable" | "compact";
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
  healthy: number;
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

export function UpstreamsTable({
  upstreams,
  onEdit,
  onDelete,
  onTest,
  density = "comfortable",
}: UpstreamsTableProps) {
  const t = useTranslations("upstreams");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
  const [collapsedTiers, setCollapsedTiers] = useState<Set<number>>(new Set());
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
          healthy: tierUpstreams.filter((upstream) => upstream.health_status?.is_healthy).length,
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
    return upstream.health_status.is_healthy ? "healthy" : "offline";
  };

  const getHealthLabel = (upstream: Upstream): string => {
    if (!upstream.health_status) return t("healthUnknown");
    return upstream.health_status.is_healthy ? t("healthHealthy") : t("healthUnhealthy");
  };

  const getCircuitLedStatus = (upstream: Upstream): LedStatus => {
    if (!upstream.circuit_breaker) return "degraded";
    if (upstream.circuit_breaker.state === "closed") return "healthy";
    if (upstream.circuit_breaker.state === "open") return "offline";
    return "degraded";
  };

  const getCircuitBreakerLabel = (upstream: Upstream): string => {
    if (!upstream.circuit_breaker) return t("circuitBreakerUnknown");
    if (upstream.circuit_breaker.state === "closed") return t("circuitBreakerClosed");
    if (upstream.circuit_breaker.state === "open") return t("circuitBreakerOpen");
    return t("circuitBreakerHalfOpen");
  };

  const getTierHealthLedStatus = (summary: TierSummary): LedStatus => {
    if (summary.healthy === summary.total) return "healthy";
    if (summary.healthy === 0) return "offline";
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
        <h3 className="type-title-medium mb-2 text-foreground">{t("noUpstreams")}</h3>
        <p className="type-body-medium text-muted-foreground">{t("noUpstreamsDesc")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tieredData.map((tier) => {
        const isCollapsed = collapsedTiers.has(tier.priority);
        const tierLedStatus = getTierHealthLedStatus(tier.summary);
        const tierLedLabel =
          tierLedStatus === "healthy"
            ? t("tierLedHealthy")
            : tierLedStatus === "offline"
              ? t("tierLedOffline")
              : t("tierLedDegraded");

        return (
          <section
            key={`tier-${tier.priority}`}
            className="rounded-cf-md border border-divider bg-card/92"
          >
            <button
              type="button"
              className={cn(
                "flex w-full items-start justify-between gap-3 border-b border-divider text-left",
                isCompactDensity ? "px-3 py-2.5" : "px-4 py-3"
              )}
              onClick={() => toggleTier(tier.priority)}
              aria-expanded={!isCollapsed}
            >
              <div className={cn("min-w-0", isCompactDensity ? "space-y-1.5" : "space-y-2")}>
                <div className="flex items-center gap-2">
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  <span className="type-label-medium text-foreground">
                    {t("tier")} P{tier.priority}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {tier.summary.total}{" "}
                    {tier.summary.total === 1 ? t("tierUpstreamSingular") : t("tierUpstreamPlural")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <StatusLed status={tierLedStatus} showLabel label={tierLedLabel} />
                  <Badge variant="outline" className="border-divider text-muted-foreground">
                    {t("tierHealthy")} {tier.summary.healthy}/{tier.summary.total}
                  </Badge>
                  <Badge variant="outline" className="border-divider text-muted-foreground">
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
                {isCollapsed ? tCommon("expand") : tCommon("collapse")}
              </span>
            </button>

            {!isCollapsed && (
              <div
                className={cn(
                  "grid gap-3",
                  isCompactDensity
                    ? "p-3 sm:p-3.5 md:grid-cols-2 2xl:grid-cols-3"
                    : "p-3 sm:p-4 xl:grid-cols-2"
                )}
              >
                {tier.upstreams.map((upstream) => {
                  const quota = quotaMap.get(upstream.id);
                  const concurrency = getConcurrencyInfo(upstream);
                  const showRecover =
                    upstream.circuit_breaker != null && upstream.circuit_breaker.state !== "closed";
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
                        className={cn(
                          "rounded-cf-sm border border-divider bg-surface-200",
                          isCompactDensity ? "px-2 py-1" : "px-2 py-1.5"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-muted-foreground">{formatQuotaPeriod(rule)}</span>
                          <span
                            className={cn(
                              "font-mono",
                              rule.is_exceeded
                                ? "text-status-error"
                                : rule.percent_used >= 80
                                  ? "text-status-warning"
                                  : "text-foreground"
                            )}
                          >
                            ${rule.current_spending.toFixed(2)} / ${rule.spending_limit.toFixed(2)}{" "}
                            ({Math.round(rule.percent_used)}%)
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <AsciiProgress
                            value={rule.current_spending}
                            max={rule.spending_limit}
                            width={isCompactDensity ? 7 : 10}
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
                    <article
                      key={upstream.id}
                      className={cn(
                        "rounded-cf-md border border-divider bg-surface-200/35",
                        isCompactDensity ? "p-2.5 sm:p-3" : "p-3 sm:p-4",
                        !upstream.is_active && "opacity-80"
                      )}
                    >
                      <div
                        className={cn(
                          "flex flex-col lg:flex-row lg:items-start lg:justify-between",
                          isCompactDensity ? "gap-2" : "gap-3"
                        )}
                      >
                        <div
                          className={cn("min-w-0", isCompactDensity ? "space-y-1.5" : "space-y-2")}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <h3
                              className="type-body-medium truncate text-foreground"
                              title={upstream.name}
                            >
                              {upstream.name}
                            </h3>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[11px]",
                                upstream.is_active
                                  ? "border-status-success/40 text-status-success"
                                  : "border-divider text-muted-foreground"
                              )}
                            >
                              {upstream.is_active ? t("active") : t("inactive")}
                            </Badge>
                            {concurrency.full && (
                              <Badge
                                variant="outline"
                                className="border-status-warning/45 text-status-warning"
                              >
                                {t("concurrencyFullStatus")}
                              </Badge>
                            )}
                            {quota?.is_exceeded && (
                              <Badge
                                variant="outline"
                                className="border-status-error/45 text-status-error"
                              >
                                {t("quotaExceeded")}
                              </Badge>
                            )}
                          </div>

                          <RouteCapabilityBadges
                            capabilities={upstream.route_capabilities}
                            className="max-w-full items-start gap-1.5"
                            badgeClassName={cn(
                              "px-2 py-0.5 text-[11px] leading-4",
                              !isCompactDensity && "sm:text-xs"
                            )}
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Switch
                            checked={upstream.is_active}
                            onCheckedChange={async (nextActive) => {
                              await handleToggleActive(upstream, nextActive);
                            }}
                            disabled={
                              toggleActiveMutation.isPending &&
                              toggleActiveMutation.variables?.id === upstream.id
                            }
                            className="h-5 w-10"
                            aria-label={`${upstream.is_active ? t("quickDisable") : t("quickEnable")}: ${upstream.name}`}
                          />

                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            className={cn(
                              "gap-1.5 border-divider bg-surface-200 px-2.5",
                              isCompactDensity ? "h-7 text-xs" : "h-8"
                            )}
                            onClick={() => onTest(upstream)}
                            aria-label={`${tCommon("test")}: ${upstream.name}`}
                          >
                            <Play className="h-3.5 w-3.5" aria-hidden="true" />
                            {tCommon("test")}
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            className={cn(
                              "gap-1.5 border-divider bg-surface-200 px-2.5",
                              isCompactDensity ? "h-7 text-xs" : "h-8"
                            )}
                            onClick={() => onEdit(upstream)}
                            aria-label={`${tCommon("edit")}: ${upstream.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            {tCommon("edit")}
                          </Button>
                          {showRecover && (
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              className={cn(
                                "gap-1.5 border-status-warning/45 bg-status-warning-muted px-2.5 text-status-warning",
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
                              {t("recoverCircuitBreaker")}
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            className={cn(
                              "gap-1.5 border-status-error/45 bg-status-error-muted px-2.5 text-status-error",
                              isCompactDensity ? "h-7 text-xs" : "h-8"
                            )}
                            onClick={() => onDelete(upstream)}
                            aria-label={`${tCommon("delete")}: ${upstream.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            {tCommon("delete")}
                          </Button>
                        </div>
                      </div>

                      <div
                        className={cn(
                          "mt-2.5 grid",
                          isCompactDensity
                            ? "gap-2 grid-cols-1"
                            : "gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
                        )}
                      >
                        <section
                          className={cn(
                            "rounded-cf-sm border border-divider bg-surface-300/45",
                            isCompactDensity ? "p-2.5" : "p-3"
                          )}
                        >
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
                            className="block break-all rounded-cf-sm border border-divider bg-surface-200 px-2 py-1 font-mono text-[11px] leading-5 text-foreground"
                            title={upstream.base_url}
                          >
                            {upstream.base_url}
                          </code>
                          <div className="mt-2 flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">{t("billingMultipliers")}</span>
                            <span className="font-mono text-foreground">
                              {(upstream.billing_input_multiplier ?? 1).toFixed(2)} /{" "}
                              {(upstream.billing_output_multiplier ?? 1).toFixed(2)}
                            </span>
                          </div>
                        </section>

                        <section
                          className={cn(
                            "rounded-cf-sm border border-divider bg-surface-300/45",
                            isCompactDensity ? "p-2.5" : "p-3"
                          )}
                        >
                          <div className="mb-2 text-xs text-muted-foreground">
                            {t("runtimeStatus")}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <StatusLed
                              status={getHealthLedStatus(upstream)}
                              showLabel
                              label={getHealthLabel(upstream)}
                            />
                            <StatusLed
                              status={getCircuitLedStatus(upstream)}
                              showLabel
                              label={getCircuitBreakerLabel(upstream)}
                            />
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[11px]",
                                concurrency.full
                                  ? "border-status-warning/45 text-status-warning"
                                  : "border-divider text-muted-foreground"
                              )}
                            >
                              {t("maxConcurrency")}: {concurrency.label}
                            </Badge>
                          </div>

                          {!concurrency.unlimited && (
                            <div
                              className={cn(
                                "mt-2 flex items-center justify-between gap-2 rounded-cf-sm border border-divider bg-surface-200 px-2",
                                isCompactDensity ? "py-1" : "py-1.5"
                              )}
                            >
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
                            {t("lastUsed")}:{" "}
                            <span className="text-foreground">{formatLastUsed(upstream)}</span>
                          </div>
                        </section>
                      </div>

                      <section
                        className={cn(
                          "rounded-cf-sm border border-divider bg-surface-300/45",
                          isCompactDensity ? "mt-2.5 p-2.5" : "mt-3 p-3"
                        )}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{t("tableQuota")}</span>
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
                        ) : isCompactDensity ? (
                          <details>
                            <summary className="cursor-pointer select-none text-[11px] text-muted-foreground hover:text-foreground">
                              {t("showQuotaDetails")}
                            </summary>
                            <div className="mt-2 space-y-1.5">{quotaRuleNodes}</div>
                          </details>
                        ) : (
                          <div className="space-y-2">{quotaRuleNodes}</div>
                        )}
                      </section>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
