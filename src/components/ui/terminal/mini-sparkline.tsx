"use client";

import { cn } from "@/lib/utils";
import { useMemo } from "react";

export interface MiniSparklineProps {
  data: number[];
  width?: number;
  showValue?: boolean;
  formatValue?: (value: number) => string;
  colorByTrend?: boolean;
  invertTrend?: boolean;
  className?: string;
}

const SPARK_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export function MiniSparkline({
  data,
  width = 10,
  showValue = false,
  formatValue,
  colorByTrend = false,
  invertTrend = false,
  className,
}: MiniSparklineProps) {
  const { sparkline, trend, currentValue } = useMemo(() => {
    if (!data || data.length === 0) {
      return { sparkline: "---", trend: "neutral" as const, currentValue: null };
    }

    // Take last `width` data points
    const displayData = data.slice(-width);
    const min = Math.min(...displayData);
    const max = Math.max(...displayData);
    const range = max - min;

    // Map values to spark characters
    const chars = displayData.map((value) => {
      if (range === 0) return SPARK_CHARS[3]; // Middle height if all same
      const normalized = (value - min) / range;
      const index = Math.min(SPARK_CHARS.length - 1, Math.floor(normalized * SPARK_CHARS.length));
      return SPARK_CHARS[index];
    });

    // Calculate trend (compare first half average to second half average)
    let trendDirection: "up" | "down" | "neutral" = "neutral";
    if (displayData.length >= 2) {
      const midpoint = Math.floor(displayData.length / 2);
      const firstHalf = displayData.slice(0, midpoint);
      const secondHalf = displayData.slice(midpoint);
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      const diff = secondAvg - firstAvg;
      const threshold = range * 0.1; // 10% of range as threshold
      if (diff > threshold) trendDirection = "up";
      else if (diff < -threshold) trendDirection = "down";
    }

    return {
      sparkline: chars.join(""),
      trend: trendDirection,
      currentValue: displayData[displayData.length - 1],
    };
  }, [data, width]);

  // Determine color based on trend
  const getColorClass = () => {
    if (!colorByTrend) return "text-amber-500";

    const isPositive = invertTrend ? trend === "down" : trend === "up";
    const isNegative = invertTrend ? trend === "up" : trend === "down";

    if (isPositive) return "text-status-success";
    if (isNegative) return "text-status-error";
    return "text-amber-500";
  };

  const colorClass = getColorClass();
  const formattedValue =
    currentValue !== null ? (formatValue ? formatValue(currentValue) : String(currentValue)) : "";

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 font-mono", className)}
      role="img"
      aria-label={`Trend: ${sparkline}${showValue && currentValue !== null ? `, current value: ${formattedValue}` : ""}`}
    >
      <span className={cn(colorClass, "text-xs leading-none tracking-tighter")}>{sparkline}</span>
      {showValue && currentValue !== null && (
        <span className={cn(colorClass, "text-xs tabular-nums")}>{formattedValue}</span>
      )}
    </span>
  );
}
