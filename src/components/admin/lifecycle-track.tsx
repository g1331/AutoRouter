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

  // downstream_streaming failure shows in response segment; all others in request segment
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

  // Compute total time: prefer stage_timings_ms.total_ms, fallback to durationMs
  const totalMs = stageTimings?.total_ms ?? durationMs ?? null;

  // --- Decision segment ---
  const decSeg: Seg = {
    key: "decision",
    label: t("lifecycleDecision"),
    time: stageTimings?.decision_ms != null ? fmtMs(stageTimings.decision_ms) : null,
    sub: null,
    state: isDecision ? "active" : "done",
  };

  // --- Request segment ---
  const hasUpstreamMs =
    stageTimings?.upstream_response_ms != null || stageTimings?.gateway_processing_ms != null;
  const upstreamMs =
    stageTimings?.upstream_response_ms ?? stageTimings?.gateway_processing_ms ?? null;

  const reqSeg: Seg = {
    key: "request",
    label: t("lifecycleRequest"),
    time: isDone && hasUpstreamMs ? fmtMs(upstreamMs) : null,
    sub: errInReq ? errText : null,
    state: isDecision
      ? "pending"
      : effectiveStatus === "requesting"
        ? "active"
        : errInReq
          ? "failed"
          : "done",
  };

  // --- Response segment ---
  const streamSub =
    isStream && (stageTimings?.first_token_ms != null || stageTimings?.generation_ms != null)
      ? [
          stageTimings?.first_token_ms != null
            ? `${t("perfTtft")} ${fmtMs(stageTimings.first_token_ms)}`
            : null,
          stageTimings?.generation_ms != null
            ? `${t("perfGen")} ${fmtMs(stageTimings.generation_ms)}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  const respSeg: Seg = {
    key: "response",
    label: t("lifecycleResponse"),
    time: null,
    sub: errInResp ? errText : isDone && !errInReq ? streamSub : null,
    state: !isDone ? "pending" : errInResp ? "failed" : errInReq ? "pending" : "done",
  };

  // --- Complete segment ---
  // Show status code + total time (if available)
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

const LABEL_CLS: Record<SegState, string> = {
  done: "text-muted-foreground",
  active: "text-foreground font-medium",
  pending: "text-muted-foreground/35",
  failed: "text-status-error",
  success: "text-status-success",
};

const TIME_CLS: Record<SegState, string> = {
  done: "text-muted-foreground",
  active: "text-foreground",
  pending: "text-muted-foreground/35",
  failed: "text-status-error/80",
  success: "text-status-success",
};

const SUB_CLS: Record<SegState, string> = {
  done: "text-muted-foreground/60",
  active: "text-muted-foreground/70",
  pending: "text-muted-foreground/35",
  failed: "text-status-error/70",
  success: "text-status-success/70",
};

function SegBlock({ seg }: { seg: Seg }) {
  const bracketCls = "text-muted-foreground/45";
  return (
    <span className={cn("inline-flex items-baseline gap-0", LABEL_CLS[seg.state])}>
      <span className={bracketCls}>[</span>
      <span>{seg.label}</span>
      {seg.time != null && (
        <span className={cn("ml-0.5 tabular-nums", TIME_CLS[seg.state])}>{seg.time}</span>
      )}
      {seg.sub != null && <span className={cn("ml-0.5", SUB_CLS[seg.state])}>{seg.sub}</span>}
      <span className={bracketCls}>]</span>
    </span>
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
    const primarySeg = segs.find((s) => s.state === "active" || s.state === "failed") ?? segs[0];
    const completeSeg = segs[segs.length - 1];
    const showBoth = primarySeg !== completeSeg;
    return (
      <div className="flex items-baseline gap-0 font-mono text-xs overflow-hidden">
        <SegBlock seg={primarySeg} />
        {showBoth && (
          <>
            <span className="text-muted-foreground/30 mx-0.5">─</span>
            <SegBlock seg={completeSeg} />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-baseline gap-0 font-mono text-xs">
      {segs.map((seg, i) => (
        <span key={seg.key} className="inline-flex items-baseline gap-0">
          {i > 0 && <span className="text-muted-foreground/30 mx-0.5">──</span>}
          <SegBlock seg={seg} />
        </span>
      ))}
    </div>
  );
}
