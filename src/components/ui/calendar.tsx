"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DayPickerProps } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = DayPickerProps;

/**
 * M3 Date Picker Calendar
 *
 * 默认开启 captionLayout="dropdown"（月/年下拉直达）与 fixedWeeks（固定 6 行，
 * 翻月时弹层高度不变，底部按钮位置稳定）。年份下拉范围由调用方通过
 * startMonth/endMonth 控制。
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "dropdown",
  fixedWeeks = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      fixedWeeks={fixedWeeks}
      className={cn("p-3", className)}
      classNames={{
        months: "relative flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        month_caption: "flex h-9 items-center justify-center text-foreground",
        caption_label: "type-title-small flex items-center gap-1",
        // 绝对定位让前/后翻月按钮始终固定在弹层左右上角，不随内容宽高漂移；
        // 容器本身穿透点击，避免盖住中间的月/年下拉
        nav: "pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between",
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "pointer-events-auto h-9 w-9 text-muted-foreground"
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "pointer-events-auto h-9 w-9 text-muted-foreground"
        ),
        dropdowns: "flex items-center justify-center gap-1.5",
        dropdown_root: cn(
          "relative inline-flex items-center rounded-cf-sm border border-border bg-surface-200 px-2 py-1",
          "transition-colors hover:bg-surface-300",
          "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
        ),
        // 原生 select 以透明覆盖层承接交互，可见文案由 caption_label 呈现；
        // 弹出的原生选项列表不跟随页面主题，显式指定选项配色保证两种主题下可读
        dropdown: cn(
          "absolute inset-0 cursor-pointer opacity-0",
          "[&>option]:bg-[var(--popover)] [&>option]:text-[var(--popover-foreground)]"
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
        Chevron: ({ orientation, className: chevronClassName }) => {
          const Icon =
            orientation === "left"
              ? ChevronLeft
              : orientation === "right"
                ? ChevronRight
                : ChevronDown;
          return (
            <Icon
              className={cn(
                orientation === "down" ? "h-4 w-4" : "h-5 w-5",
                "text-muted-foreground",
                chevronClassName
              )}
            />
          );
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
