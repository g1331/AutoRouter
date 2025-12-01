import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * M3 Button Variants
 * - filled: Primary action button with solid background
 * - tonal: Secondary action with tonal container
 * - outlined: Bordered button for medium emphasis
 * - text: Text-only button for low emphasis
 * - elevated: Filled button with elevation
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-[18px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Filled Button - Primary action
        default:
          "bg-[rgb(var(--md-sys-color-primary))] text-[rgb(var(--md-sys-color-on-primary))] hover:shadow-[var(--md-elevation-1)] active:shadow-none focus-visible:ring-[rgb(var(--md-sys-color-primary))]",
        // Filled Tonal - Secondary action
        tonal:
          "bg-[rgb(var(--md-sys-color-secondary-container))] text-[rgb(var(--md-sys-color-on-secondary-container))] hover:shadow-[var(--md-elevation-1)] active:shadow-none focus-visible:ring-[rgb(var(--md-sys-color-secondary))]",
        // Outlined Button - Medium emphasis
        outline:
          "border border-[rgb(var(--md-sys-color-outline))] bg-transparent text-[rgb(var(--md-sys-color-primary))] hover:bg-[rgb(var(--md-sys-color-primary)_/_0.08)] focus-visible:ring-[rgb(var(--md-sys-color-primary))]",
        // Text Button - Low emphasis
        ghost:
          "text-[rgb(var(--md-sys-color-primary))] hover:bg-[rgb(var(--md-sys-color-primary)_/_0.08)] focus-visible:ring-[rgb(var(--md-sys-color-primary))]",
        // Elevated Button - With shadow
        elevated:
          "bg-[rgb(var(--md-sys-color-surface-container-low))] text-[rgb(var(--md-sys-color-primary))] shadow-[var(--md-elevation-1)] hover:shadow-[var(--md-elevation-2)] focus-visible:ring-[rgb(var(--md-sys-color-primary))]",
        // Destructive - Error action
        destructive:
          "bg-[rgb(var(--md-sys-color-error))] text-[rgb(var(--md-sys-color-on-error))] hover:shadow-[var(--md-elevation-1)] active:shadow-none focus-visible:ring-[rgb(var(--md-sys-color-error))]",
        // Success - Positive action
        success:
          "bg-[rgb(var(--md-sys-color-success))] text-[rgb(var(--md-sys-color-on-success))] hover:shadow-[var(--md-elevation-1)] active:shadow-none focus-visible:ring-[rgb(var(--md-sys-color-success))]",
        // Link style
        link: "text-[rgb(var(--md-sys-color-primary))] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-6 rounded-[var(--shape-corner-full)]",
        sm: "h-9 px-4 text-sm rounded-[var(--shape-corner-full)]",
        lg: "h-12 px-8 text-base rounded-[var(--shape-corner-full)]",
        icon: "h-10 w-10 rounded-[var(--shape-corner-full)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
