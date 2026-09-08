import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageShellWidth = "7xl" | "4xl" | "2xl" | "full";

const MAX_WIDTH_CLASSES: Record<PageShellWidth, string> = {
  "7xl": "max-w-7xl",
  "4xl": "max-w-4xl",
  "2xl": "max-w-2xl",
  full: "max-w-full",
};

interface PageShellProps {
  maxWidth?: PageShellWidth;
  className?: string;
  children: ReactNode;
}

/**
 * Canonical page container replacing the hand-written
 * `mx-auto max-w-* space-y-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8` wrapper.
 */
export function PageShell({ maxWidth = "7xl", className, children }: PageShellProps) {
  return (
    <div
      className={cn(
        "app-page mx-auto w-full min-w-0 space-y-6 px-4 py-6 sm:px-6 lg:space-y-8 lg:px-8 lg:py-8",
        MAX_WIDTH_CLASSES[maxWidth],
        className
      )}
    >
      {children}
    </div>
  );
}
