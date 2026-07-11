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
          "flex justify-center pt-1 relative items-center type-title-small text-foreground",
        caption_label: "type-title-small",
        nav: "space-x-1 flex items-center",
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "h-9 w-9 text-muted-foreground"
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "h-9 w-9 text-muted-foreground"
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday: "text-muted-foreground rounded-full w-10 type-label-medium",
        week: "flex w-full mt-2",
        day: cn(
          "h-10 w-10 text-center p-0 relative",
          "[&:has([aria-selected].day-range-end)]:rounded-r-full",
          "[&:has([aria-selected].day-outside)]:bg-[var(--vr-accent-dim)]",
          "[&:has([aria-selected])]:bg-[var(--vr-accent-dim)]",
          "first:[&:has([aria-selected])]:rounded-l-full",
          "last:[&:has([aria-selected])]:rounded-r-full",
          "focus-within:relative focus-within:z-20"
        ),
        day_button: cn(
          "h-10 w-10 p-0 type-body-medium rounded-full transition-colors",
          "text-foreground",
          "hover:bg-foreground/10",
          "focus-visible:outline-none focus-visible:bg-foreground/10",
          "aria-selected:opacity-100"
        ),
        range_end: "day-range-end",
        selected: cn(
          "bg-amber-500 text-[var(--vr-accent-ink)]",
          "hover:bg-amber-500 hover:text-[var(--vr-accent-ink)]",
          "focus:bg-amber-500 focus:text-[var(--vr-accent-ink)]"
        ),
        today: cn("border-2 border-amber-500 text-amber-500"),
        outside: cn(
          "day-outside text-muted-foreground opacity-50",
          "aria-selected:bg-[var(--vr-accent-dim)]",
          "aria-selected:text-amber-800 dark:aria-selected:text-amber-100",
          "aria-selected:opacity-30"
        ),
        disabled: "text-disabled-text cursor-not-allowed",
        range_middle: cn(
          "aria-selected:bg-[var(--vr-accent-dim)]",
          "aria-selected:text-amber-800 dark:aria-selected:text-amber-100"
        ),
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return <Icon className="h-5 w-5 text-muted-foreground" />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
