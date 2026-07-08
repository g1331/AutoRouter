import { sql, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";

/**
 * Escape SQL LIKE metacharacters so user input matches literally.
 * `\` must be escaped first, then `%` and `_`; the query using the
 * result must declare `ESCAPE '\'`.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Case-insensitive substring match usable on both PostgreSQL and SQLite.
 * The needle is trimmed, lowercased, and LIKE-escaped so `%`, `_` and `\`
 * in user input match literally instead of acting as wildcards.
 *
 * Note: SQLite's built-in lower() only folds ASCII, so non-ASCII uppercase
 * column values will not match on the SQLite dialect (dev sandbox); the
 * PostgreSQL dialect folds per its collation and behaves as expected.
 */
export function caseInsensitiveLike(column: AnyColumn, needle: string): SQL {
  const pattern = `%${escapeLikePattern(needle.trim().toLowerCase())}%`;
  return sql`lower(${column}) like ${pattern} escape '\\'`;
}
