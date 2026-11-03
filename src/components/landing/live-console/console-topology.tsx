"use client";

import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";

import { cn } from "@/lib/utils";

import {
  UPSTREAMS,
  planRequest,
  upstreamStatus,
  type PhaseId,
  type RequestPlan,
  type UpstreamId,
  type UpstreamStatus,
} from "./scenario";

/** 一次请求在上游侧落地时回报给控制台，用于写日志。 */
export interface ArrivalEvent {
  upstream: UpstreamId;
  outcome: "ok" | "error" | "retry" | "probe";
}

interface ConsoleTopologyProps {
  phase: PhaseId;
  /** 动画循环读取的实时阶段，避免阶段切换时重建循环。 */
  phaseRef: RefObject<PhaseId>;
  running: boolean;
  title: string;
  description: string;
  onArrival: (event: ArrivalEvent) => void;
}

const CLIENTS = [
  { id: "web", label: "web-app", y: 92 },
  { id: "agent", label: "agent", y: 170 },
  { id: "cli", label: "cli", y: 248 },
] as const;

const CLIENT_BOX = { x: 18, width: 128, height: 38 };
const GATEWAY = { x: 316, y: 126, width: 168, height: 88 };
const GATEWAY_CY = GATEWAY.y + GATEWAY.height / 2;
const NODE_BOX = { x: 590, width: 196, height: 44 };
const NODE_Y: Record<UpstreamId, number> = { openai: 62, anthropic: 132, azure: 208, gemini: 278 };

const DESKTOP_VIEWBOX = "0 20 800 300";
/** 窄屏只保留网关与上游，字号随之放大。 */
const MOBILE_VIEWBOX = "300 26 500 290";

const inPath = (y: number) =>
  `M ${CLIENT_BOX.x + CLIENT_BOX.width} ${y} C 236 ${y} 236 ${GATEWAY_CY} ${GATEWAY.x} ${GATEWAY_CY}`;
const outPath = (y: number) =>
  `M ${GATEWAY.x + GATEWAY.width} ${GATEWAY_CY} C 544 ${GATEWAY_CY} 534 ${y} ${NODE_BOX.x} ${y}`;

const GATEWAY_STATUS: Record<PhaseId, { label: string; tone: string }> = {
  steady: { label: "ROUTING", tone: "fill-muted-foreground" },
  errors: { label: "RETRYING", tone: "fill-status-warning" },
  tripped: { label: "FAILOVER", tone: "fill-status-error" },
  probing: { label: "PROBING", tone: "fill-status-warning" },
  recovered: { label: "ROUTING", tone: "fill-status-success" },
};

const STATUS_LABEL: Record<UpstreamStatus, string> = {
  serving: "CLOSED",
  standby: "STANDBY",
  failing: "5XX",
  open: "OPEN",
  half: "HALF",
};

const NODE_STROKE: Record<UpstreamStatus, string> = {
  serving: "stroke-status-success/60",
  standby: "stroke-border",
  failing: "stroke-status-error/80",
  open: "stroke-status-error/70",
  half: "stroke-status-warning/75",
};

const NODE_TEXT: Record<UpstreamStatus, string> = {
  serving: "fill-status-success",
  standby: "fill-muted-foreground",
  failing: "fill-status-error",
  open: "fill-status-error",
  half: "fill-status-warning",
};

const EDGE_STROKE: Record<UpstreamStatus, string> = {
  serving: "stroke-amber-500/45",
  standby: "stroke-border",
  failing: "stroke-status-error/55",
  open: "stroke-status-error/35",
  half: "stroke-status-warning/50",
};

const EDGE_DASH: Partial<Record<UpstreamStatus, string>> = {
  standby: "2 6",
  open: "6 6",
  half: "3 5",
};

const POOL_SIZE = 64;
const BURST_POOL = 8;
const SAMPLES = 96;
const LEG_IN_SECONDS = 0.62;
const LEG_OUT_SECONDS = 0.72;

type PacketKind = "req" | "retry" | "probe";

interface Packet {
  active: boolean;
  path: number;
  t: number;
  duration: number;
  kind: PacketKind;
  onDone?: () => void;
}

