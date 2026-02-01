"use client";

import { cn } from "@/lib/utils";

export type ProgressVariant = "default" | "success" | "warning" | "error";

export interface AsciiProgressProps {
  value: number;
  max?: number;
  width?: number;
  showValue?: boolean;
  showPercentage?: boolean;
  variant?: ProgressVariant;
  className?: string;
}

const FILLED_CHAR = "█";
const EMPTY_CHAR = "░";

const VARIANT_COLORS: Record<ProgressVariant, string> = {
  default: "text-amber-500",
  success: "text-status-success",
  warning: "text-amber-500",
  error: "text-status-error",
};

export function AsciiProgress({
  value,
  max = 100,
  width = 10,
  showValue = false,
  showPercentage = false,
  variant = "default",
  className,
}: AsciiProgressProps) {
  const percentage = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const filledCount = Math.round((percentage / 100) * width);
  const emptyCount = width - filledCount;

  const filledBar = FILLED_CHAR.repeat(filledCount);
  const emptyBar = EMPTY_CHAR.repeat(emptyCount);

  const colorClass = VARIANT_COLORS[variant];

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 font-mono", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={`Progress: ${Math.round(percentage)}%`}
    >
      <span className="text-xs leading-none">
        <span className={colorClass}>{filledBar}</span>
        <span className="text-surface-500">{emptyBar}</span>
      </span>
      {showValue && <span className={cn(colorClass, "text-xs tabular-nums")}>{value}</span>}
      {showPercentage && !showValue && (
        <span className={cn(colorClass, "text-xs tabular-nums")}>{Math.round(percentage)}%</span>
      )}
    </span>
  );
}
