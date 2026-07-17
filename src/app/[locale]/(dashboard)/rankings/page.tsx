"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Cpu, Key, RotateCcw, Search, Server, Trophy, Users } from "lucide-react";

import { Topbar } from "@/components/admin/topbar";
import { RankingsTable, type RankingsLogsWindow } from "@/components/rankings/rankings-table";
import {
  buildQuery,
  filterRankingsItems,
  hasActiveFilters,
  readStateFromUrl,
  type RankingsViewState,
} from "@/components/rankings/rankings-url-state";
import { TimeRangeSelector } from "@/components/dashboard";
import type { TimeRangeOrCustom } from "@/components/dashboard/time-range-selector";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRankings } from "@/hooks/use-rankings";
import type { CustomDateRange } from "@/hooks/use-dashboard-stats";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { RankingsDimension, RankingsSortField } from "@/types/api";

const DIMENSIONS: Array<{ key: RankingsDimension; icon: typeof Server; labelKey: string }> = [
  { key: "upstreams", icon: Server, labelKey: "dimensions.upstreams" },
  { key: "models", icon: Cpu, labelKey: "dimensions.models" },
  { key: "api_keys", icon: Key, labelKey: "dimensions.apiKeys" },
  { key: "users", icon: Users, labelKey: "dimensions.users" },
];

export default function RankingsPage() {
  const t = useTranslations("rankings");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [state, setState] = useState<RankingsViewState>(() =>
    readStateFromUrl(new URLSearchParams(searchParams.toString()))
  );
  // Local echo for the search input so typing stays responsive while the URL
  // commit is debounced (same pattern as users-table).
  const [searchInput, setSearchInput] = useState(state.query);
  const searchDebounceRef = useRef<number | null>(null);
  // Latest state for the debounced commit — a 300ms-old closure must not
  // clobber a sort/dimension change made in between.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current != null) window.clearTimeout(searchDebounceRef.current);
    };
  }, []);

  function applyState(next: RankingsViewState) {
    setState(next);
    const query = buildQuery(next);
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function handleSearchInputChange(value: string) {
    setSearchInput(value);
    if (searchDebounceRef.current != null) window.clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = window.setTimeout(() => {
      const trimmed = value.trim();
      if (trimmed !== stateRef.current.query) {
        applyState({ ...stateRef.current, query: trimmed });
      }
    }, 300);
  }

  function handleResetFilters() {
    if (searchDebounceRef.current != null) window.clearTimeout(searchDebounceRef.current);
    setSearchInput("");
    applyState({ ...state, query: "", minRequests: 0, errorsOnly: false, upstream: "" });
  }

  function handleSortChange(field: RankingsSortField) {
    applyState({
      ...state,
      sortBy: field,
      order: state.sortBy === field ? (state.order === "desc" ? "asc" : "desc") : "desc",
    });
  }

  function handleTimeRangeChange(value: TimeRangeOrCustom, customRange?: CustomDateRange) {
    applyState({ ...state, range: value, customRange });
  }

  const { data, isLoading } = useRankings({
    dimension: state.dimension,
    range: state.range,
    sortBy: state.sortBy,
    order: state.order,
    customRange: state.customRange,
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const filteredItems = useMemo(() => filterRankingsItems(items, state), [items, state]);
  const filtersActive = hasActiveFilters(state);

  // Upstream filter options come from the current dataset itself (the
  // leaderboard returns the full aggregated set, no extra endpoint needed).
  const upstreamOptions = useMemo(() => {
    if (state.dimension !== "models") return [];
    const names = new Set<string>();
    for (const item of items) {
      if ("upstream_distribution" in item) {
        for (const d of item.upstream_distribution) names.add(d.name);
      }
    }
    return [...names].sort();
  }, [items, state.dimension]);

  // Time window forwarded to the logs page from the "view logs" links.
  const logsWindow = useMemo<RankingsLogsWindow>(() => {
    if (state.range === "custom" && state.customRange) {
      return {
        startIso: state.customRange.start.toISOString(),
        endIso: state.customRange.end.toISOString(),
      };
    }
    const now = new Date();
    if (state.range === "today") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { startIso: start.toISOString() };
    }
    const days = state.range === "30d" ? 30 : 7;
    return { startIso: new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString() };
  }, [state.range, state.customRange]);

  return (
    <>
      <Topbar title={t("pageTitle")} />

      <div className="mx-auto min-w-0 w-full max-w-[1560px] space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <h2 className="type-title-medium text-foreground">{t("title")}</h2>
            <p className="type-caption hidden text-muted-foreground sm:block">{t("description")}</p>
          </div>
          <TimeRangeSelector
            value={state.range}
            onChange={handleTimeRangeChange}
            customRange={state.customRange}
          />
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div
            className="inline-flex flex-wrap self-start rounded-cf-sm border border-border bg-surface-200 p-1"
            role="tablist"
            aria-label={t("title")}
          >
            {DIMENSIONS.map(({ key, icon: Icon, labelKey }) => {
              const active = state.dimension === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  // Switching dimension drops the dimension-specific upstream
                  // filter; the generic filters (q/min/errors) carry over.
                  onClick={() => applyState({ ...state, dimension: key, upstream: "" })}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-cf-sm px-3.5 py-1.5 type-label-medium transition-all duration-cf-fast ease-cf-standard",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-amber-500 text-primary-foreground shadow-cf-glow-subtle"
                      : "text-muted-foreground hover:bg-surface-300 hover:text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t(labelKey)}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-[200px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                aria-label={t("filters.searchPlaceholder")}
                placeholder={t("filters.searchPlaceholder")}
                value={searchInput}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                className="pl-8"
              />
            </div>
            <Input
              type="number"
              min={0}
              aria-label={t("filters.minRequests")}
              placeholder={t("filters.minRequests")}
              value={state.minRequests > 0 ? state.minRequests : ""}
              onChange={(e) => {
                const parsed = Number.parseInt(e.target.value, 10);
                applyState({
                  ...state,
                  minRequests: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
                });
              }}
              className="w-full sm:w-[130px]"
            />
            {state.dimension === "models" && (
              <Select
                value={state.upstream || "all"}
                onValueChange={(value) =>
                  applyState({ ...state, upstream: value === "all" ? "" : value })
                }
              >
                <SelectTrigger aria-label={t("filters.upstream")} className="w-full sm:w-[170px]">
                  <SelectValue placeholder={t("filters.upstream")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("filters.allUpstreams")}</SelectItem>
                  {upstreamOptions.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <label className="inline-flex cursor-pointer select-none items-center gap-1.5 type-label-medium text-muted-foreground">
              <Checkbox
                checked={state.errorsOnly}
                onCheckedChange={(checked) =>
                  applyState({ ...state, errorsOnly: checked === true })
                }
              />
              {t("filters.errorsOnly")}
            </label>
            {filtersActive && (
              <button
                type="button"
                onClick={handleResetFilters}
                className={cn(
                  "inline-flex items-center gap-1 rounded-cf-sm px-2 py-1.5 type-label-medium",
                  "text-muted-foreground transition-colors hover:text-foreground",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                )}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("filters.reset")}
              </button>
            )}
          </div>
        </div>

        <RankingsTable
          dimension={state.dimension}
          items={filteredItems}
          isLoading={isLoading}
          sortBy={state.sortBy}
          order={state.order}
          onSortChange={handleSortChange}
          logsWindow={logsWindow}
          emptyLabel={filtersActive && items.length > 0 ? t("noMatch") : undefined}
        />
      </div>
    </>
  );
}
