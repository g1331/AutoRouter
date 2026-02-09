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
 * Following Cassette Futurism design language:
 * - Mono font for data alignment
 * - amber-500 for primary values
 * - amber-700 for secondary/zero values
 * - status-info for cache-related values
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
}: TokenDisplayProps) {
  const t = useTranslations("logs");
  const effectiveCacheRead = getEffectiveCacheRead(cacheReadTokens, cachedTokens);
  const newInputTokens = Math.max(promptTokens - effectiveCacheRead, 0);

  // Build main token rows (input, output, reasoning breakdown)
  const mainRows: Array<{
    label: string;
    value: number;
    highlight: boolean;
    indent?: boolean;
  }> = [
    { label: t("tokenInput"), value: promptTokens, highlight: true },
    { label: t("tokenOutput"), value: completionTokens, highlight: true },
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
    <div className="min-w-[180px] max-w-[460px] font-mono text-xs">
      {/* Header */}
      <div className="text-amber-500 uppercase tracking-wider mb-2 text-[10px] border-b border-amber-500/30 pb-1">
        {t("tokenDetails")}
      </div>

      {/* Main token rows */}
      <div className="space-y-1">
        {mainRows.map((row, idx) => (
          <div key={idx} className="grid grid-cols-[auto_auto] items-center gap-x-3">
            <span
              className={cn(
                row.highlight ? "text-amber-500" : "text-amber-700",
                row.indent ? "pl-4" : ""
              )}
            >
              {row.label}
            </span>
            <span
              className={cn(
                row.highlight ? "text-amber-500" : "text-amber-700",
                "text-right justify-self-end"
              )}
            >
              {row.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="border-t border-amber-500/30 mt-2 pt-2">
        <div className="grid grid-cols-[auto_auto] items-center gap-x-3">
          <span className="text-amber-500 font-medium">{t("tokenTotal")}</span>
          <span className="text-amber-500 font-medium text-right justify-self-end">
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
 * Follows Cassette Futurism design:
 * - Total in amber-500 (primary emphasis)
 * - Input/Output breakdown in amber-700 (secondary info)
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
    return <span className="text-amber-700">-</span>;
  }

  const effectiveCacheRead = getEffectiveCacheRead(cacheReadTokens, cachedTokens);
  const newInputTokens = Math.max(promptTokens - effectiveCacheRead, 0);

  return (
    <div className="flex flex-col text-xs font-mono">
      {/* Row 1: Total tokens - amber-500, primary emphasis */}
      <span className="text-amber-500">{totalTokens.toLocaleString()}</span>
      {/* Row 2: New Input / Output breakdown - amber-700, secondary */}
      <span className="text-amber-700 text-[10px]">
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
