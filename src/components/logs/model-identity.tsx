"use client";

import { useTranslations } from "next-intl";
import type { RequestLog } from "@/types/api";
import { statusTone } from "@/lib/status-tone";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { getRequestThinkingBadgeLabel } from "@/lib/utils/request-thinking-config";
import { TruncatedTextTooltip } from "@/components/logs/truncated-text-tooltip";

type ReasoningEffortLevel = NonNullable<RequestLog["reasoning_effort"]>;

type RequestLogReasoningMeta = RequestLog & {
  reasoning_effort?: unknown;
  reasoningEffort?: unknown;
  thinking_level?: unknown;
  thinkingLevel?: unknown;
};

const REASONING_EFFORT_LABELS: Record<ReasoningEffortLevel, string> = {
  none: "None",
  enabled: "Think",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "XHigh",
};

const REASONING_EFFORT_BADGE_CLASSES: Record<ReasoningEffortLevel, string> = {
  none: "border-divider/70 bg-surface-300/65 text-muted-foreground/85",
  enabled: statusTone("info", "faint"),
  minimal: "border-divider/70 bg-surface-300/70 text-muted-foreground",
  low: "border-divider bg-surface-300/85 text-foreground/85",
  medium: statusTone("info", "faint"),
  high: "border-amber-500/35 bg-amber-500/10 text-amber-300",
  xhigh: statusTone("warning"),
};

const THINKING_BADGE_BASE_CLASS =
  "h-5 shrink-0 rounded-full px-1.5 py-0 font-mono text-[9px] font-medium leading-none tracking-[0.12em] shadow-none";

function extractThinkingBudgetBadgeValue(label: string): string | null {
  return label.startsWith("budget:") ? label.slice("budget:".length).trim() : null;
}

export function getReasoningEffortLevel(log: RequestLog): ReasoningEffortLevel | null {
  const requestLogWithMeta = log as RequestLogReasoningMeta;
  const rawValue =
    requestLogWithMeta.reasoning_effort ??
    requestLogWithMeta.reasoningEffort ??
    requestLogWithMeta.thinking_level ??
    requestLogWithMeta.thinkingLevel;

  if (typeof rawValue !== "string") {
    return null;
  }

  const normalizedValue = rawValue.trim().toLowerCase();
  return normalizedValue === "none" ||
    normalizedValue === "enabled" ||
    normalizedValue === "minimal" ||
    normalizedValue === "low" ||
    normalizedValue === "medium" ||
    normalizedValue === "high" ||
    normalizedValue === "xhigh"
    ? normalizedValue
    : null;
}

function ReasoningEffortBadge({ level }: { level: ReasoningEffortLevel }) {
  const label = REASONING_EFFORT_LABELS[level];

  return (
    <Badge
      variant="neutral"
      className={cn(
        "h-5 shrink-0 rounded-full px-1.5 py-0 font-mono text-[9px] font-medium leading-none tracking-[0.12em] shadow-none",
        REASONING_EFFORT_BADGE_CLASSES[level]
      )}
      aria-label={label}
      title={label}
    >
      <span>{label}</span>
    </Badge>
  );
}

function isThinkingBadgeDuplicatedByReasoningEffort(
  thinkingConfig: RequestLog["thinking_config"] | null | undefined,
  reasoningEffort: ReasoningEffortLevel | null | undefined
): boolean {
  if (!thinkingConfig || !reasoningEffort) {
    return false;
  }

  const badgeLabel = getRequestThinkingBadgeLabel(thinkingConfig);
  if (!badgeLabel) {
    return false;
  }

  return badgeLabel.trim().toLowerCase() === reasoningEffort;
}

export function ModelIdentity({
  label,
  reasoningEffort,
  thinkingConfig,
  compactBadges = false,
  className,
  textClassName,
}: {
  label: string | null | undefined;
  reasoningEffort?: ReasoningEffortLevel | null;
  thinkingConfig?: RequestLog["thinking_config"] | null;
  compactBadges?: boolean;
  className?: string;
  textClassName?: string;
}) {
  if (!label) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <div className={cn("flex min-w-0 max-w-full items-center gap-1", className)}>
      <TruncatedTextTooltip text={label} className={cn("shrink", textClassName)} />
      {reasoningEffort ? <ReasoningEffortBadge level={reasoningEffort} /> : null}
      <ThinkingConfigBadge
        thinkingConfig={thinkingConfig}
        dedupeWithReasoningEffort={reasoningEffort}
        compact={compactBadges}
      />
    </div>
  );
}

function ThinkingConfigBadge({
  thinkingConfig,
  dedupeWithReasoningEffort,
  compact = false,
}: {
  thinkingConfig: RequestLog["thinking_config"] | null | undefined;
  dedupeWithReasoningEffort?: ReasoningEffortLevel | null;
  compact?: boolean;
}) {
  const t = useTranslations("logs");
  const badgeLabel = getRequestThinkingBadgeLabel(thinkingConfig ?? null);
  const budgetValue = badgeLabel ? extractThinkingBudgetBadgeValue(badgeLabel) : null;

  if (
    !badgeLabel ||
    isThinkingBadgeDuplicatedByReasoningEffort(thinkingConfig, dedupeWithReasoningEffort)
  ) {
    return null;
  }

  if (budgetValue) {
    return (
      <Badge
        variant="success"
        className={cn(
          THINKING_BADGE_BASE_CLASS,
          "gap-1",
          statusTone("success", "faint"),
          compact && "gap-0.5 px-1 py-0 text-[8px]"
        )}
        aria-label={t("thinkingBadgeAria", { value: badgeLabel })}
        title={t("thinkingBadgeAria", { value: badgeLabel })}
      >
        <span className="uppercase tracking-[0.16em]">Budget</span>
        <span
          className={cn(
            "rounded-full bg-background/65 px-1 py-[1px] text-[8px] leading-none tracking-[0.08em] text-foreground/85",
            compact && "px-0.5 text-[7px]"
          )}
        >
          {budgetValue}
        </span>
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 border-divider px-1.5 py-0 font-mono text-[10px] leading-4 text-muted-foreground",
        compact && "px-1 py-0 text-[9px]"
      )}
      aria-label={t("thinkingBadgeAria", { value: badgeLabel })}
      title={t("thinkingBadgeAria", { value: badgeLabel })}
    >
      [{badgeLabel}]
    </Badge>
  );
}
