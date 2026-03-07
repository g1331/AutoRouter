import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type DashboardLoadingTone = "default" | "muted" | "accent";

interface DashboardLoadingSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  loadingLabel: string;
}

interface DashboardLoadingBlockProps extends HTMLAttributes<HTMLDivElement> {
  tone?: DashboardLoadingTone;
}

const DASHBOARD_LOADING_TONE_STYLES: Record<DashboardLoadingTone, string> = {
  default: "bg-surface-300/80",
  muted: "bg-surface-300/60",
  accent: "border border-amber-500/18 bg-amber-500/12",
};

export function DashboardLoadingSurface({
  loadingLabel,
  className,
  ...props
}: DashboardLoadingSurfaceProps) {
  return <div role="status" aria-label={loadingLabel} className={className} {...props} />;
}

export function DashboardLoadingBlock({
  tone = "default",
  className,
  ...props
}: DashboardLoadingBlockProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-cf-sm motion-safe:animate-pulse motion-reduce:animate-none",
        DASHBOARD_LOADING_TONE_STYLES[tone],
        className
      )}
      {...props}
    />
  );
}
