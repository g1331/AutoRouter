/**
 * Numeric coercion helpers shared by the upstream form schemas and the
 * detail-page section forms. Extracted verbatim from `upstream-form-dialog.tsx`
 * so the dialog and the per-section forms coerce inputs identically.
 */

// Preserve transient empty-string edits in the input, and only coerce to numbers at validation time.
export function coerceNumericInput(
  value: unknown,
  emptyValue: null | undefined
): number | null | undefined | unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return emptyValue;
  }

  return Number(trimmed);
}

export function getNumericInputValue(value: unknown): string | number {
  return typeof value === "string" || typeof value === "number" ? value : "";
}

export function coerceOptionalNumber(value: unknown): number | undefined {
  return coerceNumericInput(value, undefined) as number | undefined;
}
