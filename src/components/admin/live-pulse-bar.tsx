"use client";

import { useFormatter, useTranslations } from "next-intl";
import { AlertTriangle, Server, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import type { LivePulseConnectionState, LivePulseSnapshot } from "@/hooks/use-live-pulse";

const ERROR_RATE_WARN_THRESHOLD_PCT = 5;

const ZERO_SNAPSHOT: LivePulseSnapshot = {
  requestsPerMinute: 0,
  errorRatePct: 0,
  avgLatencyMs: 0,
  tokensPerMinute: 0,
  sampleCount: 0,
  windowSeconds: 60,
  generatedAt: "",
  gateway: { healthyUpstreams: 0, totalUpstreams: 0, openCircuitBreakers: 0 },
};

interface LivePulseBarProps {
  snapshot: LivePulseSnapshot | null;
  connectionState: LivePulseConnectionState;
  variant?: "full" | "compact";
  className?: string;
}

function StatusDot({ connectionState }: { connectionState: LivePulseConnectionState }) {
  const dotClass =
    connectionState === "live"
      ? "bg-status-success animate-log-badge-live motion-reduce:animate-none"
      : connectionState === "connecting"
        ? "bg-muted-foreground animate-log-badge-connect motion-reduce:animate-none"
        : "bg-status-warning";

  return <span className={cn("inline-block h-2 w-2 rounded-full", dotClass)} aria-hidden="true" />;
}

function Metric({ value, label, emphasis }: { value: string; label: string; emphasis?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {emphasis && <AlertTriangle className="h-3 w-3 text-status-error" aria-hidden="true" />}
      <span
        className={cn(
          "tabular-nums",
          emphasis ? "font-semibold text-status-error" : "text-foreground"
        )}
      >
        {value}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

/**
 * Presentational live pulse bar. Receives the snapshot and connection state as
 * props so it can be rendered in the desktop topbar and the mobile strip, and
 * unit-tested without a live connection.
 */
export function LivePulseBar({
  snapshot,
  connectionState,
  variant = "full",
  className,
}: LivePulseBarProps) {
  const t = useTranslations("livePulse");
  const format = useFormatter();
  const data = snapshot ?? ZERO_SNAPSHOT;

  const statusLabel =
    connectionState === "live"
      ? t("statusLive")
      : connectionState === "connecting"
        ? t("statusConnecting")
        : t("statusFallback");

  const statusTooltip =
    connectionState === "fallback"
      ? t("statusFallbackTooltip")
      : connectionState === "connecting"
        ? t("statusConnectingTooltip")
        : t("statusLiveTooltip");

  const errorEmphasis = data.errorRatePct > ERROR_RATE_WARN_THRESHOLD_PCT;
  const breakersEmphasis = data.gateway.openCircuitBreakers > 0;

  return (
    <div
      role="status"
      aria-label={t("label")}
      title={statusTooltip}
      className={cn(
        "flex items-center gap-2 text-xs text-muted-foreground",
        variant === "compact" ? "gap-1.5" : "gap-2",
        className
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <StatusDot connectionState={connectionState} />
        <span className="text-foreground">{statusLabel}</span>
      </span>

      <span className="text-divider" aria-hidden="true">
        ·
      </span>
      <Metric value={format.number(data.requestsPerMinute)} label={t("requestsPerMinute")} />

      <span className="text-divider" aria-hidden="true">
        ·
      </span>
      <Metric
        value={`${format.number(data.errorRatePct, { maximumFractionDigits: 1 })}%`}
        label={t("errorRate")}
        emphasis={errorEmphasis}
      />

      {variant === "full" && (
        <>
          <span className="text-divider" aria-hidden="true">
            ·
          </span>
          <Metric
            value={`${format.number(data.avgLatencyMs, { maximumFractionDigits: 0 })} ms`}
            label={t("avgLatency")}
          />

          <span className="text-divider" aria-hidden="true">
            ·
          </span>
          <Metric
            value={format.number(data.tokensPerMinute, {
              notation: "compact",
              maximumFractionDigits: 1,
            })}
            label={t("tokensPerMinute")}
          />

          <span className="text-divider" aria-hidden="true">
            ·
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <Server className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            <span className="tabular-nums text-foreground">
              {data.gateway.healthyUpstreams}/{data.gateway.totalUpstreams}
            </span>
            <span className="text-muted-foreground">{t("upstreamsHealthy")}</span>
          </span>

          <span className="text-divider" aria-hidden="true">
            ·
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <Zap
              className={cn(
                "h-3 w-3",
                breakersEmphasis ? "text-status-warning" : "text-muted-foreground"
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                "tabular-nums",
                breakersEmphasis ? "text-status-warning" : "text-foreground"
              )}
            >
              {data.gateway.openCircuitBreakers}
            </span>
            <span className="text-muted-foreground">{t("circuitBreakersOpen")}</span>
          </span>
        </>
      )}
    </div>
  );
}
