import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * M3 Text Area (Outlined variant)
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[120px] w-full rounded-[var(--shape-corner-extra-small)] border border-[rgb(var(--md-sys-color-outline))] bg-transparent px-4 py-3 type-body-large text-[rgb(var(--md-sys-color-on-surface))] transition-colors resize-none",
          "placeholder:text-[rgb(var(--md-sys-color-on-surface-variant))]",
          "hover:border-[rgb(var(--md-sys-color-on-surface))]",
          "focus-visible:outline-none focus-visible:border-2 focus-visible:border-[rgb(var(--md-sys-color-primary))]",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:border-[rgb(var(--md-sys-color-on-surface)_/_0.12)]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
