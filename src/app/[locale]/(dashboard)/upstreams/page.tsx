"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  LayoutGrid,
  Plus,
  RotateCcw,
  Rows3,
  Search,
  Server,
  SlidersHorizontal,
} from "lucide-react";

import { DeleteUpstreamDialog } from "@/components/admin/delete-upstream-dialog";
import { TestUpstreamDialog } from "@/components/admin/test-upstream-dialog";
import { Topbar } from "@/components/admin/topbar";
import { UpstreamFormDialog } from "@/components/admin/upstream-form-dialog";
import { UpstreamsTable } from "@/components/admin/upstreams-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  useAllUpstreams,
  useUpstreams,
  useTestUpstream,
  useUpstreamHealth,
} from "@/hooks/use-upstreams";
import type { RouteCapability, Upstream } from "@/types/api";
import { ROUTE_CAPABILITY_DEFINITIONS } from "@/lib/route-capabilities";
import { ROUTE_CAPABILITY_ICON_META } from "@/components/admin/route-capability-badges";
import { cn } from "@/lib/utils";

interface UpstreamsLoadingSkeletonProps {
  loadingLabel: string;
}

function UpstreamsLoadingSkeleton({ loadingLabel }: UpstreamsLoadingSkeletonProps) {
  return (
    <Card
      variant="outlined"
      className="border-surface-400/65 bg-surface-300/38 shadow-[var(--vr-shadow-sm)]"
    >
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div role="status" aria-label={loadingLabel} className="space-y-2">
          <div className="h-3 w-44 animate-pulse rounded-cf-sm bg-surface-300/80" />
          <div className="h-3 w-72 animate-pulse rounded-cf-sm bg-surface-300/80" />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={`upstream-card-skeleton-${index}`}
              className="space-y-2 rounded-cf-md border border-surface-400/60 bg-card/90 p-4 shadow-[var(--vr-shadow-xs)]"
            >
              <div className="h-3 w-32 animate-pulse rounded-cf-sm bg-surface-300/80" />
              <div className="h-3 w-24 animate-pulse rounded-cf-sm bg-surface-300/80" />
              <div className="h-10 animate-pulse rounded-cf-sm bg-surface-300/80" />
              <div className="h-10 animate-pulse rounded-cf-sm bg-surface-300/80" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

type UpstreamStatusFilter =
  | "all"
  | "healthy"
  | "unhealthy"
  | "concurrency_full"
  | "circuit_open"
  | "inactive";

type WorkbenchDensity = "compact" | "comfortable";

const STATUS_FILTERS: UpstreamStatusFilter[] = [
  "all",
  "healthy",
  "unhealthy",
  "concurrency_full",
  "circuit_open",
  "inactive",
];

function matchesStatusFilter(upstream: Upstream, statusFilter: UpstreamStatusFilter): boolean {
  if (statusFilter === "all") return true;
  if (statusFilter === "healthy") return upstream.health_status?.is_healthy === true;
  if (statusFilter === "unhealthy") return upstream.health_status?.is_healthy === false;
  if (statusFilter === "inactive") return !upstream.is_active;
  if (statusFilter === "circuit_open") return upstream.circuit_breaker?.state === "open";
  if (statusFilter === "concurrency_full") {
    if (upstream.max_concurrency == null) return false;
    return (upstream.current_concurrency ?? 0) >= upstream.max_concurrency;
  }
  return true;
}

export default function UpstreamsPage() {
  const [upstreamPage, setUpstreamPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editUpstream, setEditUpstream] = useState<Upstream | null>(null);
  const [deleteUpstream, setDeleteUpstream] = useState<Upstream | null>(null);
  const [testUpstream, setTestUpstream] = useState<Upstream | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<UpstreamStatusFilter>("all");
  const [capabilityFilter, setCapabilityFilter] = useState<RouteCapability | "all">("all");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [workbenchDensity, setWorkbenchDensity] = useState<WorkbenchDensity>("compact");

  const pageSize = 10;
  const t = useTranslations("upstreams");
  const tCommon = useTranslations("common");

  const { data: upstreamsData, isLoading: isUpstreamsLoading } = useUpstreams(
    upstreamPage,
    pageSize
  );
  const { data: allUpstreamsData } = useAllUpstreams();
  const { data: healthData } = useUpstreamHealth();
  const {
    mutate: testUpstreamMutation,
    data: testResult,
    isPending: isTestLoading,
  } = useTestUpstream();

  const upstreamsWithHealth = useMemo(() => {
    const items = upstreamsData?.items || [];
    if (!healthData?.data) return items;
    const healthMap = new Map(healthData.data.map((h) => [h.upstream_id, h]));

    return items.map((upstream) => {
      const health = healthMap.get(upstream.id);
      if (!health) return upstream;
      return {
        ...upstream,
        health_status: {
          upstream_id: health.upstream_id,
          upstream_name: health.upstream_name,
          is_healthy: health.is_healthy,
          last_check_at: health.last_check_at,
          last_success_at: health.last_success_at,
          failure_count: health.failure_count,
          latency_ms: health.latency_ms,
          error_message: health.error_message,
        },
      };
    });
  }, [upstreamsData, healthData]);

  const overviewUpstreamsWithHealth = useMemo(() => {
    const items = allUpstreamsData ?? upstreamsData?.items ?? [];
    if (!healthData?.data) return items;
    const healthMap = new Map(healthData.data.map((h) => [h.upstream_id, h]));

    return items.map((upstream) => {
      const health = healthMap.get(upstream.id);
      if (!health) return upstream;
      return {
        ...upstream,
        health_status: {
          upstream_id: health.upstream_id,
          upstream_name: health.upstream_name,
          is_healthy: health.is_healthy,
          last_check_at: health.last_check_at,
          last_success_at: health.last_success_at,
          failure_count: health.failure_count,
          latency_ms: health.latency_ms,
          error_message: health.error_message,
        },
      };
    });
  }, [allUpstreamsData, healthData, upstreamsData?.items]);

  const filteredUpstreams = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return upstreamsWithHealth.filter((upstream) => {
      if (!includeInactive && !upstream.is_active) {
        return false;
      }

      if (normalizedQuery) {
        const target = `${upstream.name} ${upstream.base_url}`.toLowerCase();
        if (!target.includes(normalizedQuery)) {
          return false;
        }
      }

      if (!matchesStatusFilter(upstream, statusFilter)) {
        return false;
      }

      if (capabilityFilter !== "all" && !upstream.route_capabilities.includes(capabilityFilter)) {
        return false;
      }

      return true;
    });
  }, [capabilityFilter, includeInactive, searchQuery, statusFilter, upstreamsWithHealth]);

  const overview = useMemo(() => {
    const total = upstreamsData?.total ?? overviewUpstreamsWithHealth.length;
    const healthy = overviewUpstreamsWithHealth.filter(
      (upstream) => upstream.health_status?.is_healthy
    ).length;
    const fullConcurrency = overviewUpstreamsWithHealth.filter((upstream) => {
      if (upstream.max_concurrency == null) return false;
      return (upstream.current_concurrency ?? 0) >= upstream.max_concurrency;
    }).length;

    return {
      total,
      healthy,
      fullConcurrency,
      filtered: filteredUpstreams.length,
    };
  }, [filteredUpstreams.length, overviewUpstreamsWithHealth, upstreamsData?.total]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    statusFilter !== "all" ||
    capabilityFilter !== "all" ||
    !includeInactive;

  useEffect(() => {
    if (testUpstream?.id) {
      testUpstreamMutation(testUpstream.id);
    }
  }, [testUpstream, testUpstreamMutation]);

  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setCapabilityFilter("all");
    setIncludeInactive(true);
  };

  return (
    <>
      <Topbar title={t("pageTitle")} />

      <div className="min-w-0 space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-7 xl:px-10">
        <Card
          variant="outlined"
          className="border-surface-400/65 bg-surface-300/38 shadow-[var(--vr-shadow-sm)] backdrop-blur supports-[backdrop-filter]:bg-surface-300/32"
        >
          <CardContent className="space-y-4 p-4 sm:p-5 lg:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-500">
                  <Server className="h-4 w-4" aria-hidden="true" />
                  <span className="type-label-medium">{t("workbenchTitle")}</span>
                </div>
                <p className="type-body-medium text-muted-foreground">{t("workbenchDesc")}</p>
              </div>

              <Button
                onClick={() => setCreateDialogOpen(true)}
                variant="primary"
                className="w-full gap-2 sm:w-auto"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("addUpstream")}
              </Button>
            </div>

            <div className="rounded-cf-md border border-surface-400/65 bg-surface-400/28 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={t("workbenchSearchPlaceholder")}
                    className="border-surface-400/70 bg-surface-200/70 pl-9 transition-colors duration-cf-fast hover:border-surface-400 focus-visible:border-amber-400/45 focus-visible:ring-amber-400/20"
                    aria-label={t("workbenchSearchPlaceholder")}
                  />
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:w-[460px]">
                  <Select
                    value={statusFilter}
                    onValueChange={(value) => setStatusFilter(value as UpstreamStatusFilter)}
                  >
                    <SelectTrigger className="border-surface-400/70 bg-surface-200/70 transition-colors duration-cf-fast hover:border-surface-400 focus:border-amber-400/45">
                      <div className="flex items-center gap-2">
                        <Filter className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        <SelectValue placeholder={t("statusFilterPlaceholder")} />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_FILTERS.map((filter) => (
                        <SelectItem key={filter} value={filter}>
                          {t(`statusFilter.${filter}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={capabilityFilter}
                    onValueChange={(value) => setCapabilityFilter(value as RouteCapability | "all")}
                  >
                    <SelectTrigger className="border-surface-400/70 bg-surface-200/70 transition-colors duration-cf-fast hover:border-surface-400 focus:border-amber-400/45">
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal
                          className="h-3.5 w-3.5 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <SelectValue placeholder={t("capabilityFilterPlaceholder")} />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        <span className="flex items-center gap-2">
                          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{t("capabilityFilterAll")}</span>
                        </span>
                      </SelectItem>
                      {ROUTE_CAPABILITY_DEFINITIONS.map((definition) => {
                        const iconMeta = ROUTE_CAPABILITY_ICON_META[definition.iconKey];
                        return (
                          <SelectItem key={definition.value} value={definition.value}>
                            <span className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "inline-flex h-4 w-4 items-center justify-center rounded-[5px] border",
                                  iconMeta.iconContainerClass
                                )}
                              >
                                {iconMeta.render(cn("h-2.5 w-2.5", iconMeta.iconColorClass))}
                              </span>
                              <span>{t(definition.labelKey)}</span>
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 rounded-cf-sm border border-divider/80 bg-surface-300/42 px-2.5 py-1.5">
                  <Badge
                    variant="outline"
                    className="border-surface-400/70 bg-surface-200/45 text-muted-foreground"
                  >
                    {t("overviewTotal", { count: overview.total })}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-surface-400/70 bg-surface-200/45 text-muted-foreground"
                  >
                    {t("overviewHealthy", { count: overview.healthy })}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "border-surface-400/70 bg-surface-200/45 text-muted-foreground",
                      overview.fullConcurrency > 0 &&
                        "border-status-warning/45 bg-status-warning-muted text-status-warning"
                    )}
                  >
                    {t("overviewConcurrencyFull", { count: overview.fullConcurrency })}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-surface-400/70 bg-surface-200/45 text-muted-foreground"
                  >
                    {t("overviewFiltered", { count: overview.filtered })}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3">
                  <div className="inline-flex items-center rounded-cf-sm border border-surface-400/70 bg-surface-200/70 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                    <span className="px-2 text-[11px] text-muted-foreground">
                      {t("densityLabel")}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant={workbenchDensity === "compact" ? "secondary" : "ghost"}
                      className="h-7 gap-1.5 px-2.5 transition-colors duration-cf-fast"
                      onClick={() => setWorkbenchDensity("compact")}
                      aria-pressed={workbenchDensity === "compact"}
                    >
                      <Rows3 className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("densityCompact")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={workbenchDensity === "comfortable" ? "secondary" : "ghost"}
                      className="h-7 gap-1.5 px-2.5 transition-colors duration-cf-fast"
                      onClick={() => setWorkbenchDensity("comfortable")}
                      aria-pressed={workbenchDensity === "comfortable"}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("densityComfortable")}
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 rounded-cf-sm border border-surface-400/70 bg-surface-200/65 px-2.5 py-1 text-xs text-muted-foreground">
                    <Switch
                      checked={includeInactive}
                      onCheckedChange={setIncludeInactive}
                      className="h-5 w-10"
                      aria-label={t("includeInactive")}
                    />
                    <span>{t("includeInactive")}</span>
                  </div>
                  {hasActiveFilters && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-surface-400/75 bg-surface-200/60 hover:bg-surface-300/65"
                      onClick={resetFilters}
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("resetFilters")}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {isUpstreamsLoading ? (
          <UpstreamsLoadingSkeleton loadingLabel={tCommon("loading")} />
        ) : (
          <div className="space-y-4 animate-in fade-in-0 slide-in-from-top-1 duration-300">
            <UpstreamsTable
              upstreams={filteredUpstreams}
              onEdit={setEditUpstream}
              onDelete={setDeleteUpstream}
              onTest={setTestUpstream}
              density={workbenchDensity}
              hasActiveFilters={hasActiveFilters}
            />

            {upstreamsData && upstreamsData.total_pages > 1 && (
              <Card
                variant="filled"
                className="border border-surface-400/65 bg-surface-300/35 shadow-[var(--vr-shadow-xs)]"
              >
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="type-body-small text-muted-foreground">
                    {tCommon("items")}{" "}
                    <span className="font-semibold text-foreground">{upstreamsData.total}</span> ·{" "}
                    {tCommon("page")}{" "}
                    <span className="font-semibold text-foreground">{upstreamsData.page}</span>{" "}
                    {tCommon("of")}{" "}
                    <span className="font-semibold text-foreground">
                      {upstreamsData.total_pages}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setUpstreamPage(upstreamPage - 1)}
                      disabled={upstreamPage === 1}
                      className="gap-1"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      {tCommon("previous")}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setUpstreamPage(upstreamPage + 1)}
                      disabled={upstreamPage === upstreamsData.total_pages}
                      className="gap-1"
                    >
                      {tCommon("next")}
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <UpstreamFormDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />

      <UpstreamFormDialog
        upstream={editUpstream}
        open={!!editUpstream}
        onOpenChange={(open) => !open && setEditUpstream(null)}
      />

      <DeleteUpstreamDialog
        upstream={deleteUpstream}
        open={!!deleteUpstream}
        onClose={() => setDeleteUpstream(null)}
      />

      <TestUpstreamDialog
        upstream={testUpstream}
        open={!!testUpstream}
        onClose={() => setTestUpstream(null)}
        testResult={testResult || null}
        isLoading={isTestLoading}
      />
    </>
  );
}
