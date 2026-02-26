"use client";

import { Database } from "lucide-react";
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
  cacheReadTokens: number;
}

interface TokenDetailContentProps extends TokenDisplayProps {
  showHeader?: boolean;
  className?: string;
}

/**
 * Calculate effective cache read tokens.
 * - Anthropic: uses cacheReadTokens directly
 * - OpenAI: uses cachedTokens (equivalent to cache read)
 */
function getEffectiveCacheRead(cacheReadTokens: number, cachedTokens: number): number {
  return cacheReadTokens > 0 ? cacheReadTokens : cachedTokens;
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
  cacheReadTokens,
  showHeader = true,
  className,
}: TokenDetailContentProps) {
  const t = useTranslations("logs");
  const effectiveCacheRead = getEffectiveCacheRead(cacheReadTokens, cachedTokens);
  const newInputTokens = Math.max(promptTokens - effectiveCacheRead, 0);

  // Build main token rows (input, output, reasoning breakdown)
  const mainRows: Array<{
    label: string;
    value: number;
    highlight: boolean;
    indent?: boolean;
    suffix?: string;
  }> = [
    { label: t("tokenInput"), value: promptTokens, highlight: true },
    { label: t("tokenOutput"), value: completionTokens, highlight: true },
  ];

  // Input breakdown: cache hit is a subset of input_tokens (not additive).
  if (effectiveCacheRead > 0) {
    const cachePercent =
      promptTokens > 0 ? Math.round((effectiveCacheRead / promptTokens) * 100) : 0;
    mainRows.splice(1, 0, {
      label: t("tokenCacheHit"),
      value: effectiveCacheRead,
      highlight: false,
      indent: true,
      suffix: `(${cachePercent}%)`,
    });
    mainRows.splice(2, 0, {
      label: t("tokenInputNew"),
      value: newInputTokens,
      highlight: false,
      indent: true,
    });
  }

  // Anthropic: cache creation tokens (subset of input tokens) can be useful to show explicitly.
  if (cacheCreationTokens > 0) {
    mainRows.splice(1, 0, {
      label: t("tokenCacheWrite"),
      value: cacheCreationTokens,
      highlight: false,
      indent: true,
    });
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
                row.highlight ? "text-foreground" : "text-muted-foreground",
                row.indent ? "pl-4" : ""
              )}
            >
              {row.label}
            </span>
            <span
              className={cn(
                row.highlight ? "text-foreground" : "text-muted-foreground",
                "text-right justify-self-end"
              )}
            >
              {row.value.toLocaleString()}
              {row.suffix && <span className="ml-1 text-muted-foreground">{row.suffix}</span>}
            </span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="mt-2 border-t border-divider pt-2">
        <div className="grid grid-cols-[auto_auto] items-center gap-x-3">
          <span className="font-medium text-foreground">{t("tokenTotal")}</span>
          <span className="font-medium text-foreground text-right justify-self-end">
            {totalTokens.toLocaleString()}
          </span>
        </div>
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
 * - Cache indicator with Database icon in info color when effectiveCacheRead > 0
 */
export function TokenDisplay({
  promptTokens,
  completionTokens,
  totalTokens,
  cachedTokens,
  cacheCreationTokens,
  cacheReadTokens,
}: TokenDisplayProps) {
  const t = useTranslations("logs");

  if (totalTokens === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  const effectiveCacheRead = getEffectiveCacheRead(cacheReadTokens, cachedTokens);
  const newInputTokens = Math.max(promptTokens - effectiveCacheRead, 0);

  return (
    <div className="flex flex-col text-xs font-mono">
      {/* Row 1: Total tokens - primary emphasis */}
      <span className="text-foreground">{totalTokens.toLocaleString()}</span>
      {/* Row 2: New Input / Output breakdown - secondary */}
      <span className="text-[10px] text-muted-foreground">
        {newInputTokens.toLocaleString()} / {completionTokens.toLocaleString()}
      </span>
      {/* Row 3: Cache indicators */}
      {(effectiveCacheRead > 0 || cacheCreationTokens > 0) && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {effectiveCacheRead > 0 && (
            <Badge variant="info" className="px-1.5 py-0 text-[9px] w-fit gap-0.5">
              <Database className="w-2.5 h-2.5" aria-hidden="true" />
              <span>{t("tokenCacheHitShort")}</span>
              <span>{effectiveCacheRead.toLocaleString()}</span>
            </Badge>
          )}
          {cacheCreationTokens > 0 && (
            <Badge variant="info" className="px-1.5 py-0 text-[9px] w-fit gap-0.5">
              <Database className="w-2.5 h-2.5" aria-hidden="true" />
              <span>{t("tokenCacheWriteShort")}</span>
              <span>{cacheCreationTokens.toLocaleString()}</span>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
