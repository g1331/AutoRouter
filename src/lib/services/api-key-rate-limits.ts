import { z } from "zod";

/**
 * PostgreSQL and SQLite both persist API key limits in a signed 32-bit integer
 * column. Keeping the validation bound here prevents values that would pass
 * transport validation but fail at persistence time.
 */
export const MAX_API_KEY_RATE_LIMIT = 2_147_483_647;

/**
 * One optional API key rate-limit dimension. Null means that dimension is
 * unlimited; undefined means a partial update did not include the dimension.
 */
export const nullableApiKeyRateLimitSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_API_KEY_RATE_LIMIT)
  .nullable()
  .optional();

export interface ApiKeyRateLimits {
  rpmLimit: number | null;
  tpmLimit: number | null;
}

/**
 * Normalize a create-time API key rate-limit value. Create inputs have no
 * distinction between omitted and unlimited, so undefined normalizes to null.
 */
export function parseApiKeyRateLimit(input: unknown): number | null {
  return nullableApiKeyRateLimitSchema.parse(input) ?? null;
}
