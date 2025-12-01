import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * M3 Card Variants
 * - elevated: Default card with shadow
 * - filled: Solid background without border
 * - outlined: Bordered card without shadow
 */
const cardVariants = cva(
  "rounded-[var(--shape-corner-large)] text-[rgb(var(--md-sys-color-on-surface))] transition-shadow duration-200",
  {
    variants: {
      variant: {
        elevated:
          "bg-[rgb(var(--md-sys-color-surface-container-low))] shadow-[var(--md-elevation-1)] hover:shadow-[var(--md-elevation-2)]",
        filled:
          "bg-[rgb(var(--md-sys-color-surface-container-highest))]",
        outlined:
          "bg-[rgb(var(--md-sys-color-surface))] border border-[rgb(var(--md-sys-color-outline-variant))]",
      },
    },
    defaultVariants: {
      variant: "elevated",
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, className }))}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "type-title-large text-[rgb(var(--md-sys-color-on-surface))]",
      className
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "type-body-medium text-[rgb(var(--md-sys-color-on-surface-variant))]",
      className
    )}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("p-6 pt-0 text-[rgb(var(--md-sys-color-on-surface))]", className)}
    {...props}
  />
));
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center gap-2 p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  cardVariants,
};
