"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * M3 Checkbox
 */
const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-[18px] w-[18px] shrink-0 rounded-[2px] border-2 border-[rgb(var(--md-sys-color-outline))] transition-all duration-200",
      "hover:border-[rgb(var(--md-sys-color-on-surface))]",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--md-sys-color-primary))] focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:bg-[rgb(var(--md-sys-color-primary))] data-[state=checked]:border-[rgb(var(--md-sys-color-primary))] data-[state=checked]:text-[rgb(var(--md-sys-color-on-primary))]",
      "data-[state=indeterminate]:bg-[rgb(var(--md-sys-color-primary))] data-[state=indeterminate]:border-[rgb(var(--md-sys-color-primary))] data-[state=indeterminate]:text-[rgb(var(--md-sys-color-on-primary))]",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("flex items-center justify-center text-current")}
    >
      <Check className="h-4 w-4" strokeWidth={3} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
