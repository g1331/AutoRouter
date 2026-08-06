/**
 * Parse an optional integer query parameter into one of three states:
 * `undefined` when absent or empty, `null` when present but invalid, or the
 * parsed integer. Callers can reject the invalid state before building a query.
 */
export function parseIntFilterParam(raw: string | null): number | null | undefined {
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : null;
}

/**
 * Parse an optional ISO datetime query parameter into one of three states:
 * `undefined` when absent or empty, `null` when present but invalid, or the
 * parsed Date. Callers can reject the invalid state before reaching a query.
 */
export function parseDateFilterParam(raw: string | null): Date | null | undefined {
  if (!raw) {
    return undefined;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
