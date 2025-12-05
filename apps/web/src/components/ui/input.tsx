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
          // Base colors
          "bg-surface-200 text-amber-500",
          "placeholder:text-amber-700",
          // Border treatment (bottom emphasis, 2px amber)
          "border-b-2 border-amber-500",
          "transition-all duration-cf-normal ease-cf-standard",
          // Hover state
          "hover:border-amber-500 hover:shadow-cf-glow-subtle/50",
          // Focus state with glow
          "focus-visible:outline-none",
          "focus-visible:shadow-cf-glow-subtle",
          "focus-visible:border-amber-500",
          // Error state (via aria-invalid)
          "aria-invalid:border-status-error",
          "aria-invalid:text-status-error",
          "aria-invalid:placeholder:text-status-error/50",
          "aria-invalid:focus-visible:shadow-cf-glow-error",
          // Disabled state
          "disabled:cursor-not-allowed",
          "disabled:bg-disabled-bg",
          "disabled:text-disabled-text",
          "disabled:placeholder:text-disabled-text",
          "disabled:border-disabled-border",
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
