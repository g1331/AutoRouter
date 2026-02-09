import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Cassette Futurism Data Table
 *
 * Terminal-style data display with:
 * - Amber borders and dashed separators
 * - Uppercase monospace headers
 * - Row hover and selection states
 */
export interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /**
   * Controls the outer container frame style.\n   * Default preserves existing behavior.
   */
  frame?: "amber" | "subtle" | "none";
  /**
   * Additional className applied to the outer container.
   */
  containerClassName?: string;
}

const FRAME_CLASS: Record<NonNullable<TableProps["frame"]>, string> = {
  amber: "border-2 border-amber-500",
  subtle: "border border-divider",
  none: "border-0",
};

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, frame = "amber", containerClassName, ...props }, ref) => (
    <div
      className={cn(
        "relative w-full overflow-auto bg-surface-200",
        "rounded-cf-sm",
        FRAME_CLASS[frame],
        containerClassName
      )}
    >
      <table
        ref={ref}
        className={cn("w-full caption-bottom text-sm font-mono text-amber-500", className)}
        {...props}
      />
    </div>
  )
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "bg-surface-300 [&_tr]:border-b [&_tr]:border-dashed [&_tr]:border-divider",
      className
    )}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("bg-surface-200 [&_tr:last-child]:border-b-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t border-dashed border-divider bg-surface-300 font-mono text-amber-500 [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b border-dashed border-divider",
        "border-l-2 border-l-transparent",
        "transition-colors duration-cf-normal ease-cf-standard",
        "hover:bg-surface-400",
        "data-[state=selected]:border-l-amber-500 data-[state=selected]:bg-surface-300",
        className
      )}
      {...props}
    />
  )
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-12 px-4 text-left align-middle",
      "uppercase font-mono text-xs font-medium tracking-[0.1em] text-amber-500",
      "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "h-12 px-4 align-middle font-mono text-amber-500",
      "[&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm font-mono text-amber-700", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
