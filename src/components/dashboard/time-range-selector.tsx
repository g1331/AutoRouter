"use client";

/**
 * Time range selector component.
 *
 * Terminal-style segmented button for selecting time ranges.
 */

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
    <div className="inline-flex rounded-cf-sm border border-amber-500/30 bg-surface-200 p-1">
      {TIME_RANGES.map((range) => (
        <button
          key={range}
          onClick={() => onChange(range)}
          className={cn(
            "px-4 py-1.5 font-mono text-xs uppercase tracking-wider transition-all duration-cf-fast",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50",
            value === range
              ? "bg-amber-500 text-black-900 shadow-cf-glow-subtle"
              : "text-amber-500 hover:bg-amber-500/10"
          )}
        >
          {getLabel(range)}
        </button>
      ))}
    </div>
  );
}
