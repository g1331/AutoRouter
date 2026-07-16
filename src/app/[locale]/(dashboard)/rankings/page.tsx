"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Cpu, Key, Server, Trophy, Users } from "lucide-react";

import { Topbar } from "@/components/admin/topbar";
import { RankingsTable, type RankingsLogsWindow } from "@/components/rankings/rankings-table";
import {
  buildQuery,
  readStateFromUrl,
  type RankingsViewState,
} from "@/components/rankings/rankings-url-state";
import { TimeRangeSelector } from "@/components/dashboard";
import type { TimeRangeOrCustom } from "@/components/dashboard/time-range-selector";
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

  function applyState(next: RankingsViewState) {
    setState(next);
    const query = buildQuery(next);
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
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

        <div
          className="inline-flex flex-wrap rounded-cf-sm border border-border bg-surface-200 p-1"
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
                onClick={() => applyState({ ...state, dimension: key })}
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

        <RankingsTable
          dimension={state.dimension}
          items={data?.items ?? []}
          isLoading={isLoading}
          sortBy={state.sortBy}
          order={state.order}
          onSortChange={handleSortChange}
          logsWindow={logsWindow}
        />
      </div>
    </>
  );
}
