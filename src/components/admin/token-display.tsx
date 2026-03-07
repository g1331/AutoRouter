"use client";

import { Download, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TokenDisplayProps {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  cacheCreationTokens: number;
  cacheCreation5mTokens?: number;
  cacheCreation1hTokens?: number;
  cacheReadTokens: number;
}

interface TokenDetailContentProps extends TokenDisplayProps {
  showHeader?: boolean;
  className?: string;
}

type TokenDirection = "input" | "output";

function TokenDirectionMarker({ direction }: { direction: TokenDirection }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center font-semibold",
        direction === "input" ? "text-status-info" : "text-status-success"
      )}
    >
      {direction === "input" ? "↑" : "↓"}
    </span>
  );
}

/**
 * Calculate effective cache read tokens.
 * - Anthropic: uses cacheReadTokens directly
 * - OpenAI: uses cachedTokens (equivalent to cache read)
 */
function getEffectiveCacheRead(cacheReadTokens: number, cachedTokens: number): number {
  return cacheReadTokens > 0 ? cacheReadTokens : cachedTokens;
}

interface CacheUsageBreakdown {
  effectiveCacheRead: number;
  newInputTokens: number;
  cacheHitRate: number | null;
}

interface TokenDisplayMetrics extends CacheUsageBreakdown {
  displayTotalTokens: number;
}

function formatCacheRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) {
    return "0.00";
  }
  return Math.min(Math.max(rate, 0), 100).toFixed(2);
}

/**
 * Normalize cache breakdown across provider usage formats.
 * Some providers report prompt tokens excluding cache-read tokens, which can otherwise
 * produce impossible cache hit rates (>100%).
 */
function getCacheUsageBreakdown(
  promptTokens: number,
  cacheReadTokens: number,
  cachedTokens: number
): CacheUsageBreakdown {
  const safePromptTokens = Math.max(promptTokens, 0);
  const effectiveCacheRead = Math.max(getEffectiveCacheRead(cacheReadTokens, cachedTokens), 0);

  if (effectiveCacheRead === 0) {
    return {
      effectiveCacheRead,
      newInputTokens: safePromptTokens,
      cacheHitRate: null,
    };
  }

  if (safePromptTokens >= effectiveCacheRead) {
    return {
      effectiveCacheRead,
      newInputTokens: Math.max(safePromptTokens - effectiveCacheRead, 0),
      cacheHitRate: safePromptTokens > 0 ? (effectiveCacheRead / safePromptTokens) * 100 : null,
    };
  }

  const effectiveInputTokens = safePromptTokens + effectiveCacheRead;
  return {
    effectiveCacheRead,
    newInputTokens: safePromptTokens,
    cacheHitRate:
      effectiveInputTokens > 0 ? (effectiveCacheRead / effectiveInputTokens) * 100 : null,
  };
}

export function getDisplayTokenMetrics({
  promptTokens,
  completionTokens,
  totalTokens,
  cachedTokens,
  cacheCreationTokens,
  cacheReadTokens,
}: Pick<
  TokenDisplayProps,
  | "promptTokens"
  | "completionTokens"
  | "totalTokens"
  | "cachedTokens"
  | "cacheCreationTokens"
  | "cacheReadTokens"
>): TokenDisplayMetrics {
  const cacheUsageBreakdown = getCacheUsageBreakdown(promptTokens, cacheReadTokens, cachedTokens);
  const displayTotalTokens = Math.max(
    Math.max(totalTokens, 0),
    cacheUsageBreakdown.newInputTokens +
      Math.max(completionTokens, 0) +
      Math.max(cacheCreationTokens, 0) +
      cacheUsageBreakdown.effectiveCacheRead
  );

  return {
    ...cacheUsageBreakdown,
    displayTotalTokens,
  };
}

/**
 * Token Detail Content
 *
 * Shows detailed token breakdown in terminal style with grouped sections.
 * Used in expanded row details.
 * Following current dashboard design language:
 * - Mono font for data alignment
 * - Neutral foreground/muted tones for hierarchy
 * - status-info badges for cache-related values
 *
 * Display format:
 * ```
 * 输入: 4,002
 * 输出: 501
 *   推理: 300
 *   回复: 201
 * ---
 * 缓存写入: 100
 * 缓存读取: 3,000
 * ---
 * 总计: 4,503
 * ```
 */
