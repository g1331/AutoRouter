import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Cassette Futurism Badge / Status Chip
 *
 * Terminal-style status indicators with:
 * - Monospace uppercase text
 * - Status color variants with muted backgrounds
 * - Border emphasis for accessibility (non-color indication)
 */
const badgeVariants = cva(
  [
    "inline-flex items-center gap-1.5 px-2.5 py-1",
    "rounded-cf-sm border",
    "font-mono text-xs font-medium uppercase tracking-wider",
    "transition-colors duration-cf-fast ease-cf-standard",
    "focus-visible:outline-none focus-visible:ring-cf focus-visible:ring-amber-500",
  ].join(" "),
  {
    variants: {
      variant: {
        // Default amber
        default:
          "bg-amber-500 text-black-900 border-amber-500",
        // Secondary / muted
        secondary:
          "bg-surface-400 text-amber-500 border-surface-500",
        // Outlined
        outline:
          "bg-transparent text-amber-500 border-amber-500",
        // Success status
        success:
          "bg-status-success-muted text-status-success border-status-success",
        // Warning status
        warning:
          "bg-status-warning-muted text-status-warning border-status-warning",
        // Error / Destructive status
        error:
          "bg-status-error-muted text-status-error border-status-error",
        destructive:
          "bg-status-error-muted text-status-error border-status-error",
        // Info status
        info:
          "bg-status-info-muted text-status-info border-status-info",
        // Neutral / muted
        neutral:
          "bg-surface-300 text-amber-700 border-divider",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
