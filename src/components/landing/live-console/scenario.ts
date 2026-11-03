/**
 * 落地页「路由实况」演示剧本：纯数据与纯函数，不触碰 DOM。
 *
 * 一轮 16 秒，讲完一次完整的故障转移：两个主力上游正常分流 → 其中一个开始报错、
 * 失败请求被重试到别处 → 熔断打开、备用上游接手 → 半开放少量试探 → 恢复如初。
 */

export type PhaseId = "steady" | "errors" | "tripped" | "probing" | "recovered";

export interface Phase {
  id: PhaseId;
  /** 本阶段在一轮中的起止秒数。 */
  start: number;
  end: number;
}

export const LOOP_SECONDS = 16;

export const PHASES: readonly Phase[] = [
  { id: "steady", start: 0, end: 4 },
  { id: "errors", start: 4, end: 6.5 },
  { id: "tripped", start: 6.5, end: 10.5 },
  { id: "probing", start: 10.5, end: 13.5 },
  { id: "recovered", start: 13.5, end: LOOP_SECONDS },
];

/** 减少动态效果时停留的画面：熔断已打开、备用上游接手，信息量最大。 */
export const STATIC_PHASE: PhaseId = "tripped";

export type UpstreamId = "openai" | "anthropic" | "azure" | "gemini";

export interface DemoUpstream {
  id: UpstreamId;
  name: string;
  priority: number;
  model: string;
  /** 正常延迟中位数（毫秒），日志里围绕它抖动。 */
  latency: number;
}

export const UPSTREAMS: readonly DemoUpstream[] = [
  { id: "openai", name: "openai-primary", priority: 1, model: "gpt-4o", latency: 290 },
  { id: "anthropic", name: "anthropic-main", priority: 1, model: "claude-sonnet-4", latency: 340 },
  { id: "azure", name: "azure-openai", priority: 2, model: "gpt-4o", latency: 380 },
  { id: "gemini", name: "gemini-backup", priority: 3, model: "gemini-2.5-pro", latency: 420 },
];

export const FAILING_UPSTREAM: UpstreamId = "anthropic";
export const STANDBY_UPSTREAM: UpstreamId = "azure";

/** 上游在画面上的状态：serving 正常转发、standby 待命、failing 报错中、open 熔断、half 半开试探。 */
export type UpstreamStatus = "serving" | "standby" | "failing" | "open" | "half";

