"use client";

import { useId, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Network } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { useLivePulse } from "@/hooks/use-live-pulse";
import { useUpstreamHealth, useUpstreams } from "@/hooks/use-upstreams";
import { cn } from "@/lib/utils";
import type { UpstreamResponse } from "@/types/api";

import { DashboardLoadingBlock, DashboardLoadingSurface } from "./dashboard-loading";

/** 节点状态（design.md D8 唯一裁决表，按序判定）。 */
type TopologyNodeState = "inactive" | "bad" | "warn" | "ok";

interface TopologyNode {
  upstream: UpstreamResponse;
  state: TopologyNodeState;
  centerY: number;
}

/** 面板最多渲染的上游节点数，其余折叠为「+N」。 */
const MAX_NODES = 8;

const VIEW_WIDTH = 720;
const VIEW_HEIGHT = 280;
const GATEWAY = { x: 40, y: 110, width: 144, height: 60 };
const GATEWAY_RIGHT = GATEWAY.x + GATEWAY.width;
const GATEWAY_CENTER_Y = GATEWAY.y + GATEWAY.height / 2;
const NODE = { x: 512, width: 176, height: 30 };
/** 节点垂直分布的可用半径（围绕画布纵向中线）。 */
const NODE_SPREAD = 240;
const NODE_SPACING_MAX = 32;
const NAME_MAX_CHARS = 18;

const NODE_STROKE_CLASSES: Record<TopologyNodeState, string> = {
  ok: "stroke-status-success/70",
  warn: "stroke-status-warning/70",
  bad: "stroke-status-error/70",
  inactive: "stroke-border",
};

const NODE_LED_CLASSES: Record<TopologyNodeState, string> = {
  ok: "fill-status-success",
  warn: "fill-status-warning",
  bad: "fill-status-error",
  inactive: "fill-muted-foreground/50",
};

