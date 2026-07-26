import type { ReactNode } from "react";

import { statusTone, type StatusTone } from "@/lib/status-tone";
import { cn } from "@/lib/utils";

type IconBoxSize = "sm" | "md";
type IconBoxTone = "amber" | StatusTone | "neutral";

const SIZE_CLASSES: Record<IconBoxSize, string> = {
  sm: "h-7 w-7",
  md: "h-10 w-10",
};

const NON_STATUS_TONES: Record<"amber" | "neutral", string> = {
  // 填充式而非包边式：amber 只承担图标与底色，不再画一圈描边
  amber: "border-transparent bg-amber-500/12 text-amber-500",
  neutral: "border-divider bg-surface-300 text-muted-foreground",
};

interface IconBoxProps {
  size?: IconBoxSize;
  tone?: IconBoxTone;
  className?: string;
  children: ReactNode;
}

/**
 * Square icon tile shared across admin surfaces (the `flex h-7 w-7 … rounded-cf-sm
 * border …` pattern that was hand-duplicated ~23×). Status tones reuse the
 * `status-tone` soft triple so the alpha ladder stays centralized.
 */
export function IconBox({ size = "sm", tone = "amber", children, className }: IconBoxProps) {
  const toneClass =
    tone === "amber" || tone === "neutral" ? NON_STATUS_TONES[tone] : statusTone(tone);

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-cf-sm border",
        SIZE_CLASSES[size],
        toneClass,
        className
      )}
    >
      {children}
    </div>
  );
}