export function wrapTime(seconds: number): number {
  return ((seconds % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS;
}

export function phaseIndexAt(seconds: number): number {
  const t = wrapTime(seconds);
  const index = PHASES.findIndex((phase) => t >= phase.start && t < phase.end);
  return index === -1 ? PHASES.length - 1 : index;
}

export function phaseAt(seconds: number): Phase {
  return PHASES[phaseIndexAt(seconds)];
}

/** 当前阶段已走完的比例（0–1），用于叙事进度条。 */
export function phaseProgress(seconds: number): number {
  const t = wrapTime(seconds);
  const phase = phaseAt(t);
  return Math.min(1, Math.max(0, (t - phase.start) / (phase.end - phase.start)));
}

export function phaseStart(id: PhaseId): number {
  return PHASES.find((phase) => phase.id === id)!.start;
}

export function upstreamStatus(phase: PhaseId, id: UpstreamId): UpstreamStatus {
  if (id === FAILING_UPSTREAM) {
    if (phase === "errors") return "failing";
    if (phase === "tripped") return "open";
    if (phase === "probing") return "half";
    return "serving";
  }
  if (id === STANDBY_UPSTREAM) {
    return phase === "tripped" || phase === "probing" ? "serving" : "standby";
  }
  return id === "openai" ? "serving" : "standby";
}

/** 一次请求的走向：先到 target；失败时由网关重试到 retryTo。 */
export interface RequestPlan {
  target: UpstreamId;
  kind: "ok" | "fail" | "probe";
  retryTo?: UpstreamId;
}

/**
 * 按阶段为一次新请求定路线。`random` 取 [0, 1)，由调用方注入以便测试。
 * 主力层按 60/40 权重分流；熔断期间 anthropic 的份额由备用层的 azure 接手。
 */
export function planRequest(phase: PhaseId, random: number): RequestPlan {
  switch (phase) {
    case "errors":
      if (random < 0.6) return { target: "openai", kind: "ok" };
      // 报错期间打到 anthropic 的请求全部失败，被重试到另一个主力上游。
      return { target: "anthropic", kind: "fail", retryTo: "openai" };
    case "tripped":
      return random < 0.6 ? { target: "openai", kind: "ok" } : { target: "azure", kind: "ok" };
    case "probing":
      if (random < 0.58) return { target: "openai", kind: "ok" };
      if (random < 0.92) return { target: "azure", kind: "ok" };
      return { target: "anthropic", kind: "probe" };
    default:
      return random < 0.6 ? { target: "openai", kind: "ok" } : { target: "anthropic", kind: "ok" };
  }
}

export interface Metrics {
  /** 每分钟请求数。 */
  rpm: number;
  /** 成功率百分比。 */
  success: number;
  /** 延迟中位数（毫秒）。 */
  latency: number;
  /** 处于熔断（含半开）的上游数。 */
  breakers: number;
}

export const PHASE_METRICS: Record<PhaseId, Metrics> = {
  steady: { rpm: 1240, success: 99.9, latency: 312, breakers: 0 },
  errors: { rpm: 1236, success: 96.8, latency: 884, breakers: 0 },
  tripped: { rpm: 1242, success: 99.7, latency: 352, breakers: 1 },
  probing: { rpm: 1238, success: 99.8, latency: 338, breakers: 1 },
  recovered: { rpm: 1244, success: 99.9, latency: 316, breakers: 0 },
};

/** 由上一帧指标向阶段目标靠拢，并叠加确定性抖动，让数字像真的在跳。 */
export function nextMetrics(previous: Metrics, phase: PhaseId, seconds: number): Metrics {
  const target = PHASE_METRICS[phase];
  const ease = (from: number, to: number, rate: number) => from + (to - from) * rate;
  return {
    rpm: Math.round(ease(previous.rpm, target.rpm, 0.5) + Math.sin(seconds * 2.3) * 18),
    success: Math.min(100, ease(previous.success, target.success, 0.45)),
    latency: Math.round(ease(previous.latency, target.latency, 0.4) + Math.sin(seconds * 3.1) * 9),
    breakers: target.breakers,
  };
}

export function upstreamName(id: UpstreamId): string {
  return UPSTREAMS.find((upstream) => upstream.id === id)!.name;
}

export function upstreamModel(id: UpstreamId): string {
  return UPSTREAMS.find((upstream) => upstream.id === id)!.model;
}

export function upstreamLatency(id: UpstreamId, random: number): number {
  const base = UPSTREAMS.find((upstream) => upstream.id === id)!.latency;
  return Math.round(base * (0.75 + random * 0.6));
}

/** 日志行：请求结果或熔断器事件。 */
export type LogEntry =
  | {
      id: number;
      type: "request";
      clock: string;
      status: number;
      upstream: UpstreamId;
      latency: number;
      tag?: "retry" | "probe";
    }
  | {
      id: number;
      type: "event";
      clock: string;
      event: "open" | "half" | "closed";
      upstream: UpstreamId;
    };

/** 尚未分配 id 与时间戳的日志行（对联合类型逐个成员做 Omit）。 */
export type LogDraft = LogEntry extends infer Entry
  ? Entry extends LogEntry
    ? Omit<Entry, "id" | "clock">
    : never
  : never;

/** 进入某阶段时熔断器发生的事件。 */
export function phaseEvent(phase: PhaseId): "open" | "half" | "closed" | null {
  if (phase === "tripped") return "open";
  if (phase === "probing") return "half";
  if (phase === "recovered") return "closed";
  return null;
}

export function formatClock(date: Date): string {
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/** 静态画面用的日志：熔断打开后，备用上游接手。 */
export function staticLog(clock: string): LogEntry[] {
  return [
    { id: 6, type: "request", clock, status: 200, upstream: "azure", latency: 371 },
    { id: 5, type: "request", clock, status: 200, upstream: "openai", latency: 284 },
    { id: 4, type: "event", clock, event: "open", upstream: "anthropic" },
    { id: 3, type: "request", clock, status: 200, upstream: "openai", latency: 302, tag: "retry" },
    { id: 2, type: "request", clock, status: 502, upstream: "anthropic", latency: 1204 },
    { id: 1, type: "request", clock, status: 200, upstream: "openai", latency: 296 },
  ];
}