export function TokenDetailContent({
  promptTokens,
  completionTokens,
  totalTokens,
  cachedTokens,
  reasoningTokens,
  cacheCreationTokens,
  cacheCreation5mTokens = 0,
  cacheCreation1hTokens = 0,
  cacheReadTokens,
  showHeader = true,
  className,
}: TokenDetailContentProps) {
  const t = useTranslations("logs");
  const { effectiveCacheRead, newInputTokens, cacheHitRate, displayTotalTokens } =
    getDisplayTokenMetrics({
      promptTokens,
      completionTokens,
      totalTokens,
      cachedTokens,
      cacheCreationTokens,
      cacheReadTokens,
    });

  // Build main token rows (input, output, reasoning breakdown)
  const mainRows: Array<{
    label: string;
    value: number;
    highlight: boolean;
    indent?: boolean;
    direction?: TokenDirection;
  }> = [
    { label: t("tokenInput"), value: promptTokens, highlight: true, direction: "input" },
    { label: t("tokenOutput"), value: completionTokens, highlight: true, direction: "output" },
  ];

  // Input breakdown: cache hit is a subset of input_tokens (not additive).
  if (effectiveCacheRead > 0) {
    mainRows.splice(1, 0, {
      label: t("tokenCacheHit"),
      value: effectiveCacheRead,
      highlight: false,
      indent: true,
    });
    mainRows.splice(2, 0, {
      label: t("tokenInputNew"),
      value: newInputTokens,
      highlight: false,
      indent: true,
      direction: "input",
    });
  }

  // Anthropic: cache creation tokens (subset of input tokens) can be useful to show explicitly.
  if (cacheCreationTokens > 0) {
    const cacheWriteInsertIndex = 1;
    mainRows.splice(cacheWriteInsertIndex, 0, {
      label: t("tokenCacheWrite"),
      value: cacheCreationTokens,
      highlight: false,
      indent: true,
    });

    let ttlInsertIndex = cacheWriteInsertIndex + 1;
    if (cacheCreation5mTokens > 0) {
      mainRows.splice(ttlInsertIndex, 0, {
        label: t("tokenCacheWrite5m"),
        value: cacheCreation5mTokens,
        highlight: false,
        indent: true,
      });
      ttlInsertIndex += 1;
    }

    if (cacheCreation1hTokens > 0) {
      mainRows.splice(ttlInsertIndex, 0, {
        label: t("tokenCacheWrite1h"),
        value: cacheCreation1hTokens,
        highlight: false,
        indent: true,
      });
    }
  }

  // Show reasoning breakdown if present (OpenAI o1/o3 models)
  // Split output into: reasoning + reply
  if (reasoningTokens > 0) {
    const replyTokens = Math.max(completionTokens - reasoningTokens, 0);
    mainRows.push({
      label: t("tokenReasoning"),
      value: reasoningTokens,
      highlight: false,
      indent: true,
    });
    mainRows.push({
      label: t("tokenReply"),
      value: replyTokens,
      highlight: false,
      indent: true,
    });
  }

  return (
    <div
      className={cn(
        "font-mono text-xs",
        showHeader ? "min-w-[180px] max-w-[460px]" : "w-full",
        className
      )}
    >
      {showHeader && (
        <div className="mb-2 border-b border-divider pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          {t("tokenDetails")}
        </div>
      )}

      {/* Main token rows */}
      <div className="space-y-1">
        {mainRows.map((row, idx) => (
          <div key={idx} className="grid grid-cols-[auto_auto] items-center gap-x-3">
            <span
              className={cn(
                "inline-flex items-center gap-1",
                row.highlight ? "text-foreground" : "text-muted-foreground",
                row.indent ? "pl-4" : ""
              )}
            >
              {row.direction && <TokenDirectionMarker direction={row.direction} />}
              <span>{row.label}</span>
            </span>
            <span
              className={cn(
                row.highlight ? "text-foreground" : "text-muted-foreground",
                "text-right justify-self-end"
              )}
            >
              {row.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="mt-2 border-t border-divider pt-2">
        <div className="grid grid-cols-[auto_auto] items-center gap-x-3">
          <span className="font-medium text-foreground">{t("tokenTotal")}</span>
          <span className="font-medium text-foreground text-right justify-self-end">
            {displayTotalTokens.toLocaleString()}
          </span>
        </div>
        {effectiveCacheRead > 0 && cacheHitRate !== null && (
          <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <span>{t("tokenCacheHitPercent")}:</span>
            <span className="tabular-nums">{formatCacheRate(cacheHitRate)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Token Display Component
 *
 * Compact display for table cell. Details shown in expanded row.
 * Follows the neutral dashboard style:
 * - Total uses foreground for primary emphasis
 * - Input/Output breakdown uses muted foreground
 * - Cache indicators use clearer upload/download icons for write vs read
 */
export function TokenDisplay({
  promptTokens,
  completionTokens,
  totalTokens,
  cachedTokens,
  cacheCreationTokens,
  cacheCreation5mTokens: _cacheCreation5mTokens = 0,
  cacheCreation1hTokens: _cacheCreation1hTokens = 0,
  cacheReadTokens,
}: TokenDisplayProps) {
  const t = useTranslations("logs");

  const { effectiveCacheRead, newInputTokens, displayTotalTokens } = getDisplayTokenMetrics({
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens,
    cacheCreationTokens,
    cacheReadTokens,
  });

  if (displayTotalTokens === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <div className="flex flex-col text-xs font-mono">
      {/* Row 1: Total tokens - primary emphasis */}
      <span className="text-foreground">{displayTotalTokens.toLocaleString()}</span>
      {/* Row 2: New Input / Output breakdown - secondary */}
      <span className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-0.5">
          <TokenDirectionMarker direction="input" />
          <span>{newInputTokens.toLocaleString()}</span>
        </span>
        <span>/</span>
        <span className="inline-flex items-center gap-0.5">
          <TokenDirectionMarker direction="output" />
          <span>{completionTokens.toLocaleString()}</span>
        </span>
      </span>
      {/* Row 3: Cache indicators */}
      {(effectiveCacheRead > 0 || cacheCreationTokens > 0) && (
        <div className="mt-0.5 flex flex-wrap gap-1">
          {cacheCreationTokens > 0 && (
            <Badge
              variant="info"
              className="w-fit gap-1 px-1.5 py-0 text-[9px]"
              aria-label={`${t("tokenCacheWrite")} ${cacheCreationTokens.toLocaleString()}`}
            >
              <Upload className="h-2.5 w-2.5" aria-hidden="true" />
              <span className="font-semibold">W</span>
              <span>{cacheCreationTokens.toLocaleString()}</span>
            </Badge>
          )}
          {effectiveCacheRead > 0 && (
            <Badge
              variant="info"
              className="w-fit gap-1 px-1.5 py-0 text-[9px]"
              aria-label={`${t("tokenCacheHit")} ${effectiveCacheRead.toLocaleString()}`}
            >
              <Download className="h-2.5 w-2.5" aria-hidden="true" />
              <span className="font-semibold">R</span>
              <span>{effectiveCacheRead.toLocaleString()}</span>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
