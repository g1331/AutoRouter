"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarIcon, X } from "lucide-react";
import {
  addDays,
  format,
  min,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from "date-fns";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getDateLocale } from "@/lib/date-locale";
import type { TimeRange } from "@/types/api";
import type { CustomDateRange } from "@/hooks/use-dashboard-stats";

export type TimeRangeOrCustom = TimeRange | "custom";

export const PRESET_RANGES: TimeRange[] = ["today", "7d", "30d"];

export type QuickRangeKey = "last90d" | "thisMonth" | "lastMonth" | "thisYear" | "lastYear";

const QUICK_RANGE_KEYS: QuickRangeKey[] = [
  "last90d",
  "thisMonth",
  "lastMonth",
  "thisYear",
  "lastYear",
];

/** Resolve a quick preset to a custom range; `end` is exclusive (next-day 00:00). */
export function computeQuickRange(key: QuickRangeKey, now: Date = new Date()): CustomDateRange {
  const today = startOfDay(now);
  const endExclusive = addDays(today, 1);
  switch (key) {
    case "last90d":
      return { start: subDays(today, 89), end: endExclusive };
    case "thisMonth":
      return { start: startOfMonth(today), end: endExclusive };
    case "lastMonth":
      return { start: startOfMonth(subMonths(today, 1)), end: startOfMonth(today) };
    case "thisYear":
      return { start: startOfYear(today), end: endExclusive };
    case "lastYear":
      return { start: startOfYear(subYears(today, 1)), end: startOfYear(today) };
  }
}

interface TimeRangeSelectorProps {
  value: TimeRangeOrCustom | "all";
  // Method syntax keeps parameter bivariance: callers that never enable
  // includeAll can keep handlers typed to the narrower TimeRangeOrCustom.
  onChange(value: TimeRangeOrCustom | "all", customRange?: CustomDateRange): void;
  customRange?: CustomDateRange;
  hideCustom?: boolean;
  /** Prepend an "all time" preset (used by the logs view to reach old entries). */
  includeAll?: boolean;
}

export function TimeRangeSelector({
  value,
  onChange,
  customRange,
  hideCustom,
  includeAll,
}: TimeRangeSelectorProps) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
  const [open, setOpen] = useState(false);
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>();

  const getLabel = (range: TimeRange | "all"): string => {
    switch (range) {
      case "all":
        return t("timeRange.all");
      case "today":
        return t("timeRange.today");
      case "7d":
        return t("timeRange.7d");
      case "30d":
        return t("timeRange.30d");
    }
  };

  const presetRanges: Array<TimeRange | "all"> = includeAll
    ? ["all", ...PRESET_RANGES]
    : PRESET_RANGES;

  const customLabel = (() => {
    if (value !== "custom" || !customRange) return t("timeRange.custom");
    // customRange.end is exclusive (next day 00:00), display the actual last day
    const displayEnd = subDays(customRange.end, 1);
    const currentYear = new Date().getFullYear();
    const withYear =
      customRange.start.getFullYear() !== currentYear || displayEnd.getFullYear() !== currentYear;
    const pattern = withYear ? "yyyy/MM/dd" : "MM/dd";
    return `${format(customRange.start, pattern, { locale: dateLocale })} – ${format(displayEnd, pattern, { locale: dateLocale })}`;
  })();

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      // Re-seed from the applied range so an abandoned selection doesn't linger.
      setPendingRange(
        customRange ? { from: customRange.start, to: subDays(customRange.end, 1) } : undefined
      );
    }
  }

  function handleApply() {
    if (pendingRange?.from && pendingRange?.to) {
      // Calendar returns midnight dates; backend treats end_date as exclusive upper bound.
      // Extend end to next day 00:00 so the selected end day is fully included.
      onChange("custom", { start: pendingRange.from, end: addDays(pendingRange.to, 1) });
      setOpen(false);
    }
  }

  function handleQuickRange(key: QuickRangeKey) {
    onChange("custom", computeQuickRange(key));
    setOpen(false);
  }

  return (
    <div className="flex items-stretch gap-1">
      <div className="inline-flex rounded-cf-sm border border-border bg-surface-200 p-1">
        {presetRanges.map((range) => (
          <button
            key={range}
            type="button"
            onClick={() => onChange(range)}
            className={cn(
              "rounded-cf-sm px-3.5 py-1.5 type-label-medium transition-all duration-cf-fast ease-cf-standard",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              value === range
                ? "bg-amber-500 text-primary-foreground shadow-cf-glow-subtle"
                : "text-muted-foreground hover:bg-surface-300 hover:text-foreground"
            )}
          >
            {getLabel(range)}
          </button>
        ))}
      </div>

      {value === "custom" && !hideCustom && (
        <button
          type="button"
          onClick={() => onChange("7d")}
          className="inline-flex items-center justify-center rounded-cf-sm border border-border bg-surface-200 px-1.5 text-muted-foreground transition-colors hover:bg-surface-300 hover:text-foreground"
          title={t("timeRange.resetToDefault")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {!hideCustom && (
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-cf-sm border px-3 py-1.5 type-label-medium transition-all",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                value === "custom"
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-500"
                  : "border-border bg-surface-200 text-muted-foreground hover:bg-surface-300 hover:text-foreground"
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              {customLabel}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <div className="flex">
              <div className="flex flex-col gap-1 border-r border-divider p-3">
                <p className="type-label-medium mb-1 px-2 text-muted-foreground">
                  {t("timeRange.quickSelect")}
                </p>
                {QUICK_RANGE_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleQuickRange(key)}
                    className={cn(
                      "rounded-cf-sm px-2 py-1.5 text-left type-label-medium text-foreground transition-colors",
                      "hover:bg-surface-300",
                      "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    )}
                  >
                    {t(`timeRange.${key}`)}
                  </button>
                ))}
              </div>
              <div className="p-4">
                <p className="type-label-medium mb-3 border-b border-divider pb-2.5 text-foreground">
                  {t("timeRange.customRange")}
                </p>
                <Calendar
                  locale={dateLocale}
                  mode="range"
                  selected={pendingRange}
                  onSelect={setPendingRange}
                  defaultMonth={pendingRange?.from}
                  numberOfMonths={2}
                  disabled={{ after: new Date() }}
                  // 默认最早到 5 年前；URL 恢复等来源的更早区间也要能在日历中查看
                  startMonth={min([subYears(new Date(), 5), pendingRange?.from ?? new Date()])}
                  endMonth={new Date()}
                />
                {pendingRange?.from && (
                  <p className="mt-2 text-center type-caption text-muted-foreground">
                    {format(pendingRange.from, "PPP", { locale: dateLocale })}
                    {pendingRange.to
                      ? ` – ${format(pendingRange.to, "PPP", { locale: dateLocale })}`
                      : ""}
                  </p>
                )}
                <div className="mt-3 flex justify-end gap-2 border-t border-divider pt-3">
                  <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                    {tCommon("cancel")}
                  </Button>
                  <Button
                    size="sm"
                    disabled={!pendingRange?.from || !pendingRange?.to}
                    onClick={handleApply}
                  >
                    {t("timeRange.apply")}
                  </Button>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
