"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type {
  RequestLifecycleStatus,
  RequestStageTimings,
  UpstreamErrorSummary,
  RoutingFailureStage,
} from "@/types/api";

interface LifecycleTrackProps {
  lifecycleStatus?: RequestLifecycleStatus;
  stageTimings?: RequestStageTimings | null;
  upstreamError?: UpstreamErrorSummary | null;
  statusCode: number | null;
  isStream: boolean;
  failureStage?: RoutingFailureStage | null;
  durationMs?: number | null;
  compact?: boolean;
}

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "--";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtStageDuration(cumulativeMs: number | null, deltaMs: number | null): string | null {
  if (cumulativeMs != null && deltaMs != null) {
    return `${fmtMs(cumulativeMs)} (+${fmtMs(deltaMs)})`;
  }
  if (cumulativeMs != null) {
    return fmtMs(cumulativeMs);
  }
  if (deltaMs != null) {
    return fmtMs(deltaMs);
  }
  return null;
}

type SegState = "done" | "active" | "pending" | "failed" | "success";

interface Seg {
  key: string;
  label: string;
  time: string | null;
  sub: string | null;
  state: SegState;
}

function buildSegs(props: LifecycleTrackProps, t: (key: string) => string): Seg[] {
  const {
    lifecycleStatus,
    stageTimings,
    upstreamError,
    statusCode,
    isStream,
    failureStage,
    durationMs,
  } = props;

  const effectiveStatus: RequestLifecycleStatus =
    lifecycleStatus ??
    (statusCode == null
      ? "decision"
      : statusCode >= 200 && statusCode < 300
        ? "completed_success"
        : "completed_failed");

  const isFailed = effectiveStatus === "completed_failed";
  const isSuccess = effectiveStatus === "completed_success";
  const isDone = isFailed || isSuccess;
  const isDecision = effectiveStatus === "decision";

  const errInResp = isFailed && failureStage === "downstream_streaming";
  const errInReq = isFailed && !errInResp;

  let errText: string | null = null;
  if (isFailed && upstreamError) {
    const parts: string[] = [];
    if (upstreamError.status_code != null) parts.push(String(upstreamError.status_code));
    if (upstreamError.error_type) parts.push(upstreamError.error_type);
    if (upstreamError.error_message) {
      const msg = upstreamError.error_message;
      parts.push(msg.length > 32 ? msg.slice(0, 32) + "…" : msg);
    }
    if (parts.length > 0) errText = parts.join(" · ");
  }

  const totalMs = stageTimings?.total_ms ?? durationMs ?? null;
  const decisionMs = stageTimings?.decision_ms ?? null;
  const upstreamMs =
    stageTimings?.upstream_response_ms ?? stageTimings?.gateway_processing_ms ?? null;
  const gatewayProcessingMs = stageTimings?.gateway_processing_ms ?? null;
  const firstTokenMs = isStream ? (stageTimings?.first_token_ms ?? null) : null;
  const generationMs = isStream ? (stageTimings?.generation_ms ?? null) : null;
  const cumulativeFirstOutputMs =
    decisionMs != null && firstTokenMs != null ? decisionMs + firstTokenMs : firstTokenMs;

  const decSeg: Seg = {
    key: "decision",
    label: t("lifecycleDecision"),
    time: decisionMs != null ? fmtStageDuration(decisionMs, decisionMs) : null,
    sub: null,
    state: isDecision ? "active" : "done",
  };

  const requestTime =
    isDone && gatewayProcessingMs != null
      ? fmtStageDuration(totalMs, gatewayProcessingMs)
      : isDone && !isStream && upstreamMs != null
        ? fmtStageDuration(totalMs, upstreamMs)
        : isDone && isStream && firstTokenMs == null && upstreamMs != null
          ? fmtStageDuration(totalMs, upstreamMs)
          : null;

  const reqSeg: Seg = {
    key: "request",
    label: t("lifecycleRequest"),
    time: requestTime,
    sub: errInReq ? errText : null,
    state: isDecision
      ? "pending"
      : effectiveStatus === "requesting"
        ? "active"
        : errInReq
          ? "failed"
          : "done",
  };

  const responseSubParts = errInResp
    ? [errText]
    : isDone
      ? [
          firstTokenMs != null
            ? `${t("journeyFirstOutput")} ${fmtStageDuration(cumulativeFirstOutputMs, firstTokenMs)}`
            : null,
          generationMs != null && totalMs != null ? `${t("perfGen")} ${fmtMs(generationMs)}` : null,
        ]
      : [];

  const respSeg: Seg = {
    key: "response",
    label: t("lifecycleResponse"),
    time:
      !errInResp && isDone && generationMs != null ? fmtStageDuration(totalMs, generationMs) : null,
    sub: responseSubParts.filter(Boolean).join(" · ") || null,
    state: !isDone ? "pending" : errInResp ? "failed" : errInReq ? "pending" : "done",
  };

  const completeTime =
    statusCode != null
      ? totalMs != null
        ? `${statusCode} · ${fmtMs(totalMs)}`
        : String(statusCode)
      : null;

  const completeSeg: Seg = {
    key: "complete",
    label: t("lifecycleComplete"),
    time: completeTime,
    sub: null,
    state: !isDone ? "pending" : isSuccess ? "success" : "failed",
  };

  return [decSeg, reqSeg, respSeg, completeSeg];
}

