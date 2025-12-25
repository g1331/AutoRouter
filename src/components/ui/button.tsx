import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Cassette Futurism Button Variants
 *
 * - default/primary: Amber background, black text (high emphasis)
 * - secondary/outline: Transparent with amber border (medium emphasis)
 * - ghost: Transparent, amber text only (low emphasis)
 * - destructive/danger: Red background for destructive actions
 * - success: Green background for positive actions
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-mono text-sm font-medium leading-none",
    "border-2 border-transparent rounded-cf-sm",
    "transition-all duration-cf-normal ease-cf-standard",
    "focus-visible:outline-none focus-visible:ring-cf focus-visible:ring-amber-500",
    "focus-visible:ring-offset-cf focus-visible:ring-offset-black-900",
    "disabled:pointer-events-none disabled:cursor-not-allowed",
    "disabled:bg-amber-700/30 disabled:text-amber-100/60 disabled:border-amber-700/50",
    "disabled:shadow-none disabled:hover:shadow-none",
    "[&_svg]:pointer-events-none [&_svg]:size-[18px] [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-amber-500 text-black-900 border-amber-500 hover:bg-amber-400 hover:shadow-cf-glow-subtle active:bg-amber-600",
        primary:
          "bg-amber-500 text-black-900 border-amber-500 hover:bg-amber-400 hover:shadow-cf-glow-subtle active:bg-amber-600",
        secondary:
          "bg-black-900/60 text-amber-400 border-amber-400 hover:bg-black-900/70 hover:border-amber-300 hover:text-amber-300 active:bg-black-900",
        outline:
          "bg-transparent text-amber-400 border-amber-400 hover:bg-black-900/60 hover:text-amber-300 hover:border-amber-300 active:bg-black-900/70",
        tonal:
          "bg-black-900/50 text-amber-300 border-amber-500/40 hover:bg-black-900/60 hover:border-amber-300 active:bg-black-900/70",
        ghost:
          "bg-transparent text-amber-400 border-transparent hover:bg-black-900/50 hover:text-amber-300 active:text-amber-200",
        destructive:
          "bg-status-error text-black-900 border-status-error hover:shadow-cf-glow-error active:brightness-90",
        danger:
          "bg-status-error text-black-900 border-status-error hover:shadow-cf-glow-error active:brightness-90",
        success:
          "bg-status-success text-black-900 border-status-success hover:shadow-cf-glow-success active:brightness-90",
        link: "bg-transparent border-transparent text-amber-500 underline-offset-4 hover:underline hover:text-amber-400 px-0 h-auto",
      },
      size: {
        default: "h-10 px-5",
        sm: "h-9 px-4 text-xs",
        lg: "h-12 px-7 text-base",
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
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