const EDGE_STROKE_CLASSES: Record<TopologyNodeState, string> = {
  ok: "stroke-amber-500/35",
  warn: "stroke-status-warning/40",
  bad: "stroke-status-error/30",
  inactive: "stroke-border",
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(callback: () => void) {
  const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
  mediaQuery.addEventListener("change", callback);
  return () => mediaQuery.removeEventListener("change", callback);
}

function getReducedMotionSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getReducedMotionServerSnapshot() {
  return false;
}

/**
 * SMIL 动画不受 CSS media query 控制，reduced-motion 必须在 JS 里判定，
 * 为真时直接不渲染 animateMotion 子树（design.md D8）。
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );
}

function resolveNodeState(upstream: UpstreamResponse, healthy: boolean): TopologyNodeState {
  if (!upstream.is_active) return "inactive";
  const breakerState = upstream.circuit_breaker?.state ?? "closed";
  if (breakerState === "open" || !healthy) return "bad";
  if (breakerState === "half_open") return "warn";
  return "ok";
}

function truncateName(name: string): string {
  if (name.length <= NAME_MAX_CHARS) return name;
  return `${name.slice(0, NAME_MAX_CHARS - 1)}…`;
}

function edgePath(centerY: number): string {
  return `M ${GATEWAY_RIGHT} ${GATEWAY_CENTER_Y} C 330 ${GATEWAY_CENTER_Y} 366 ${centerY} ${NODE.x} ${centerY}`;
}

/**
 * 路由拓扑面板：网关 → 上游的实时路由拓扑（design.md D8）。
 * 零后端改动，数据全部来自现成 hooks；SMIL 流量包为纯增强，
 * 静态渲染（边线颜色/虚线/LED）已完整表达状态。
 */
export function RoutingTopology() {
  const t = useTranslations("dashboard");
  const reducedMotion = usePrefersReducedMotion();
  const idPrefix = useId();

  const { data: upstreamsData, isLoading } = useUpstreams(1, 50);
  const { data: healthData } = useUpstreamHealth(true);
  const { snapshot } = useLivePulse();

  const items = upstreamsData?.items ?? [];

  const healthMap = new Map<string, boolean>();
  for (const health of healthData?.data ?? []) {
    healthMap.set(health.upstream_id, health.is_healthy);
  }

  // 无健康记录的上游按健康处理：健康数据缺失（首查未完成/接口异常）不应把整幅拓扑判红。
  const resolveHealthy = (id: string) => healthMap.get(id) ?? true;

  const sorted = [...items].sort(
    (a, b) => a.priority - b.priority || b.weight - a.weight || a.name.localeCompare(b.name)
  );

  const counts = { ok: 0, warn: 0, bad: 0, inactive: 0 };
  const statesById = new Map<string, TopologyNodeState>();
  for (const upstream of sorted) {
    const state = resolveNodeState(upstream, resolveHealthy(upstream.id));
    statesById.set(upstream.id, state);
    counts[state] += 1;
  }

  const visible = sorted.slice(0, MAX_NODES);
  const overflowCount = sorted.length - visible.length;

  const spacing =
    visible.length > 1 ? Math.min(NODE_SPACING_MAX, NODE_SPREAD / (visible.length - 1)) : 0;
  const nodes: TopologyNode[] = visible.map((upstream, index) => ({
    upstream,
    state: statesById.get(upstream.id) ?? "ok",
    centerY: VIEW_HEIGHT / 2 + (index - (visible.length - 1) / 2) * spacing,
  }));

  const rpm = snapshot?.requestsPerMinute ?? 0;
  // rpm → 流量包密度：以运动周期表达，rpm 越高包越密；无数据时用慢速环境包。
  const baseDur = rpm >= 120 ? 1.8 : rpm >= 30 ? 2.4 : 3.2;
  // errorRatePct → 核心节点 warn 描边。
  const coreWarn = (snapshot?.errorRatePct ?? 0) >= 5;
  const openBreakers = snapshot?.gateway?.openCircuitBreakers ?? counts.bad;

  const titleId = `${idPrefix}-topology-title`;
  const descId = `${idPrefix}-topology-desc`;

  return (
    <Card variant="outlined" className="border-divider">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-amber-500" />
            <h2 className="type-title-medium text-foreground">{t("topology.title")}</h2>
          </div>
          {!isLoading && items.length > 0 && (
            <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.08em]">
              <span className="text-muted-foreground">
                {t("topology.upSummary", {
                  healthy: counts.ok + counts.warn,
                  total: sorted.length,
                })}
              </span>
              {openBreakers > 0 && (
                <span className="text-status-error">
                  {t("topology.breakersOpen", { count: openBreakers })}
                </span>
              )}
            </div>
          )}
        </div>

        {isLoading ? (
          <DashboardLoadingSurface loadingLabel={t("stats.loading")}>
            <DashboardLoadingBlock className="h-48 w-full" />
          </DashboardLoadingSurface>
        ) : items.length === 0 ? (
          <p className="py-10 text-center type-body-medium text-muted-foreground">
            {t("topology.empty")}
          </p>
        ) : (
          <>
            <svg
              role="img"
              aria-labelledby={`${titleId} ${descId}`}
              viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
              className="mx-auto w-full max-w-4xl"
            >
              <title id={titleId}>{t("topology.title")}</title>
              <desc id={descId}>{t("topology.desc")}</desc>

              {/* 边线：网关 → 每个上游节点 */}
              {nodes.map((node, index) => (
                <path
                  key={node.upstream.id}
                  id={`${idPrefix}-edge-${index}`}
                  d={edgePath(node.centerY)}
                  className={cn("fill-none", EDGE_STROKE_CLASSES[node.state])}
                  strokeWidth={1.25}
                  strokeDasharray={node.state === "bad" ? "5 4" : undefined}
                />
              ))}

              {/* 流量包：SMIL 纯增强；reduced-motion / 离线 / 停用节点不渲染 */}
              {!reducedMotion &&
                nodes.map((node, index) => {
                  if (node.state !== "ok" && node.state !== "warn") return null;
                  const dur = node.state === "warn" ? baseDur * 2.5 : baseDur;
                  return (
                    <circle key={node.upstream.id} r={3} className="fill-amber-500">
                      <animateMotion
                        dur={`${dur.toFixed(1)}s`}
                        begin={`${(index * 0.4).toFixed(1)}s`}
                        repeatCount="indefinite"
                      >
                        <mpath href={`#${idPrefix}-edge-${index}`} />
                      </animateMotion>
                    </circle>
                  );
                })}

              {/* 网关核心节点 */}
              <g data-core-state={coreWarn ? "warn" : "ok"}>
                <rect
                  x={GATEWAY.x}
                  y={GATEWAY.y}
                  width={GATEWAY.width}
                  height={GATEWAY.height}
                  rx={8}
                  strokeWidth={1.5}
                  className={cn(
                    "fill-surface-200",
                    coreWarn ? "stroke-status-warning/80" : "stroke-amber-500/45"
                  )}
                />
                <text
                  x={GATEWAY.x + GATEWAY.width / 2}
                  y={GATEWAY_CENTER_Y - 3}
                  textAnchor="middle"
                  className="fill-foreground font-mono text-[12px] font-semibold tracking-[0.12em]"
                >
                  AUTOROUTER
                </text>
                <text
                  x={GATEWAY.x + GATEWAY.width / 2}
                  y={GATEWAY_CENTER_Y + 14}
                  textAnchor="middle"
                  className="fill-muted-foreground font-mono text-[9px] uppercase tracking-[0.16em]"
                >
                  {t("topology.gateway")}
                </text>
              </g>

              {/* 上游节点 */}
              {nodes.map((node) => {
                const top = node.centerY - NODE.height / 2;
                const inactive = node.state === "inactive";
                return (
                  <g
                    key={node.upstream.id}
                    data-testid="topology-node"
                    data-state={node.state}
                    className={inactive ? "opacity-45" : undefined}
                  >
                    <rect
                      x={NODE.x}
                      y={top}
                      width={NODE.width}
                      height={NODE.height}
                      rx={6}
                      strokeWidth={1.25}
                      strokeDasharray={node.state === "bad" ? "5 4" : undefined}
                      className={cn("fill-surface-200", NODE_STROKE_CLASSES[node.state])}
                    />
                    <circle
                      cx={NODE.x + 14}
                      cy={node.centerY}
                      r={3}
                      className={NODE_LED_CLASSES[node.state]}
                    />
                    <text
                      x={NODE.x + 26}
                      y={node.centerY + 3.5}
                      className={cn(
                        "font-mono text-[11px]",
                        inactive ? "fill-muted-foreground" : "fill-foreground"
                      )}
                    >
                      {truncateName(node.upstream.name)}
                    </text>
                    <text
                      x={NODE.x + NODE.width - 10}
                      y={node.centerY + 3}
                      textAnchor="end"
                      className="fill-muted-foreground font-mono text-[9px]"
                    >
                      P{node.upstream.priority}
                    </text>
                  </g>
                );
              })}

              {overflowCount > 0 && (
                <text
                  x={NODE.x + NODE.width}
                  y={VIEW_HEIGHT - 6}
                  textAnchor="end"
                  className="fill-muted-foreground font-mono text-[11px]"
                >
                  +{overflowCount}
                </text>
              )}
            </svg>

            <p className="sr-only">
              {t("topology.summary", {
                total: sorted.length,
                ok: counts.ok,
                warn: counts.warn,
                bad: counts.bad,
                inactive: counts.inactive,
              })}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
