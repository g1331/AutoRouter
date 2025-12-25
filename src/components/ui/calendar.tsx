"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DayPickerProps } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = DayPickerProps;

/**
 * M3 Date Picker Calendar
 */
function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        month_caption:
          "flex justify-center pt-1 relative items-center type-title-small text-[rgb(var(--md-sys-color-on-surface))]",
        caption_label: "type-title-small",
        nav: "space-x-1 flex items-center",
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "h-9 w-9 text-[rgb(var(--md-sys-color-on-surface-variant))]"
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "h-9 w-9 text-[rgb(var(--md-sys-color-on-surface-variant))]"
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday:
          "text-[rgb(var(--md-sys-color-on-surface-variant))] rounded-[var(--shape-corner-full)] w-10 type-label-medium",
        week: "flex w-full mt-2",
        day: cn(
          "h-10 w-10 text-center p-0 relative",
          "[&:has([aria-selected].day-range-end)]:rounded-r-[var(--shape-corner-full)]",
          "[&:has([aria-selected].day-outside)]:bg-[rgb(var(--md-sys-color-primary-container)_/_0.5)]",
          "[&:has([aria-selected])]:bg-[rgb(var(--md-sys-color-primary-container))]",
          "first:[&:has([aria-selected])]:rounded-l-[var(--shape-corner-full)]",
          "last:[&:has([aria-selected])]:rounded-r-[var(--shape-corner-full)]",
          "focus-within:relative focus-within:z-20"
        ),
        day_button: cn(
          "h-10 w-10 p-0 type-body-medium rounded-[var(--shape-corner-full)] transition-colors",
          "text-[rgb(var(--md-sys-color-on-surface))]",
          "hover:bg-[rgb(var(--md-sys-color-on-surface)_/_0.08)]",
          "focus-visible:outline-none focus-visible:bg-[rgb(var(--md-sys-color-on-surface)_/_0.12)]",
          "aria-selected:opacity-100"
        ),
        range_end: "day-range-end",
        selected: cn(
          "bg-[rgb(var(--md-sys-color-primary))] text-[rgb(var(--md-sys-color-on-primary))]",
          "hover:bg-[rgb(var(--md-sys-color-primary))] hover:text-[rgb(var(--md-sys-color-on-primary))]",
          "focus:bg-[rgb(var(--md-sys-color-primary))] focus:text-[rgb(var(--md-sys-color-on-primary))]"
        ),
        today: cn(
          "border-2 border-[rgb(var(--md-sys-color-primary))] text-[rgb(var(--md-sys-color-primary))]"
        ),
        outside: cn(
          "day-outside text-[rgb(var(--md-sys-color-on-surface-variant))] opacity-50",
          "aria-selected:bg-[rgb(var(--md-sys-color-primary-container)_/_0.5)]",
          "aria-selected:text-[rgb(var(--md-sys-color-on-primary-container))]",
          "aria-selected:opacity-30"
        ),
        disabled: "text-[rgb(var(--md-sys-color-on-surface)_/_0.38)] cursor-not-allowed",
        range_middle: cn(
          "aria-selected:bg-[rgb(var(--md-sys-color-primary-container))]",
          "aria-selected:text-[rgb(var(--md-sys-color-on-primary-container))]"
        ),
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return <Icon className="h-5 w-5 text-[rgb(var(--md-sys-color-on-surface-variant))]" />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
