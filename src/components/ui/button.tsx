import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn, warnIfForbiddenVisualStyle } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-cf-md border text-sm font-semibold",
    "transition-all duration-cf-normal ease-cf-standard",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:cursor-not-allowed",
    "disabled:opacity-45 disabled:shadow-none disabled:translate-y-0",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground shadow-cf-glow-subtle hover:-translate-y-px hover:bg-amber-400 active:translate-y-0",
        primary:
          "border-primary bg-primary text-primary-foreground shadow-cf-glow-subtle hover:-translate-y-px hover:bg-amber-400 active:translate-y-0",
        secondary:
          "border-border bg-surface-300 text-foreground shadow-[var(--vr-shadow-xs)] hover:bg-surface-400 hover:border-amber-400/50",
        outline:
          "border-border bg-transparent text-foreground hover:border-amber-500/70 hover:bg-surface-300",
        tonal:
          "border-amber-500/35 bg-amber-500/12 text-amber-200 hover:border-amber-400/55 hover:bg-amber-500/18 dark:text-amber-100",
        ghost:
          "border-transparent bg-transparent text-foreground hover:bg-surface-300 hover:text-foreground",
        destructive:
          "border-status-error bg-status-error text-white shadow-[0_8px_20px_rgb(204_97_86_/_0.22)] hover:brightness-105",
        danger:
          "border-status-error bg-status-error text-white shadow-[0_8px_20px_rgb(204_97_86_/_0.22)] hover:brightness-105",
        success:
          "border-status-success bg-status-success text-white shadow-[0_8px_20px_rgb(72_164_118_/_0.22)] hover:brightness-105",
        link: "h-auto border-transparent bg-transparent px-0 py-0 text-amber-500 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 px-3 text-xs",
        lg: "h-11 px-6 text-base",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    warnIfForbiddenVisualStyle("Button", className);
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
