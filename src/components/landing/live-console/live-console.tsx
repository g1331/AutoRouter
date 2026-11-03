"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { RotateCw, Radar } from "lucide-react";

import { StatusLed } from "@/components/ui/status-led";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

import styles from "../landing.module.css";
import { ConsoleTopology, type ArrivalEvent } from "./console-topology";
import {
  FAILING_UPSTREAM,
  LOOP_SECONDS,
  PHASES,
  PHASE_METRICS,
  STATIC_PHASE,
  formatClock,
  nextMetrics,
  phaseEvent,
  phaseIndexAt,
  staticLog,
  upstreamLatency,
  upstreamModel,
  upstreamName,
  wrapTime,
  type LogDraft,
  type LogEntry,
  type Metrics,
  type PhaseId,
} from "./scenario";

const TICK_MS = 100;
const METRIC_EVERY_TICKS = 4;
const HISTORY = 28;
const MAX_LOG_ROWS = 7;
const OK_LOG_GAP_MS = 620;

const STATIC_INDEX = PHASES.findIndex((phase) => phase.id === STATIC_PHASE);

function seedHistory(value: number) {
  return Array.from(
    { length: HISTORY },
    (_, index) => value + Math.sin(index * 1.7) * value * 0.01
  );
}

interface KpiProps {
  label: string;
  value: string;
  tone: "neutral" | "warning" | "error" | "success";
  history: number[];
}

const KPI_TONE: Record<KpiProps["tone"], { text: string; stroke: string; fill: string }> = {
  neutral: { text: "text-foreground", stroke: "stroke-amber-500", fill: "fill-amber-500/10" },
  success: {
    text: "text-status-success",
    stroke: "stroke-status-success",
    fill: "fill-status-success/10",
  },
  warning: {
    text: "text-status-warning",
    stroke: "stroke-status-warning",
    fill: "fill-status-warning/10",
  },
  error: { text: "text-status-error", stroke: "stroke-status-error", fill: "fill-status-error/10" },
};

function Sparkline({ history, tone }: { history: number[]; tone: KpiProps["tone"] }) {
  // 振幅至少取均值的 6%：平稳时只是轻微起伏，真正的突变才会拉满高度。
  const rawMin = Math.min(...history);
  const rawMax = Math.max(...history);
  const mean = history.reduce((sum, value) => sum + value, 0) / history.length;
  const range = Math.max(rawMax - rawMin, Math.abs(mean) * 0.06, 1);
  const min = (rawMin + rawMax) / 2 - range / 2;
  const points = history.map((value, index) => {
    const x = (index / (history.length - 1)) * 100;
    const y = 26 - ((value - min) / range) * 22;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const colors = KPI_TONE[tone];
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-7 w-full" aria-hidden="true">
      <polygon
        points={`0,28 ${points.join(" ")} 100,28`}
        className={cn("transition-[fill] duration-500", colors.fill)}
      />
      <polyline
        points={points.join(" ")}
        className={cn("fill-none transition-[stroke] duration-500", colors.stroke)}
        strokeWidth={1.4}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Kpi({ label, value, tone, history }: KpiProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 bg-surface-200 px-4 py-3">
      <span className="type-label-small truncate text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-display text-2xl font-semibold tabular-nums leading-none transition-colors duration-500",
          KPI_TONE[tone].text
        )}
      >
        {value}
      </span>
      <Sparkline history={history} tone={tone} />
    </div>
  );
}

/** 行以 id 为 key，只在首次挂载时播放进场动画。 */
function LogRow({ entry }: { entry: LogEntry }) {
  const t = useTranslations("landing.console");
  if (entry.type === "event") {
    const tone = entry.event === "open" ? "bad" : entry.event === "half" ? "warn" : "ok";
    return (
      <li
        className={cn(
          "flex items-center gap-2 rounded-cf-sm px-2 py-1.5 font-mono text-[11px]",
          entry.event === "open" && "bg-status-error-muted text-status-error",
          entry.event === "half" && "bg-status-warning-muted text-status-warning",
          entry.event === "closed" && "bg-status-success-muted text-status-success",
          "animate-log-row-enter"
        )}
      >
        <StatusLed tone={tone} />
        <span className="truncate">
          {t(`events.${entry.event}`, { name: upstreamName(entry.upstream) })}
        </span>
      </li>
    );
  }
  const failed = entry.status >= 500;
  return (
    <li
      className={cn(
        "grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 px-2 py-1.5 font-mono text-[11px]",
        "animate-log-row-enter"
      )}
    >
      <span className="text-muted-foreground">{entry.clock.slice(3)}</span>
      <span
        className={cn(
          "rounded-cf-sm px-1.5 py-px font-semibold",
          failed
            ? "bg-status-error-muted text-status-error"
            : "bg-status-success-muted text-status-success"
        )}
      >
        {entry.status}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-foreground">
        <span className="truncate">{upstreamName(entry.upstream)}</span>
        {entry.tag && (
          <span
            className={cn(
              "shrink-0 rounded-cf-sm px-1 text-[9.5px] uppercase tracking-[0.06em]",
              "bg-status-warning-muted text-status-warning"
            )}
          >
            {t(`tags.${entry.tag}`)}
          </span>
        )}
        <span className="hidden truncate text-muted-foreground xl:inline">
          {upstreamModel(entry.upstream)}
        </span>
      </span>
      <span className={cn("tabular-nums", failed ? "text-status-error" : "text-muted-foreground")}>
        {entry.latency}ms
      </span>
    </li>
  );
}

