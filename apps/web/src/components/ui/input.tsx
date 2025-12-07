import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Cassette Futurism Input
 *
 * Terminal-style text input with amber mono aesthetic.
 * - Bottom border emphasis with glow on focus
 * - Supports error state via aria-invalid
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Layout & typography
          "flex h-12 w-full rounded-cf-sm px-4 py-2",
          "font-mono text-sm leading-5",
          // Base colors (amber on deep black)
          "bg-black-900/80 text-amber-400",
          "placeholder:text-amber-700/70",
          // Border treatment (full outline, 2px amber)
          "border-2 border-amber-500/70",
          "transition-all duration-cf-normal ease-cf-standard",
          // Hover state
          "hover:bg-black-900/90",
          "hover:border-amber-400 hover:shadow-cf-glow-subtle",
          // Focus state with glow + ring
          "focus-visible:outline-none",
          "focus-visible:bg-black-900",
          "focus-visible:shadow-cf-glow-subtle",
          "focus-visible:border-amber-400",
          "focus-visible:ring-cf focus-visible:ring-amber-400 focus-visible:ring-offset-0",
          // Error state (via aria-invalid)
          "aria-invalid:border-status-error",
          "aria-invalid:text-status-error",
          "aria-invalid:placeholder:text-status-error/50",
          "aria-invalid:focus-visible:shadow-cf-glow-error",
          // Disabled state
          "disabled:cursor-not-allowed",
          "disabled:bg-black-900/40",
          "disabled:text-amber-800",
          "disabled:placeholder:text-amber-800/60",
          "disabled:border-amber-800/50",
          "disabled:shadow-none",
          // File input consistency
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-amber-500",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