const CONTAINER_CLS: Record<SegState, string> = {
  done: "border-divider bg-surface-200/70 shadow-[var(--vr-shadow-xs)]",
  active:
    "border-foreground/15 bg-surface-200 shadow-[0_10px_28px_rgba(15,23,42,0.08)] -translate-y-0.5",
  pending: "border-divider/70 bg-surface-200/40 opacity-70",
  failed:
    "border-status-error/20 bg-[linear-gradient(180deg,rgba(220,38,38,0.08),rgba(15,23,42,0.02))] shadow-[var(--vr-shadow-xs)]",
  success:
    "border-status-success/20 bg-[linear-gradient(180deg,rgba(22,163,74,0.08),rgba(15,23,42,0.02))] shadow-[var(--vr-shadow-xs)]",
};

const NUMBER_CLS: Record<SegState, string> = {
  done: "border-divider bg-surface-300 text-muted-foreground",
  active: "border-foreground/15 bg-surface-300 text-foreground",
  pending: "border-divider/60 bg-surface-300/50 text-muted-foreground/50",
  failed: "border-status-error/25 bg-status-error-muted/30 text-status-error",
  success: "border-status-success/25 bg-status-success-muted/35 text-status-success",
};

const LABEL_CLS: Record<SegState, string> = {
  done: "text-muted-foreground",
  active: "text-foreground",
  pending: "text-muted-foreground/45",
  failed: "text-status-error",
  success: "text-status-success",
};

const TIME_CLS: Record<SegState, string> = {
  done: "text-foreground",
  active: "text-foreground",
  pending: "text-muted-foreground/45",
  failed: "text-status-error",
  success: "text-status-success",
};

const SUB_CLS: Record<SegState, string> = {
  done: "text-muted-foreground/70",
  active: "text-muted-foreground/80",
  pending: "text-muted-foreground/40",
  failed: "text-status-error/75",
  success: "text-status-success/75",
};

function SegCard({ seg, index, compact = false }: { seg: Seg; index: number; compact?: boolean }) {
  return (
    <div
      className={cn(
        "group relative min-w-0 overflow-hidden rounded-[18px] border px-3 py-2.5 transition-all duration-200 ease-out",
        "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)]",
        compact ? "flex-1 px-2.5 py-2" : "min-h-[86px]",
        CONTAINER_CLS[seg.state]
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold transition-colors duration-200",
            NUMBER_CLS[seg.state]
          )}
        >
          {index}
        </span>
        <span
          className={cn(
            "min-w-0 truncate text-[10px] uppercase tracking-[0.16em] transition-colors duration-200",
            LABEL_CLS[seg.state]
          )}
        >
          {seg.label}
        </span>
      </div>

      <div className={cn("mt-2 space-y-1", compact && "mt-1.5")}>
        {seg.time ? (
          <div
            className={cn(
              "font-mono text-[11px] tabular-nums transition-colors duration-200",
              TIME_CLS[seg.state]
            )}
          >
            {seg.time}
          </div>
        ) : (
          <div className="h-[16px]" />
        )}
        {seg.sub ? (
          <div
            className={cn(
              "line-clamp-2 text-[10px] leading-relaxed transition-colors duration-200",
              SUB_CLS[seg.state]
            )}
          >
            {seg.sub}
          </div>
        ) : (
          <div className="h-[14px]" />
        )}
      </div>
    </div>
  );
}

export function LifecycleTrack({
  lifecycleStatus,
  stageTimings,
  upstreamError,
  statusCode,
  isStream,
  failureStage,
  durationMs,
  compact = false,
}: LifecycleTrackProps) {
  const t = useTranslations("logs");
  const segs = buildSegs(
    {
      lifecycleStatus,
      stageTimings,
      upstreamError,
      statusCode,
      isStream,
      failureStage,
      durationMs,
    },
    t
  );

  if (compact) {
    const primarySeg =
      segs.find((s) => s.state === "active" || s.state === "failed") ??
      (isStream
        ? segs.find((s) => s.key === "response" && (s.time != null || s.sub != null))
        : segs.find((s) => s.key === "request" && (s.time != null || s.sub != null))) ??
      segs.find((s) => s.key === "decision") ??
      segs[0];
    const completeSeg = segs[segs.length - 1];
    const compactSegs = primarySeg !== completeSeg ? [primarySeg, completeSeg] : [primarySeg];

    return (
      <div className="flex min-w-0 gap-1.5 overflow-hidden">
        {compactSegs.map((seg) => (
          <SegCard
            key={seg.key}
            seg={seg}
            index={1 + segs.findIndex((item) => item.key === seg.key)}
            compact
          />
        ))}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-6 right-6 top-5 hidden h-px bg-[linear-gradient(90deg,transparent,rgba(148,163,184,0.45),transparent)] lg:block" />
      <div className="grid gap-2 lg:grid-cols-4">
        {segs.map((seg, index) => (
          <SegCard key={seg.key} seg={seg} index={index + 1} />
        ))}
      </div>
    </div>
  );
}