function subscribeMobile(callback: () => void) {
  const query = window.matchMedia("(max-width: 640px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/** 把路径预采样成点表，逐帧只做线性插值，避免每帧调用 getPointAtLength。 */
function samplePath(path: SVGPathElement): Float32Array {
  const length = path.getTotalLength();
  const table = new Float32Array((SAMPLES + 1) * 2);
  for (let i = 0; i <= SAMPLES; i++) {
    const point = path.getPointAtLength((length * i) / SAMPLES);
    table[i * 2] = point.x;
    table[i * 2 + 1] = point.y;
  }
  return table;
}

function pointAt(table: Float32Array, t: number): [number, number] {
  const scaled = Math.min(1, Math.max(0, t)) * SAMPLES;
  const index = Math.min(SAMPLES - 1, Math.floor(scaled));
  const fraction = scaled - index;
  const x = table[index * 2] + (table[index * 2 + 2] - table[index * 2]) * fraction;
  const y = table[index * 2 + 1] + (table[index * 2 + 3] - table[index * 2 + 1]) * fraction;
  return [x, y];
}

/** 路由实况拓扑：客户端 → 网关 → 上游，请求以光点形式沿边线流动。 */
export function ConsoleTopology({
  phase,
  phaseRef,
  running,
  title,
  description,
  onArrival,
}: ConsoleTopologyProps) {
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia("(max-width: 640px)").matches,
    () => false
  );

  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const packetRefs = useRef<(SVGGElement | null)[]>([]);
  const burstRefs = useRef<(SVGCircleElement | null)[]>([]);
  const nodeFlashRefs = useRef<Partial<Record<UpstreamId, SVGRectElement | null>>>({});
  const gatewayRingRef = useRef<SVGRectElement | null>(null);
  const onArrivalRef = useRef(onArrival);

  useEffect(() => {
    onArrivalRef.current = onArrival;
  }, [onArrival]);

  useEffect(() => {
    if (!running) return;

    const tables = pathRefs.current.map((path) => (path ? samplePath(path) : new Float32Array()));
    const packets: Packet[] = Array.from({ length: POOL_SIZE }, () => ({
      active: false,
      path: 0,
      t: 0,
      duration: 1,
      kind: "req" as PacketKind,
    }));
    let burstCursor = 0;
    let lastGatewayPulse = 0;
    let spawnIn = 0;
    let last = performance.now();
    let frame = 0;

    const outIndex = (id: UpstreamId) =>
      CLIENTS.length + UPSTREAMS.findIndex((upstream) => upstream.id === id);

    const launch = (path: number, duration: number, kind: PacketKind, onDone?: () => void) => {
      const packet = packets.find((item) => !item.active);
      if (!packet) return;
      Object.assign(packet, { active: true, path, t: 0, duration, kind, onDone });
      const element = packetRefs.current[packets.indexOf(packet)];
      element?.setAttribute("data-kind", kind);
    };

    const burst = (upstream: UpstreamId, tone: "error" | "warning") => {
      const element = burstRefs.current[burstCursor++ % BURST_POOL];
      if (!element) return;
      element.setAttribute("cx", String(NODE_BOX.x));
      element.setAttribute("cy", String(NODE_Y[upstream]));
      element.setAttribute("data-tone", tone);
      element.animate(
        [
          { transform: "scale(0.25)", opacity: 0.95 },
          { transform: "scale(1.7)", opacity: 0 },
        ],
        { duration: 720, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
      );
    };

    const flash = (upstream: UpstreamId) => {
      nodeFlashRefs.current[upstream]?.animate([{ opacity: 0.22 }, { opacity: 0 }], {
        duration: 520,
        easing: "ease-out",
      });
    };

    const pulseGateway = (now: number) => {
      if (now - lastGatewayPulse < 360) return;
      lastGatewayPulse = now;
      gatewayRingRef.current?.animate(
        [
          { opacity: 0.55, transform: "scale(1)" },
          { opacity: 0, transform: "scale(1.12)" },
        ],
        { duration: 900, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
      );
    };

    const spawn = () => {
      const client = Math.floor(Math.random() * CLIENTS.length);
      const plan: RequestPlan = planRequest(phaseRef.current ?? "steady", Math.random());
      launch(client, LEG_IN_SECONDS, plan.kind === "probe" ? "probe" : "req", () => {
        pulseGateway(performance.now());
        launch(
          outIndex(plan.target),
          LEG_OUT_SECONDS,
          plan.kind === "probe" ? "probe" : "req",
          () => {
            if (plan.kind === "fail" && plan.retryTo) {
              burst(plan.target, "error");
              onArrivalRef.current({ upstream: plan.target, outcome: "error" });
              const retryTarget = plan.retryTo;
              launch(outIndex(retryTarget), LEG_OUT_SECONDS, "retry", () => {
                flash(retryTarget);
                onArrivalRef.current({ upstream: retryTarget, outcome: "retry" });
              });
              return;
            }
            if (plan.kind === "probe") burst(plan.target, "warning");
            flash(plan.target);
            onArrivalRef.current({
              upstream: plan.target,
              outcome: plan.kind === "probe" ? "probe" : "ok",
            });
          }
        );
      });
    };

    const tick = (now: number) => {
      // 掉帧时仍按真实时间推进，光点与剧本时钟保持同步；切回后台标签页的长间隔封顶。
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      spawnIn -= dt;
      if (spawnIn <= 0) {
        spawn();
        spawnIn = 0.16 + Math.random() * 0.14;
      }
      packets.forEach((packet, index) => {
        const element = packetRefs.current[index];
        if (!packet.active || !element) return;
        packet.t += dt / packet.duration;
        if (packet.t >= 1) {
          packet.active = false;
          element.style.opacity = "0";
          const done = packet.onDone;
          packet.onDone = undefined;
          done?.();
          return;
        }
        const [x, y] = pointAt(tables[packet.path], packet.t);
        element.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
        element.style.opacity = "1";
      });
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    const packetElements = packetRefs.current;
    return () => {
      cancelAnimationFrame(frame);
      for (const element of packetElements) {
        if (element) element.style.opacity = "0";
      }
    };
  }, [running, phaseRef, isMobile]);

  const gateway = GATEWAY_STATUS[phase];

  return (
    <svg
      role="img"
      aria-label={`${title}. ${description}`}
      viewBox={isMobile ? MOBILE_VIEWBOX : DESKTOP_VIEWBOX}
      className="block h-auto w-full select-none"
    >
      {/* 客户端 → 网关 */}
      {CLIENTS.map((client, index) => (
        <path
          key={client.id}
          ref={(element) => {
            pathRefs.current[index] = element;
          }}
          d={inPath(client.y)}
          className="fill-none stroke-amber-500/30"
          strokeWidth={1.25}
        />
      ))}

      {/* 网关 → 上游：颜色与虚线随状态过渡 */}
      {UPSTREAMS.map((upstream, index) => {
        const status = upstreamStatus(phase, upstream.id);
        return (
          <path
            key={upstream.id}
            ref={(element) => {
              pathRefs.current[CLIENTS.length + index] = element;
            }}
            d={outPath(NODE_Y[upstream.id])}
            className={cn(
              "fill-none transition-[stroke] duration-700 ease-cf-standard",
              EDGE_STROKE[status]
            )}
            strokeWidth={status === "serving" || status === "failing" ? 1.6 : 1.2}
            strokeDasharray={EDGE_DASH[status]}
          />
        );
      })}

      {/* 客户端节点 */}
      {CLIENTS.map((client) => (
        <g key={client.id}>
          <rect
            x={CLIENT_BOX.x}
            y={client.y - CLIENT_BOX.height / 2}
            width={CLIENT_BOX.width}
            height={CLIENT_BOX.height}
            rx={8}
            className="fill-surface-300 stroke-border"
            strokeWidth={1}
          />
          <circle cx={CLIENT_BOX.x + 16} cy={client.y} r={3} className="fill-status-info" />
          <text
            x={CLIENT_BOX.x + 28}
            y={client.y + 4.5}
            className="fill-foreground font-mono text-[13px]"
          >
            {client.label}
          </text>
        </g>
      ))}

      {/* 网关核心 */}
      <g>
        <rect
          ref={gatewayRingRef}
          x={GATEWAY.x}
          y={GATEWAY.y}
          width={GATEWAY.width}
          height={GATEWAY.height}
          rx={14}
          className="fill-none stroke-amber-500 opacity-0 [transform-box:fill-box] [transform-origin:center]"
          strokeWidth={1.5}
        />
        <rect
          x={GATEWAY.x}
          y={GATEWAY.y}
          width={GATEWAY.width}
          height={GATEWAY.height}
          rx={14}
          className="fill-surface-200 stroke-amber-500/60"
          strokeWidth={1.5}
        />
        <text
          x={GATEWAY.x + GATEWAY.width / 2}
          y={GATEWAY_CY - 4}
          textAnchor="middle"
          className="fill-foreground font-mono text-[15px] font-semibold tracking-[0.16em]"
        >
          AUTOROUTER
        </text>
        <text
          x={GATEWAY.x + GATEWAY.width / 2}
          y={GATEWAY_CY + 18}
          textAnchor="middle"
          className={cn(
            "font-mono text-[11px] tracking-[0.2em] transition-[fill] duration-500",
            gateway.tone
          )}
        >
          {gateway.label}
        </text>
      </g>

      {/* 上游节点 */}
      {UPSTREAMS.map((upstream) => {
        const status = upstreamStatus(phase, upstream.id);
        const y = NODE_Y[upstream.id];
        return (
          <g
            key={upstream.id}
            data-testid="console-upstream"
            data-status={status}
            className={cn(
              "transition-opacity duration-700",
              status === "standby" || status === "open" ? "opacity-60" : "opacity-100"
            )}
          >
            <rect
              x={NODE_BOX.x}
              y={y - NODE_BOX.height / 2}
              width={NODE_BOX.width}
              height={NODE_BOX.height}
              rx={9}
              strokeWidth={1.4}
              strokeDasharray={status === "open" ? "6 5" : undefined}
              className={cn(
                "fill-surface-200 transition-[stroke] duration-700",
                NODE_STROKE[status]
              )}
            />
            <rect
              ref={(element) => {
                nodeFlashRefs.current[upstream.id] = element;
              }}
              x={NODE_BOX.x}
              y={y - NODE_BOX.height / 2}
              width={NODE_BOX.width}
              height={NODE_BOX.height}
              rx={9}
              className="fill-amber-500 opacity-0"
            />
            <circle
              cx={NODE_BOX.x + 16}
              cy={y}
              r={3.5}
              className={cn("transition-[fill] duration-500", NODE_TEXT[status])}
            />
            <text x={NODE_BOX.x + 28} y={y + 4.5} className="fill-foreground font-mono text-[13px]">
              {upstream.name}
            </text>
            <text
              x={NODE_BOX.x + NODE_BOX.width - 12}
              y={y + 4}
              textAnchor="end"
              className={cn(
                "font-mono text-[10px] font-semibold tracking-[0.08em] transition-[fill] duration-500",
                NODE_TEXT[status]
              )}
            >
              {STATUS_LABEL[status]}
            </text>
          </g>
        );
      })}

      {/* 请求光点：位置由动画循环直接写入 */}
      {Array.from({ length: POOL_SIZE }, (_, index) => (
        <g
          key={index}
          ref={(element) => {
            packetRefs.current[index] = element;
          }}
          className="group pointer-events-none"
          style={{ opacity: 0 }}
          data-kind="req"
        >
          <circle
            r={7}
            className="fill-amber-500/20 group-data-[kind=probe]:fill-status-warning/25 group-data-[kind=retry]:fill-status-warning/25"
          />
          <circle
            r={2.8}
            className="fill-amber-400 group-data-[kind=probe]:fill-status-warning group-data-[kind=retry]:fill-status-warning"
          />
        </g>
      ))}

      {/* 失败/试探落点的扩散环 */}
      {Array.from({ length: BURST_POOL }, (_, index) => (
        <circle
          key={index}
          ref={(element) => {
            burstRefs.current[index] = element;
          }}
          r={16}
          cx={0}
          cy={0}
          strokeWidth={2}
          className="pointer-events-none fill-none stroke-status-error opacity-0 [transform-box:fill-box] [transform-origin:center] data-[tone=warning]:stroke-status-warning"
        />
      ))}
    </svg>
  );
}
