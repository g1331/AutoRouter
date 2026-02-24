import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn, warnIfForbiddenVisualStyle } from "@/lib/utils";

const badgeVariants = cva(
  [
    "inline-flex items-center gap-1.5 rounded-cf-sm border px-2.5 py-1",
    "type-label-medium",
    "transition-colors duration-cf-fast ease-cf-standard",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "border-amber-500/45 bg-amber-500/16 text-amber-100 dark:text-amber-200",
        secondary: "border-border bg-surface-300 text-foreground",
        outline: "border-border bg-transparent text-foreground",
        success: "border-status-success bg-status-success-muted text-status-success",
        warning: "border-status-warning bg-status-warning-muted text-status-warning",
        error: "border-status-error bg-status-error-muted text-status-error",
        destructive: "border-status-error bg-status-error-muted text-status-error",
        info: "border-status-info bg-status-info-muted text-status-info",
        neutral: "border-divider bg-surface-200 text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  warnIfForbiddenVisualStyle("Badge", className);
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
