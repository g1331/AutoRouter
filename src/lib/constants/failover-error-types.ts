import { z } from "zod";
import type { FailoverErrorType } from "@/types/api";

export const FAILOVER_ERROR_TYPES = [
  "timeout",
  "first_byte_timeout",
  "upstream_no_content_stream",
  "stream_idle_timeout",
  "stream_error",
  "http_5xx",
  "http_4xx",
  "http_429",
  "connection_error",
  "circuit_open",
  "concurrency_full",
] as const satisfies readonly FailoverErrorType[];

export const failoverErrorTypeSchema = z.enum(FAILOVER_ERROR_TYPES);

export function isKnownFailoverErrorType(value: unknown): value is FailoverErrorType {
  return typeof value === "string" && (FAILOVER_ERROR_TYPES as readonly string[]).includes(value);
}
