import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * M3 Badge / Chip Variants
 */
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[var(--shape-corner-small)] px-3 py-1 type-label-large transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--md-sys-color-primary))]",
  {
    variants: {
      variant: {
        // Primary filled
        default:
          "bg-[rgb(var(--md-sys-color-primary))] text-[rgb(var(--md-sys-color-on-primary))]",
        // Secondary filled
        secondary:
          "bg-[rgb(var(--md-sys-color-secondary))] text-[rgb(var(--md-sys-color-on-secondary))]",
        // Destructive / Error
        destructive:
          "bg-[rgb(var(--md-sys-color-error))] text-[rgb(var(--md-sys-color-on-error))]",
        // Outlined
        outline:
          "border border-[rgb(var(--md-sys-color-outline))] bg-transparent text-[rgb(var(--md-sys-color-on-surface))]",
        // Success container
        success:
          "bg-[rgb(var(--md-sys-color-success-container))] text-[rgb(var(--md-sys-color-on-success-container))]",
        // Warning container
        warning:
          "bg-[rgb(var(--md-sys-color-warning-container))] text-[rgb(var(--md-sys-color-on-warning-container))]",
        // Error container
        error:
          "bg-[rgb(var(--md-sys-color-error-container))] text-[rgb(var(--md-sys-color-on-error-container))]",
        // Info / Primary container
        info:
          "bg-[rgb(var(--md-sys-color-primary-container))] text-[rgb(var(--md-sys-color-on-primary-container))]",
        // Neutral / Surface container
        neutral:
          "bg-[rgb(var(--md-sys-color-surface-container-highest))] text-[rgb(var(--md-sys-color-on-surface-variant))]",
        // Tertiary container
        tertiary:
          "bg-[rgb(var(--md-sys-color-tertiary-container))] text-[rgb(var(--md-sys-color-on-tertiary-container))]",
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
