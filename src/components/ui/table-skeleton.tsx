import * as React from "react";

import { cn } from "@/lib/utils";
import { Skeleton } from "./skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

interface TableSkeletonProps {
  /** Number of skeleton rows to display (default: 5) */
  rows?: number;
  /** Number of columns in the table (default: 4) */
  columns?: number;
  /** Show header row with skeleton placeholders */
  showHeader?: boolean;
  /** Custom className for the table container */
  className?: string;
  /** Custom placeholder text for cells */
  placeholder?: string;
}

/**
 * Cassette Futurism Table Loading Skeleton
 *
 * Terminal-style loading placeholder that matches table structure:
 * - Inline skeleton placeholders for each cell
 * - Configurable rows and columns
 * - Optional header row
 * - Maintains table layout to prevent CLS
 *
 * Respects prefers-reduced-motion through Skeleton component.
 */
function TableSkeleton({
  rows = 5,
  columns = 4,
  showHeader = true,
  className,
  placeholder = "---",
}: TableSkeletonProps) {
  // Generate array of row indices
  const rowIndices = Array.from({ length: rows }, (_, i) => i);
  // Generate array of column indices
  const columnIndices = Array.from({ length: columns }, (_, i) => i);

  return (
    <div
      role="status"
      aria-label="Loading table data"
      className={cn("w-full", className)}
    >
      <Table>
        {showHeader && (
          <TableHeader>
            <TableRow>
              {columnIndices.map((colIndex) => (
                <TableHead key={`header-${colIndex}`}>
                  <Skeleton
                    variant="inline"
                    placeholder={placeholder}
                    showCursor={colIndex === 0}
                    scanlines={false}
                    className="inline-flex"
                  />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {rowIndices.map((rowIndex) => (
            <TableRow key={`row-${rowIndex}`}>
              {columnIndices.map((colIndex) => (
                <TableCell key={`cell-${rowIndex}-${colIndex}`}>
                  <Skeleton
                    variant="inline"
                    placeholder={placeholder}
                    showCursor={colIndex === 0 && rowIndex === 0}
                    scanlines={false}
                    className="inline-flex"
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <span className="sr-only">Loading table data, please wait...</span>
    </div>
  );
}

export { TableSkeleton };
export type { TableSkeletonProps };
