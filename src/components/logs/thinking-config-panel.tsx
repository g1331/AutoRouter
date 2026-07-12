"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import type { RequestLog } from "@/types/api";
import { cn } from "@/lib/utils";
import { getRequestThinkingBadgeLabel } from "@/lib/utils/request-thinking-config";

const DETAIL_PANEL_CLASS =
  "overflow-hidden rounded-cf-md border border-divider/80 bg-surface-200/82 shadow-[var(--vr-shadow-xs)]";
const DETAIL_PANEL_HEADER_CLASS =
  "border-b border-divider/70 bg-surface-300/72 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground";
const DETAIL_PANEL_BODY_CLASS = "px-4 py-3";
const DETAIL_PANEL_STACK_CLASS = "space-y-3 text-[12px]";
const DETAIL_PANEL_ROW_CLASS =
  "flex items-start gap-3 border-b border-divider/35 py-2 first:pt-0 last:border-b-0 last:pb-0";
const DETAIL_PANEL_LABEL_CLASS =
  "min-w-0 shrink-0 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/82";
const DETAIL_PANEL_VALUE_CLASS = "ml-auto min-w-0 text-right text-foreground break-all";
const DETAIL_PANEL_MUTED_TEXT_CLASS = "text-[12px] text-muted-foreground";
const LOGS_ICON_TRANSFORM_CLASS =
  "transition-transform duration-cf-fast ease-cf-standard motion-reduce:transform-none motion-reduce:transition-none";

export function ThinkingConfigPanel({
  thinkingConfig,
}: {
  thinkingConfig: RequestLog["thinking_config"] | null | undefined;
}) {
  const t = useTranslations("logs");
  const locale = useLocale();
  const [isExpanded, setIsExpanded] = useState(false);
  const isZh = locale === "zh-CN" || locale === "zh";
  const panelTitle = t("thinkingConfig");
  const expandLabel = isZh ? "展开思考信息" : "Expand thinking details";
  const collapseLabel = isZh ? "收起思考信息" : "Collapse thinking details";

  const summaryText = thinkingConfig
    ? [
        t(`thinkingProviderValue.${thinkingConfig.provider}`),
        t(`thinkingModeValue.${thinkingConfig.mode}`),
        getRequestThinkingBadgeLabel(thinkingConfig),
      ]
        .filter(Boolean)
        .join(" · ")
    : t("thinkingNotExplicitlySpecified");

  if (!thinkingConfig) {
    return (
      <div className={DETAIL_PANEL_CLASS}>
        <div className={DETAIL_PANEL_HEADER_CLASS}>{panelTitle}</div>
        <div className={DETAIL_PANEL_BODY_CLASS}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className={cn(DETAIL_PANEL_MUTED_TEXT_CLASS, "min-w-0 flex-1")}>{summaryText}</div>
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-cf-sm border border-divider px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? collapseLabel : expandLabel}
            >
              <ChevronDown
                className={cn("h-3 w-3", LOGS_ICON_TRANSFORM_CLASS, isExpanded && "rotate-180")}
                aria-hidden="true"
              />
              <span>{isExpanded ? collapseLabel : expandLabel}</span>
            </button>
          </div>
          {isExpanded ? (
            <div
              className={cn("mt-3 border-t border-divider/40 pt-3", DETAIL_PANEL_MUTED_TEXT_CLASS)}
            >
              {t("thinkingNotExplicitlySpecified")}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const detailRows = [
    {
      label: t("thinkingProvider"),
      value: t(`thinkingProviderValue.${thinkingConfig.provider}`),
    },
    {
      label: t("thinkingProtocol"),
      value: t(`thinkingProtocolValue.${thinkingConfig.protocol}`),
    },
    {
      label: t("thinkingMode"),
      value: t(`thinkingModeValue.${thinkingConfig.mode}`),
    },
    {
      label: t("thinkingLevel"),
      value: thinkingConfig.level ?? t("thinkingValueUnset"),
    },
    {
      label: t("thinkingBudgetTokens"),
      value:
        thinkingConfig.budget_tokens != null
          ? thinkingConfig.budget_tokens.toLocaleString(locale)
          : t("thinkingValueUnset"),
    },
    {
      label: t("thinkingIncludeThoughts"),
      value:
        thinkingConfig.include_thoughts == null
          ? t("thinkingValueUnset")
          : thinkingConfig.include_thoughts
            ? t("thinkingBooleanEnabled")
            : t("thinkingBooleanDisabled"),
    },
    {
      label: t("thinkingSourcePaths"),
      value:
        thinkingConfig.source_paths.length > 0
          ? thinkingConfig.source_paths.join(" · ")
          : t("thinkingValueUnset"),
    },
  ];

  return (
    <div className={DETAIL_PANEL_CLASS}>
      <div className={DETAIL_PANEL_HEADER_CLASS}>{panelTitle}</div>
      <div className={DETAIL_PANEL_BODY_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1 text-[12px] text-muted-foreground">{summaryText}</div>
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-cf-sm border border-divider px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? collapseLabel : expandLabel}
          >
            <ChevronDown
              className={cn("h-3 w-3", LOGS_ICON_TRANSFORM_CLASS, isExpanded && "rotate-180")}
              aria-hidden="true"
            />
            <span>{isExpanded ? collapseLabel : expandLabel}</span>
          </button>
        </div>
        {isExpanded ? (
          <div className={cn("mt-3 border-t border-divider/40 pt-3", DETAIL_PANEL_STACK_CLASS)}>
            {detailRows.map((row) => (
              <div key={row.label} className={DETAIL_PANEL_ROW_CLASS}>
                <span className={DETAIL_PANEL_LABEL_CLASS}>{row.label}</span>
                <span className={DETAIL_PANEL_VALUE_CLASS}>{row.value}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
