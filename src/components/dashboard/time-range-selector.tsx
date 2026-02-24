"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { TimeRange } from "@/types/api";

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
}

const TIME_RANGES: TimeRange[] = ["today", "7d", "30d"];

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  const t = useTranslations("dashboard");

  const getLabel = (range: TimeRange): string => {
    switch (range) {
      case "today":
        return t("timeRange.today");
      case "7d":
        return t("timeRange.7d");
      case "30d":
        return t("timeRange.30d");
      default:
        return range;
    }
  };

  return (
    <div className="inline-flex rounded-cf-sm border border-border bg-surface-200 p-1">
      {TIME_RANGES.map((range) => (
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
  );
}
