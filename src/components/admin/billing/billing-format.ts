import { useMemo } from "react";

import type { BackgroundSyncTaskLastStatus } from "@/types/api";

export type BillingTranslate = (key: string, values?: Record<string, string | number>) => string;

export type EditTarget =
  | { kind: "price"; model: string }
  | { kind: "tierRule"; ruleId: string; model: string }
  | { kind: "tierOverride"; model: string; threshold: number }
  | null;

export const PRICE_FIELDS_SHORT = [
  ["input", "IN"],
  ["output", "OUT"],
  ["cacheRead", "CR"],
  ["cacheWrite", "CW"],
] as const;

export function useUsdFormatter(locale: string) {
  return useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "USD",
        // Avoid "US$" prefix in some locales (e.g. zh-CN) to keep cost display compact.
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      }),
    [locale]
  );
}

export function parseRequiredPrice(raw: string): number | null {
  const value = Number(raw);
  if (!raw.trim() || Number.isNaN(value) || value < 0) {
    return null;
  }
  return value;
}

export function parseOptionalPrice(raw: string): number | null | "invalid" {
  if (!raw.trim()) {
    return null;
  }
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0) {
    return "invalid";
  }
  return value;
}

export function getSyncBadgeVariant(
  status: string | null
): "success" | "warning" | "error" | "neutral" {
  if (!status) return "neutral";
  if (status === "success") return "success";
  if (status === "partial" || status === "running" || status === "skipped") return "warning";
  if (status === "failed") return "error";
  return "neutral";
}

export function getBillingTaskStatusLabel(
  t: BillingTranslate,
  status: BackgroundSyncTaskLastStatus | null,
  fallback: string
): string {
  if (!status) return fallback;
  if (status === "success") return t("syncTaskSuccess");
  if (status === "partial") return t("syncTaskPartial");
  if (status === "failed") return t("syncTaskFailed");
  if (status === "running") return t("syncTaskRunning");
  return t("syncTaskSkipped");
}

export function formatPriceNumber(value: number | null): string {
  if (value == null) return "-";
  return value.toFixed(4);
}

export function parsePositiveInt(raw: string): number | null {
  const value = Number(raw);
  if (!raw.trim() || Number.isNaN(value) || value <= 0 || !Number.isInteger(value)) {
    return null;
  }
  return value;
}
