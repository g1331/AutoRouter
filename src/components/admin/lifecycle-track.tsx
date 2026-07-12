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
  /** Journey step index (2–5) whose segment should render as the selected tab. */
  activeJourneyStep?: number;
  /** When provided, segments become clickable tabs that select a journey step. */
  onJourneyStepSelect?: (step: number) => void;
}

type SegState = "done" | "active" | "pending" | "failed" | "success";
type SegKey = "decision" | "request" | "response" | "complete";
type TrackSegKey = SegKey | "first_output" | "generation";

/** Maps track segments onto the journey step panels below the track. */
export const TRACK_SEG_JOURNEY_STEP: Record<TrackSegKey, number> = {
  decision: 2,
  request: 3,
  response: 4,
  first_output: 4,
  generation: 4,
  complete: 5,
};

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

export function LifecycleTrack({
  lifecycleStatus,
  stageTimings,
  upstreamError,
  statusCode,
  isStream,
  failureStage,
  durationMs,
  activeJourneyStep,
  onJourneyStepSelect,
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
  const trackSegs = buildTrackSegs(props, t);

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
        return "bg-status-info/12 text-status-info";
      case "request":
      case "first_output":
        return "bg-surface-300/60 text-foreground/80";
      case "response":
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
          const interactive = onJourneyStepSelect != null;
          const isSelected = interactive && TRACK_SEG_JOURNEY_STEP[seg.key] === activeJourneyStep;
          const SegElement = interactive ? "button" : "div";

          return (
            <SegElement
              key={seg.key}
              {...(interactive
                ? {
                    type: "button" as const,
                    "aria-label": seg.label,
                    "aria-pressed": isSelected,
                    onClick: () => onJourneyStepSelect(TRACK_SEG_JOURNEY_STEP[seg.key]),
                  }
                : {})}
              data-state={seg.state}
              title={getTrackTitle(seg)}
              className={cn(
                "flex min-w-0 items-center justify-center gap-1 whitespace-nowrap border-r px-2 text-[10px] font-medium last:border-r-0",
                getTrackSegmentClassName(seg),
                getTrackBorderClassName(seg),
                seg.state === "active" && "ring-1 ring-inset ring-white/10",
                interactive &&
                  "cursor-pointer transition-[box-shadow] duration-cf-fast ease-cf-standard hover:ring-1 hover:ring-inset hover:ring-foreground/20 motion-reduce:transition-none",
                isSelected && "shadow-[inset_0_-2px_0_0_currentColor]"
              )}
              style={{ flexGrow: weights[seg.key], flexBasis: 0 }}
            >
              <span className="truncate">{seg.label}</span>
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
                      <span className="text-current/45 max-sm:hidden">·</span>
                      <span className="tabular-nums max-sm:hidden">{durationPart}</span>
                    </>
                  ) : null}
                </>
              ) : seg.time ? (
                <span className="tabular-nums max-sm:hidden">{seg.time}</span>
              ) : null}
            </SegElement>
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
