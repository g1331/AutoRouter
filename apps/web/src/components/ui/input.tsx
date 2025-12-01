import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * M3 Text Field (Outlined variant)
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full box-border rounded-[var(--shape-corner-small)] border border-[rgb(var(--md-sys-color-outline))] bg-transparent px-4 py-2 type-body-large text-[rgb(var(--md-sys-color-on-surface))] transition-colors",
          "placeholder:text-[rgb(var(--md-sys-color-on-surface-variant))]",
          "hover:border-[rgb(var(--md-sys-color-on-surface))]",
          "focus-visible:outline-none focus-visible:border-2 focus-visible:border-[rgb(var(--md-sys-color-primary))]",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:border-[rgb(var(--md-sys-color-on-surface)_/_0.12)]",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
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
