"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getDateLocale } from "@/lib/date-locale";
import type { TimeRange } from "@/types/api";
import type { CustomDateRange } from "@/hooks/use-dashboard-stats";

export type TimeRangeOrCustom = TimeRange | "custom";

const PRESET_RANGES: TimeRange[] = ["today", "7d", "30d"];

interface TimeRangeSelectorProps {
  value: TimeRangeOrCustom;
  onChange: (value: TimeRangeOrCustom, customRange?: CustomDateRange) => void;
  customRange?: CustomDateRange;
}

export function TimeRangeSelector({ value, onChange, customRange }: TimeRangeSelectorProps) {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);
  const [open, setOpen] = useState(false);
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(
    customRange ? { from: customRange.start, to: customRange.end } : undefined
  );

  const getLabel = (range: TimeRange): string => {
    switch (range) {
      case "today":
        return t("timeRange.today");
      case "7d":
        return t("timeRange.7d");
      case "30d":
        return t("timeRange.30d");
    }
  };

  const customLabel =
    value === "custom" && customRange
      ? `${format(customRange.start, "MM/dd", { locale: dateLocale })} – ${format(customRange.end, "MM/dd", { locale: dateLocale })}`
      : t("timeRange.custom");

  function handleApply() {
    if (pendingRange?.from && pendingRange?.to) {
      onChange("custom", { start: pendingRange.from, end: pendingRange.to });
      setOpen(false);
    }
  }

  return (
    <div className="flex items-stretch gap-1">
      <div className="inline-flex rounded-cf-sm border border-border bg-surface-200 p-1">
        {PRESET_RANGES.map((range) => (
          <button
            key={range}
            type="button"
            onClick={() => onChange(range)}
            className={cn(
              "rounded-[8px] px-3.5 py-1.5 type-label-medium transition-all duration-cf-fast ease-cf-standard",
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

      {value === "custom" && (
        <button
          type="button"
          onClick={() => onChange("7d")}
          className="inline-flex items-center justify-center rounded-cf-sm border border-border bg-surface-200 px-1.5 text-muted-foreground transition-colors hover:bg-surface-300 hover:text-foreground"
          title={t("timeRange.resetToDefault")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <Popover open={open} onOpenChange={setOpen}>
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
          <div className="p-4">
            <p className="type-label-medium mb-3 border-b border-divider pb-2.5 text-foreground">
              {t("timeRange.customRange")}
            </p>
            <Calendar
              locale={dateLocale}
              mode="range"
              selected={pendingRange}
              onSelect={setPendingRange}
              numberOfMonths={2}
              disabled={{ after: new Date() }}
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
                className="bg-amber-500 text-primary-foreground hover:bg-amber-600"
              >
                {t("timeRange.apply")}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