/** 首屏「路由实况」：一段循环播放的故障转移演示，指标、拓扑与日志同步变化。 */
export function LiveConsole() {
  const t = useTranslations("landing.console");
  const reducedMotion = usePrefersReducedMotion();

  const rootRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const running = !reducedMotion && inView && pageVisible;

  const timeRef = useRef(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [staticIndex, setStaticIndex] = useState(STATIC_INDEX);
  const shownIndex = reducedMotion ? staticIndex : phaseIndex;
  const phase = PHASES[shownIndex].id;
  const phaseRef = useRef<PhaseId>(phase);

  const [liveMetrics, setMetrics] = useState<Metrics>(PHASE_METRICS.steady);
  const [history, setHistory] = useState(() => ({
    rpm: seedHistory(PHASE_METRICS.steady.rpm),
    success: seedHistory(PHASE_METRICS.steady.success),
    latency: seedHistory(PHASE_METRICS.steady.latency),
  }));
  const [clock, setClock] = useState("--:--:--");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const metricsRef = useRef<Metrics>(PHASE_METRICS.steady);
  const logId = useRef(100);
  const lastOkLog = useRef(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const pushLog = useCallback((entry: LogDraft) => {
    const id = ++logId.current;
    const row = { ...entry, id, clock: formatClock(new Date()) } as LogEntry;
    setLogs((rows) => [row, ...rows].slice(0, MAX_LOG_ROWS));
  }, []);

  // 进入视口才播放；切到后台标签页时暂停。
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.15,
    });
    observer.observe(root);
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // 首帧日志：水合后在下一帧生成，避免服务端与客户端时间不一致。
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const now = formatClock(new Date());
      setClock(now.slice(0, 8));
      setLogs(
        reducedMotion
          ? staticLog(now)
          : (["openai", "anthropic", "openai", "anthropic", "openai"] as const).map(
              (upstream, index) => ({
                id: index + 1,
                type: "request" as const,
                clock: now,
                status: 200,
                upstream,
                latency: upstreamLatency(upstream, (index * 0.37) % 1),
              })
            )
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);

  // 剧本时钟：推进时间、切换阶段、采样指标。
  useEffect(() => {
    if (!running) return;
    let ticks = 0;
    let last = performance.now();
    let current = phaseIndexAt(timeRef.current);
    const interval = window.setInterval(() => {
      const now = performance.now();
      const before = timeRef.current;
      timeRef.current = wrapTime(before + (now - last) / 1000);
      last = now;
      if (timeRef.current < before) setCycle((value) => value + 1);

      const index = phaseIndexAt(timeRef.current);
      if (index !== current) {
        current = index;
        setPhaseIndex(index);
        const event = phaseEvent(PHASES[index].id);
        if (event) pushLog({ type: "event", event, upstream: FAILING_UPSTREAM });
      }

      ticks += 1;
      if (ticks % METRIC_EVERY_TICKS === 0) {
        setClock(formatClock(new Date()).slice(0, 8));
        const next = nextMetrics(metricsRef.current, PHASES[index].id, timeRef.current + ticks);
        metricsRef.current = next;
        setMetrics(next);
        setHistory((value) => ({
          rpm: [...value.rpm.slice(1), next.rpm],
          success: [...value.success.slice(1), next.success],
          latency: [...value.latency.slice(1), next.latency],
        }));
      }
    }, TICK_MS);
    return () => window.clearInterval(interval);
  }, [running, pushLog]);

  const handleArrival = useCallback(
    ({ upstream, outcome }: ArrivalEvent) => {
      if (outcome === "ok") {
        const now = performance.now();
        if (now - lastOkLog.current < OK_LOG_GAP_MS) return;
        lastOkLog.current = now;
      }
      const random = Math.random();
      pushLog({
        type: "request",
        status: outcome === "error" ? 502 : 200,
        upstream,
        latency:
          outcome === "error" ? 1100 + Math.round(random * 400) : upstreamLatency(upstream, random),
        tag: outcome === "retry" ? "retry" : outcome === "probe" ? "probe" : undefined,
      });
    },
    [pushLog]
  );

  const jumpTo = (index: number) => {
    timeRef.current = PHASES[index].start + 0.001;
    setPhaseIndex(index);
    setCycle((value) => value + 1);
    const event = phaseEvent(PHASES[index].id);
    if (event && !reducedMotion) pushLog({ type: "event", event, upstream: FAILING_UPSTREAM });
  };

  // 减少动态效果时指标直接取当前静态画面的数值。
  const metrics = reducedMotion ? PHASE_METRICS[phase] : liveMetrics;
  const successTone = metrics.success < 99 ? "warning" : "success";
  const latencyTone = metrics.latency > 600 ? "warning" : "neutral";
  const breakerTone = metrics.breakers > 0 ? "error" : "neutral";
  const breakerHistory = history.success.map((_, index) =>
    index > HISTORY - 6 ? metrics.breakers : 0
  );

  return (
    <div
      ref={rootRef}
      className="relative overflow-hidden rounded-cf-md border border-border/70 bg-surface-200/90 shadow-[0_40px_120px_-40px_color-mix(in_srgb,var(--vr-accent-500)_35%,transparent),var(--vr-shadow-md)]"
    >
      {/* 标题栏 */}
      <div className="flex h-11 items-center justify-between gap-3 border-b border-divider px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <StatusLed tone={running ? "ok" : "neutral"} pulse={running} />
          <span className="font-mono text-[11px] font-semibold tracking-[0.14em] text-status-success">
            LIVE
          </span>
          <span className="h-3.5 w-px bg-divider" aria-hidden="true" />
          <Radar className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
          <span className="type-label-large truncate text-foreground">{t("title")}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-cf-sm bg-surface-300 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground sm:inline">
            {t("demo")}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{clock}</span>
        </div>
      </div>

      {/* 指标条 */}
      <div className="grid grid-cols-2 gap-px border-b border-divider bg-divider md:grid-cols-4">
        <Kpi
          label={t("kpi.rpm")}
          value={metrics.rpm.toLocaleString("en-US")}
          tone="neutral"
          history={history.rpm}
        />
        <Kpi
          label={t("kpi.success")}
          value={`${metrics.success.toFixed(1)}%`}
          tone={successTone}
          history={history.success}
        />
        <Kpi
          label={t("kpi.latency")}
          value={`${metrics.latency}ms`}
          tone={latencyTone}
          history={history.latency}
        />
        <Kpi
          label={t("kpi.breakers")}
          value={String(metrics.breakers)}
          tone={breakerTone}
          history={breakerHistory}
        />
      </div>

      {/* 拓扑 + 日志 */}
      <div className="grid lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="relative px-3 py-4 sm:px-5 sm:py-6">
          <ConsoleTopology
            phase={phase}
            phaseRef={phaseRef}
            running={running}
            title={t("topologyTitle")}
            description={t(`phases.${phase}.desc`)}
            onArrival={handleArrival}
          />
        </div>
        <div className="flex min-w-0 flex-col border-t border-divider lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between px-4 pb-1 pt-3">
            <span className="type-label-small text-muted-foreground">{t("logs")}</span>
            <RotateCw
              className={cn(
                "h-3 w-3 text-muted-foreground",
                running && "animate-spin [animation-duration:3s]"
              )}
              aria-hidden="true"
            />
          </div>
          <ol className="flex flex-col gap-0.5 px-2 pb-3" aria-live="off">
            {logs.map((entry) => (
              <LogRow key={entry.id} entry={entry} />
            ))}
          </ol>
        </div>
      </div>

      {/* 叙事条：用大白话讲当前发生了什么，可点击跳转 */}
      <div className="border-t border-divider bg-surface-100/40 px-4 py-4 sm:px-5">
        <ol className="grid grid-cols-5 gap-2">
          {PHASES.map((item, index) => {
            const active = index === shownIndex;
            const done = index < shownIndex;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => (reducedMotion ? setStaticIndex(index) : jumpTo(index))}
                  aria-pressed={active}
                  className="group flex w-full flex-col gap-2 rounded-cf-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="relative h-0.5 w-full overflow-hidden rounded-full bg-border">
                    <span
                      key={active ? `${item.id}-${cycle}` : item.id}
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full bg-amber-500",
                        done && "w-full opacity-60",
                        active && (reducedMotion ? "w-full" : `w-0 ${styles.progress}`),
                        !active && !done && "w-0"
                      )}
                      style={
                        active && !reducedMotion
                          ? {
                              animationDuration: `${item.end - item.start}s`,
                              animationPlayState: running ? "running" : "paused",
                            }
                          : undefined
                      }
                    />
                  </span>
                  <span
                    className={cn(
                      "flex items-baseline gap-1.5 text-xs transition-colors duration-300",
                      active
                        ? "text-foreground"
                        : "text-muted-foreground group-hover:text-foreground"
                    )}
                  >
                    <span className="font-mono text-[10px] text-amber-600 dark:text-amber-500">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="hidden truncate font-medium sm:inline">
                      {t(`phases.${item.id}.title`)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p
          key={phase}
          className="type-body-medium mt-3 min-h-[2lh] animate-rise text-muted-foreground sm:min-h-0"
          aria-live="polite"
        >
          <span className="mr-2 font-medium text-foreground sm:hidden">
            {t(`phases.${phase}.title`)}
          </span>
          {t(`phases.${phase}.desc`)}
        </p>
      </div>
      <span className="sr-only">{t("loopNote", { seconds: LOOP_SECONDS })}</span>
    </div>
  );
}
