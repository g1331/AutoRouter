import * as React from "react";

import { cn, warnIfForbiddenVisualStyle } from "@/lib/utils";

export interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  frame?: "amber" | "subtle" | "none";
  containerClassName?: string;
}

const FRAME_CLASS: Record<NonNullable<TableProps["frame"]>, string> = {
  amber: "border border-amber-500/45 shadow-cf-glow-subtle",
  subtle: "border border-divider",
  none: "border-0",
};

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, frame = "amber", containerClassName, ...props }, ref) => {
    warnIfForbiddenVisualStyle("Table", containerClassName);
    return (
      <div
        className={cn(
          "relative w-full overflow-x-auto overflow-y-hidden rounded-cf-md bg-surface-200",
          FRAME_CLASS[frame],
          containerClassName
        )}
      >
        <table
          ref={ref}
          className={cn("w-full min-w-[640px] caption-bottom text-sm text-foreground", className)}
          {...props}
        />
      </div>
    );
  }
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn("bg-surface-300/90 [&_tr]:border-b [&_tr]:border-divider", className)}
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
      "border-t border-divider bg-surface-300 type-label-medium text-muted-foreground [&>tr]:last:border-b-0",
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
        "border-b border-divider/85",
        "transition-colors duration-cf-normal ease-cf-standard",
        "hover:bg-surface-300/70",
        "data-[state=selected]:bg-amber-500/10 data-[state=selected]:[&>td]:text-foreground",
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
      "h-11 px-4 text-left align-middle",
      "type-label-medium text-muted-foreground",
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
      "h-12 px-4 align-middle type-body-medium text-foreground",
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
    className={cn("mt-3 type-body-small text-muted-foreground", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
