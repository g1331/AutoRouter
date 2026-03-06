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

type SegState = "done" | "active" | "pending" | "failed" | "success";
type SegKey = "decision" | "request" | "response" | "complete";
type TrackSegKey = SegKey | "first_output" | "generation";

interface Seg {
  key: SegKey;
  label: string;
  time: string | null;
  sub: string | null;
  state: SegState;
}

interface TrackSeg {
  key: TrackSegKey;
  label: string;
  time: string | null;
  sub: string | null;
  state: SegState;
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

function getLifecycleContext(props: LifecycleTrackProps) {
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

  return {
    effectiveStatus,
    isFailed,
    isSuccess,
    isDone,
    isDecision,
    errInResp,
    errInReq,
    errText,
    totalMs,
    decisionMs,
    upstreamMs,
    gatewayProcessingMs,
    firstTokenMs,
    generationMs,
    cumulativeFirstOutputMs,
  };
}

function buildSegs(props: LifecycleTrackProps, t: (key: string) => string): Seg[] {
  const {
    effectiveStatus,
    isSuccess,
    isDone,
    isDecision,
    errInResp,
    errInReq,
    errText,
    totalMs,
    decisionMs,
    upstreamMs,
    gatewayProcessingMs,
    firstTokenMs,
    generationMs,
    cumulativeFirstOutputMs,
  } = getLifecycleContext(props);

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
      : isDone && !props.isStream && upstreamMs != null
        ? fmtStageDuration(totalMs, upstreamMs)
        : isDone && props.isStream && firstTokenMs == null && upstreamMs != null
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
    props.statusCode != null
      ? totalMs != null
        ? `${props.statusCode} · ${fmtMs(totalMs)}`
        : String(props.statusCode)
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

function buildTrackSegs(props: LifecycleTrackProps, t: (key: string) => string): TrackSeg[] {
  const {
    effectiveStatus,
    isSuccess,
    isDone,
    isDecision,
    errInResp,
    errInReq,
    errText,
    totalMs,
    decisionMs,
    upstreamMs,
    firstTokenMs,
    generationMs,
    cumulativeFirstOutputMs,
  } = getLifecycleContext(props);

  const decisionSeg: TrackSeg = {
    key: "decision",
    label: t("lifecycleDecision"),
    time: decisionMs != null ? fmtStageDuration(decisionMs, decisionMs) : null,
    sub: null,
    state: isDecision ? "active" : "done",
  };

  const completeSeg: TrackSeg = {
    key: "complete",
    label: t("lifecycleComplete"),
    time:
      props.statusCode != null
        ? totalMs != null
          ? `${props.statusCode} · ${fmtMs(totalMs)}`
          : String(props.statusCode)
        : null,
    sub: null,
    state: !isDone ? "pending" : isSuccess ? "success" : "failed",
  };

  if (!props.isStream) {
    const requestSeg: TrackSeg = {
      key: "request",
      label: t("lifecycleRequest"),
      time: isDone && upstreamMs != null ? fmtStageDuration(totalMs, upstreamMs) : null,
      sub: errInReq ? errText : null,
      state: isDecision
        ? "pending"
        : effectiveStatus === "requesting"
          ? "active"
          : errInReq
            ? "failed"
            : "done",
    };

    const responseSeg: TrackSeg = {
      key: "response",
      label: t("lifecycleResponse"),
      time: !isDone || errInReq ? null : fmtMs(0),
      sub: errInResp ? errText : null,
      state: !isDone ? "pending" : errInResp ? "failed" : errInReq ? "pending" : "done",
    };

    return [decisionSeg, requestSeg, responseSeg, completeSeg];
  }

  const requestSeg: TrackSeg = {
    key: "request",
    label: t("lifecycleRequest"),
    time: props.isStream && !isDecision ? fmtMs(0) : null,
    sub: errInReq ? errText : null,
    state: isDecision
      ? "pending"
      : effectiveStatus === "requesting"
        ? "active"
        : errInReq
          ? "failed"
          : "done",
  };

  const firstOutputSeg: TrackSeg = {
    key: "first_output",
    label: t("lifecycleFirstOutput"),
    time:
      !errInReq && firstTokenMs != null
        ? fmtStageDuration(cumulativeFirstOutputMs, firstTokenMs)
        : null,
    sub: null,
    state: isDecision
      ? "pending"
      : effectiveStatus === "requesting"
        ? "pending"
        : errInReq
          ? "pending"
          : firstTokenMs != null
            ? "done"
            : isDone
              ? "done"
              : "pending",
  };

  const generationSeg: TrackSeg = {
    key: "generation",
    label: t("lifecycleGeneration"),
    time:
      !errInResp && isDone && generationMs != null ? fmtStageDuration(totalMs, generationMs) : null,
    sub: errInResp ? errText : null,
    state: isDecision
      ? "pending"
      : effectiveStatus === "requesting"
        ? "pending"
        : errInResp
          ? "failed"
          : errInReq
            ? "pending"
            : generationMs != null
              ? "done"
              : isDone
                ? "done"
                : "pending",
  };

  return [decisionSeg, requestSeg, firstOutputSeg, generationSeg, completeSeg];
}

function buildTrackVisualWeights(
  props: LifecycleTrackProps,
  segs: TrackSeg[]
): Record<TrackSegKey, number> {
  const { totalMs, decisionMs, upstreamMs, firstTokenMs, generationMs } =
    getLifecycleContext(props);
  const fallbackWeight = totalMs != null && totalMs > 0 ? Math.max(totalMs * 0.08, 60) : 100;

  const weights: Record<TrackSegKey, number> = {
    decision: Math.max(decisionMs ?? 0, fallbackWeight),
    request: Math.max(props.isStream ? 0 : (upstreamMs ?? 0), fallbackWeight),
    response: Math.max(generationMs ?? 0, fallbackWeight),
    first_output: Math.max(firstTokenMs ?? 0, fallbackWeight),
    generation: Math.max(generationMs ?? 0, fallbackWeight),
    complete: Math.max(totalMs != null ? totalMs * 0.14 : 0, fallbackWeight),
  };

  for (const seg of segs) {
    weights[seg.key] = Math.max(weights[seg.key], fallbackWeight);
  }

  return weights;
}

const CARD_CONTAINER_CLS: Record<SegState, string> = {
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

const BAR_SEGMENT_CLS: Record<SegState, string> = {
  done: "bg-surface-200/70",
  active: "bg-[linear-gradient(180deg,rgba(59,130,246,0.12),rgba(15,23,42,0.02))]",
  pending: "bg-surface-200/35 opacity-75",
  failed: "bg-[linear-gradient(180deg,rgba(220,38,38,0.10),rgba(15,23,42,0.03))]",
  success: "bg-[linear-gradient(180deg,rgba(22,163,74,0.10),rgba(15,23,42,0.03))]",
};

const BAR_ACCENT_CLS: Record<SegState, string> = {
  done: "bg-muted-foreground/20",
  active: "bg-blue-400/70",
  pending: "bg-muted-foreground/15",
  failed: "bg-status-error/70",
  success: "bg-status-success/70",
};

function SegCard({
  seg,
  index,
  compact = false,
}: {
  seg: Pick<TrackSeg, "label" | "time" | "sub" | "state">;
  index: number;
  compact?: boolean;
}) {
  return (
    <div
      data-state={seg.state}
      className={cn(
        "group relative min-w-0 overflow-hidden rounded-[18px] border px-3 py-2.5 transition-all duration-200 ease-out",
        "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)]",
        compact ? "flex-1 px-2.5 py-2" : "min-h-[86px]",
        CARD_CONTAINER_CLS[seg.state]
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

function CompleteTime({ seg }: { seg: Seg }) {
  if (!seg.time) {
    return <div className="h-[16px]" />;
  }

  const [statusPart, durationPart] = seg.time.split(" · ");
  const statusClass =
    seg.state === "success"
      ? "text-status-success"
      : seg.state === "failed"
        ? "text-status-error"
        : "text-foreground";

  if (!durationPart) {
    return (
      <div className={cn("font-mono text-[11px] tabular-nums", statusClass)}>{statusPart}</div>
    );
  }

  return (
    <div className="font-mono text-[11px] tabular-nums">
      <span className={statusClass}>{statusPart}</span>
      <span className="text-muted-foreground/55"> · </span>
      <span
        className={cn(
          "text-foreground",
          seg.state === "failed" && "text-status-error",
          seg.state === "success" && "text-status-success"
        )}
      >
        {durationPart}
      </span>
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
  const props = {
    lifecycleStatus,
    stageTimings,
    upstreamError,
    statusCode,
    isStream,
    failureStage,
    durationMs,
  };
  const segs = buildSegs(props, t);
  const trackSegs = buildTrackSegs(props, t);

  if (compact) {
    const primarySeg =
      trackSegs.find((s) => s.state === "active" || s.state === "failed") ??
      (isStream
        ? (trackSegs.find((s) => s.key === "generation" && (s.time != null || s.sub != null)) ??
          trackSegs.find((s) => s.key === "first_output" && (s.time != null || s.sub != null)))
        : trackSegs.find((s) => s.key === "request" && (s.time != null || s.sub != null))) ??
      trackSegs.find((s) => s.key === "decision") ??
      trackSegs[0];
    const completeSeg = trackSegs[trackSegs.length - 1];
    const compactSegs = primarySeg !== completeSeg ? [primarySeg, completeSeg] : [primarySeg];

    return (
      <div className="flex min-w-0 gap-1.5 overflow-hidden">
        {compactSegs.map((seg) => (
          <SegCard
            key={seg.key}
            seg={seg}
            index={1 + trackSegs.findIndex((item) => item.key === seg.key)}
            compact
          />
        ))}
      </div>
    );
  }

  const weights = buildTrackVisualWeights(props, trackSegs);

  const getTrackSegmentClassName = (seg: TrackSeg) => {
    if (seg.state === "failed") {
      return "bg-status-error/12 text-status-error";
    }
    if (seg.state === "success") {
      return "bg-status-success/12 text-status-success";
    }
    if (seg.state === "pending") {
      return "bg-surface-200/20 text-muted-foreground/55";
    }

    switch (seg.key) {
      case "decision":
        return "bg-blue-500/12 text-blue-300";
      case "request":
        return "bg-violet-500/12 text-violet-300";
      case "first_output":
        return "bg-violet-500/12 text-violet-300";
      case "response":
        return "bg-amber-500/12 text-amber-300";
      case "generation":
        return "bg-amber-500/12 text-amber-300";
      case "complete":
        return "bg-status-success/10 text-status-success";
      default:
        return "bg-surface-200/35 text-foreground";
    }
  };

  const getTrackBorderClassName = (seg: TrackSeg) => {
    if (seg.state === "failed") {
      return "border-status-error/20";
    }
    if (seg.state === "success") {
      return "border-status-success/20";
    }
    return "border-divider";
  };

  const getTrackTitle = (seg: TrackSeg) => {
    return [seg.label, seg.time, seg.sub].filter(Boolean).join(" · ");
  };

  return (
    <div className="space-y-1.5">
      <div className="flex h-9 overflow-hidden rounded-cf-sm border border-divider bg-surface-300/30">
        {trackSegs.map((seg) => {
          const [statusPart, durationPart] =
            seg.key === "complete" && seg.time ? seg.time.split(" · ") : [null, null];

          return (
            <div
              key={seg.key}
              data-state={seg.state}
              title={getTrackTitle(seg)}
              className={cn(
                "flex items-center justify-center gap-1 whitespace-nowrap border-r px-2 text-[10px] font-medium last:border-r-0",
                getTrackSegmentClassName(seg),
                getTrackBorderClassName(seg),
                seg.state === "active" && "ring-1 ring-inset ring-white/10"
              )}
              style={{ flexGrow: weights[seg.key], flexBasis: 0 }}
            >
              <span>{seg.label}</span>
              {seg.key === "complete" && statusPart ? (
                <>
                  <span
                    className={cn(
                      "tabular-nums",
                      seg.state === "failed" && "text-status-error",
                      seg.state === "success" && "text-status-success"
                    )}
                  >
                    {statusPart}
                  </span>
                  {durationPart ? (
                    <>
                      <span className="text-current/45">·</span>
                      <span className="tabular-nums">{durationPart}</span>
                    </>
                  ) : null}
                </>
              ) : seg.time ? (
                <span className="tabular-nums">{seg.time}</span>
              ) : null}
            </div>
          );
        })}
      </div>
      {trackSegs.some((seg) => seg.sub) ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/70">
          {trackSegs
            .filter((seg) => seg.sub)
            .map((seg) => (
              <span key={seg.key} className="min-w-0 truncate">
                <span className="text-muted-foreground/45">{seg.label}:</span> {seg.sub}
              </span>
            ))}
        </div>
      ) : null}
    </div>
  );
}
