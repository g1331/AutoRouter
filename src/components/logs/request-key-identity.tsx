"use client";

import { useTranslations } from "next-intl";
import type { RequestLog } from "@/types/api";
import { cn } from "@/lib/utils";
import { TruncatedTextTooltip } from "@/components/logs/truncated-text-tooltip";

export function getRequestKeyDisplayMeta(options: {
  keyName: string | null | undefined;
  keyPrefix: string | null | undefined;
  fallbackLabel: string;
}) {
  const keyName = options.keyName?.trim() ? options.keyName.trim() : null;
  const keyPrefix = options.keyPrefix?.trim() ? options.keyPrefix.trim() : null;

  if (keyName && keyPrefix) {
    return {
      primaryLabel: keyName,
      secondaryLabel: keyPrefix,
      tooltipLabel: `${keyName} · ${keyPrefix}`,
      hasKeyData: true,
    };
  }

  if (keyName) {
    return {
      primaryLabel: keyName,
      secondaryLabel: null,
      tooltipLabel: keyName,
      hasKeyData: true,
    };
  }

  if (keyPrefix) {
    return {
      primaryLabel: keyPrefix,
      secondaryLabel: null,
      tooltipLabel: keyPrefix,
      hasKeyData: true,
    };
  }

  return {
    primaryLabel: options.fallbackLabel,
    secondaryLabel: null,
    tooltipLabel: options.fallbackLabel,
    hasKeyData: false,
  };
}

export function RequestKeyIdentity({
  keyName,
  keyPrefix,
  className,
  textClassName,
  compact = false,
}: {
  keyName: RequestLog["api_key_name"] | null | undefined;
  keyPrefix: RequestLog["api_key_prefix"] | null | undefined;
  className?: string;
  textClassName?: string;
  compact?: boolean;
}) {
  const t = useTranslations("logs");
  const keyMeta = getRequestKeyDisplayMeta({
    keyName,
    keyPrefix,
    fallbackLabel: t("unknownKey"),
  });

  if (!keyMeta.hasKeyData) {
    return <span className="text-muted-foreground">{keyMeta.primaryLabel}</span>;
  }

  return (
    <div className={cn("flex min-w-0 max-w-full items-center gap-1.5", className)}>
      <TruncatedTextTooltip text={keyMeta.primaryLabel} className={cn("shrink", textClassName)} />
      {keyMeta.secondaryLabel ? (
        <span
          className={cn(
            "shrink-0 rounded-cf-sm border border-divider bg-surface-300 px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground",
            compact && "px-1 py-0 text-[9px]"
          )}
          title={keyMeta.secondaryLabel}
        >
          {keyMeta.secondaryLabel}
        </span>
      ) : null}
    </div>
  );
}
