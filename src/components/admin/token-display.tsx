"use client";

import { Database } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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
 * Token Tooltip Content
 *
 * Shows detailed token breakdown in terminal style.
 * Following Cassette Futurism design language:
 * - Mono font for data alignment
 * - amber-500 for primary values
 * - amber-700 for secondary/zero values
 * - status-info for cache-related values
 */
function TokenTooltipContent({
  promptTokens,
  completionTokens,
  totalTokens,
  cachedTokens,
  reasoningTokens,
  cacheCreationTokens,
  cacheReadTokens,
}: TokenDisplayProps) {
  const t = useTranslations("logs");

  // Calculate new tokens (non-cached input tokens)
  const newInputTokens = promptTokens - cachedTokens;

  // Build rows dynamically, hiding zero values for clarity (except core metrics)
  const rows: Array<{
    label: string;
    value: number;
    highlight: boolean;
    isCache?: boolean;
    indent?: boolean;
  }> = [{ label: t("tokenInput"), value: promptTokens, highlight: true }];

  // Only show cache breakdown if there's cached content
  if (cachedTokens > 0) {
    rows.push({
      label: t("tokenCached"),
      value: cachedTokens,
      highlight: true,
      isCache: true,
      indent: true,
    });
    rows.push({ label: t("tokenNew"), value: newInputTokens, highlight: false, indent: true });
  }

  rows.push({ label: t("tokenOutput"), value: completionTokens, highlight: true });

  // Only show reasoning if present (o1/o3 models)
  if (reasoningTokens > 0) {
    rows.push({
      label: t("tokenReasoning"),
      value: reasoningTokens,
      highlight: false,
      indent: true,
    });
  }

  // Only show cache creation if present (Anthropic)
  if (cacheCreationTokens > 0) {
    rows.push({
      label: t("tokenCacheWrite"),
      value: cacheCreationTokens,
      highlight: false,
      isCache: true,
    });
  }

  // Only show cache read if present (Anthropic)
  if (cacheReadTokens > 0) {
    rows.push({
      label: t("tokenCacheRead"),
      value: cacheReadTokens,
      highlight: false,
      isCache: true,
    });
  }

  return (
    <div className="min-w-[180px]">
      <div className="text-amber-500 uppercase tracking-wider mb-2 text-[10px] border-b border-amber-500/30 pb-1">
        {t("tokenDetails")}
      </div>
      <div className="space-y-1">
        {rows.map((row, idx) => (
          <div key={idx} className="flex justify-between items-center">
            <span
              className={
                row.isCache
                  ? "text-status-info"
                  : row.highlight
                    ? "text-amber-500"
                    : "text-amber-700"
              }
            >
              {row.indent ? "  " : ""}
              {row.label}
            </span>
            <span
              className={
                row.isCache
                  ? "text-status-info"
                  : row.highlight
                    ? "text-amber-500"
                    : "text-amber-700"
              }
            >
              {row.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-amber-500/30 mt-2 pt-2">
        <div className="flex justify-between items-center">
          <span className="text-amber-500 font-medium">{t("tokenTotal")}</span>
          <span className="text-amber-500 font-medium">{totalTokens.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Token Display Component
 *
 * Compact display for table cell with tooltip for details.
 * Follows Cassette Futurism design:
 * - Total in amber-500 (primary emphasis)
 * - Input/Output breakdown in amber-700 (secondary info)
 * - Cache indicator with Database icon in info color when cached_tokens > 0
 */
export function TokenDisplay({
  promptTokens,
  completionTokens,
  totalTokens,
  cachedTokens,
  reasoningTokens,
  cacheCreationTokens,
  cacheReadTokens,
}: TokenDisplayProps) {
  if (totalTokens === 0) {
    return <span className="text-amber-700">-</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex flex-col text-xs font-mono cursor-help">
          {/* Row 1: Total tokens - amber-500, primary emphasis */}
          <span className="text-amber-500">{totalTokens.toLocaleString()}</span>
          {/* Row 2: Input / Output breakdown - amber-700, secondary */}
          <span className="text-amber-700 text-[10px]">
            {promptTokens.toLocaleString()} / {completionTokens.toLocaleString()}
          </span>
          {/* Row 3: Cache indicator - info color with Database icon */}
          {cachedTokens > 0 && (
            <Badge variant="info" className="mt-0.5 px-1.5 py-0 text-[9px] w-fit gap-0.5">
              <Database className="w-2.5 h-2.5" aria-hidden="true" />
              {cachedTokens.toLocaleString()}
            </Badge>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" align="start">
        <TokenTooltipContent
          promptTokens={promptTokens}
          completionTokens={completionTokens}
          totalTokens={totalTokens}
          cachedTokens={cachedTokens}
          reasoningTokens={reasoningTokens}
          cacheCreationTokens={cacheCreationTokens}
          cacheReadTokens={cacheReadTokens}
        />
      </TooltipContent>
    </Tooltip>
  );
}
