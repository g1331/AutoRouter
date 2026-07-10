"use client";

import type { ReactNode } from "react";
import {
  CheckCircle2,
  ChevronRight,
  CircleSlash,
  CornerDownRight,
  Gauge,
  KeyRound,
  Link2,
  Receipt,
  Route,
  Scale,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * 核心能力卡顶部的微动画。每条能力配一个借用后台运维可视化语言的「迷你面板」——
 * 真实字段（上游名 / 权重 / 熔断状态 / 配额 / 金额 / 会话）+ 状态图标 + 明显的运动层
 * （流量高光横扫 / 数据包沿链路流动 / 信号扩散 / 选中呼吸），替代原来的抽象图标。
 * 全部纯 CSS。底层信息是静态 DOM，运动层只是叠加；reduced-motion 时运动层停在屏外/
 * 透明起始帧自动隐去，静态面板仍完整可读。配色只用 amber + 状态绿/红（走 token，适配
 * 深浅主题），各面板形态刻意区分，避免都长成同一张候选列表。
 */

const STAGE = "relative h-28 w-full overflow-hidden border-b border-divider/50 bg-surface-200/30";
const PANEL = "absolute inset-x-3 inset-y-2 flex flex-col justify-center gap-1 font-mono";

export function CapabilityAnimation({ kind }: { kind: string }) {
  return (
    <div className={STAGE} aria-hidden="true">
      {kind === "routing" && <RoutingAnim />}
      {kind === "balancing" && <BalancingAnim />}
      {kind === "quota" && <QuotaAnim />}
      {kind === "billing" && <BillingAnim />}
      {kind === "keys" && <KeysAnim />}
      {kind === "failover" && <FailoverAnim />}
    </div>
  );
}

// 各面板统一头部：amber 图标 + 标签（大写小字，运维面板风格）。
function PanelHead({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3 w-3 shrink-0 text-amber-500" />
      {children}
    </div>
  );
}

// 运动层：一道 amber 高光沿容器横扫，表示流量正在经过。需放进 relative + overflow-hidden
// 容器；reduced-motion 时停在屏外起始帧自动隐去。
function Sheen({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-amber-300/40 to-transparent"
      style={{ animation: `vr-cap-sheen 2.8s ease-in-out ${delay}s infinite` }}
    />
  );
}

// 运动层：一个数据包沿水平链路左→右流动。需放进 relative + overflow-hidden 容器；
// reduced-motion 时停在 left:0、opacity:0 的起始帧自动隐去。
function Trace({
  tone = "amber",
  delay = 0,
  duration = 3,
}: {
  tone?: "amber" | "success" | "error";
  delay?: number;
  duration?: number;
}) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full",
        tone === "amber" && "bg-amber-400",
        tone === "success" && "bg-status-success",
        tone === "error" && "bg-status-error"
      )}
      style={{ left: 0, animation: `vr-cap-trace ${duration}s linear ${delay}s infinite` }}
    />
  );
}

// 配额 / 并发用的计量行：标签 + 进度条（width 固定到真实值，reduced-motion 可读）+ 读数。
// 进度条上叠一道高光横扫，表示实时计量在流动。
function MeterRow({
  label,
  value,
  pct,
  warn = false,
  delay = 0,
}: {
  label: string;
  value: string;
  pct: number;
  warn?: boolean;
  delay?: number;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[9px]">
      <span className="w-9 shrink-0 text-muted-foreground">{label}</span>
      <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-400">
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            warn ? "bg-status-warning/80" : "bg-amber-500/70"
          )}
          style={{ width: `${pct}%` }}
        />
        {warn ? <span className="absolute inset-y-0 right-[8%] w-px bg-status-error/70" /> : null}
        <Sheen delay={delay} />
      </span>
      <span className="w-14 shrink-0 text-right text-[8px] text-muted-foreground">{value}</span>
    </div>
  );
}

// 按能力路由：识别请求能力（路径 + 模型）后，在候选上游里做决策——命中健康上游、
// 排除熔断上游。借后台「路由决策时间线」的视觉语言：●/○/✗ 三态、熔断状态图标、
// w 权重、status-success 选中行。命中行做 success 呼吸，并有一个数据包沿命中链路流过。
const ROUTING_CANDIDATES = [
  { name: "azure-gpt-01", weight: 5, pick: "selected" as const },
  { name: "openai-pool-02", weight: 3, pick: "alt" as const },
  { name: "gemini-03", weight: 0, pick: "excluded" as const },
];

function RoutingAnim() {
  return (
    <div className={PANEL}>
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
        <Route className="h-3 w-3 shrink-0 animate-pulse text-amber-500" />
        <span className="text-amber-500">POST /v1/messages</span>
        <ChevronRight className="h-2.5 w-2.5 shrink-0" />
        <span>claude-3.5</span>
      </div>
      {ROUTING_CANDIDATES.map((c) => (
        <div
          key={c.name}
          className={cn(
            "relative flex items-center gap-1.5 overflow-hidden rounded-cf-sm border px-1.5 py-[3px] text-[9px]",
            c.pick === "selected" && "border-status-success/40",
            c.pick === "alt" && "border-divider/60 bg-surface-300/40",
            c.pick === "excluded" && "border-status-error/25 bg-status-error/5"
          )}
          style={
            c.pick === "selected"
              ? { animation: "vr-cap-select 2.6s ease-in-out infinite" }
              : undefined
          }
        >
          <span
            className={cn(
              "shrink-0",
              c.pick === "selected" && "text-status-success",
              c.pick === "alt" && "text-muted-foreground",
              c.pick === "excluded" && "text-status-error"
            )}
          >
            {c.pick === "selected" ? "●" : c.pick === "excluded" ? "✗" : "○"}
          </span>
          {c.pick === "excluded" ? (
            <CircleSlash className="h-3 w-3 shrink-0 text-status-error" />
          ) : (
            <CheckCircle2 className="h-3 w-3 shrink-0 text-status-success" />
          )}
          <span className="min-w-0 flex-1 truncate text-foreground">{c.name}</span>
          {c.pick === "excluded" ? (
            <span className="shrink-0 text-[8px] uppercase tracking-wide text-status-error">
              open
            </span>
          ) : (
            <span className="shrink-0 text-[8px] text-muted-foreground">w{c.weight}</span>
          )}
          {c.pick === "selected" ? <Trace tone="success" duration={2.6} /> : null}
        </div>
      ))}
    </div>
  );
}

// 负载均衡与熔断：一排上游的实时负载条 + 心跳 LED，权重不同负载不同；异常上游熔断
// （LED 转红、负载条消失、读数 OPEN）。负载条上有高光横扫表示流量在流，与 routing
// 的决策列表区分。
const BALANCE_ROWS = [
  { name: "azure-gpt-01", load: 62, open: false },
  { name: "openai-pool-02", load: 38, open: false },
  { name: "claude-eu-01", load: 0, open: true },
];

function BalancingAnim() {
  return (
    <div className={PANEL}>
      <PanelHead icon={Scale}>
        <span>load-balance · weighted</span>
      </PanelHead>
      {BALANCE_ROWS.map((r, i) => (
        <div key={r.name} className="flex items-center gap-1.5 text-[9px]">
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 animate-pulse rounded-full",
              r.open ? "bg-status-error" : "bg-status-success"
            )}
            style={{ animationDelay: `${i * 0.4}s` }}
          />
          <span className="w-[72px] shrink-0 truncate text-foreground">{r.name}</span>
          <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-surface-400">
            {r.open ? null : (
              <>
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-amber-500/70"
                  style={{ width: `${r.load}%` }}
                />
                <Sheen delay={i * 0.5} />
              </>
            )}
          </span>
          <span
            className={cn(
              "w-9 shrink-0 text-right text-[8px]",
              r.open ? "text-status-error" : "text-muted-foreground"
            )}
          >
            {r.open ? "OPEN" : `${r.load}%`}
          </span>
        </div>
      ))}
    </div>
  );
}

// 配额与并发控制：对某个密钥施加请求配额、并发上限与排队准入。请求条逼近红色上限线，
// 并发条接近满（两条都有高光横扫），排队点雷达式扩散，表示新请求不断准入排队。
function QuotaAnim() {
  return (
    <div className={PANEL}>
      <PanelHead icon={Gauge}>
        <span className="normal-case">sk-…a3f9 · limits</span>
      </PanelHead>
      <MeterRow label="req" value="8.2k / 10k" pct={84} warn />
      <MeterRow label="conc" value="4 / 6" pct={66} delay={0.6} />
      <div className="flex items-center gap-1.5 text-[9px]">
        <span className="w-9 shrink-0 text-muted-foreground">queue</span>
        <span className="flex flex-1 items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="relative flex h-1.5 w-1.5">
              <span
                className="absolute inset-0 animate-ping rounded-full bg-amber-400/70"
                style={{ animationDelay: `${i * 0.35}s` }}
              />
              <span className="relative h-1.5 w-1.5 rounded-full bg-amber-500/60" />
            </span>
          ))}
        </span>
        <span className="w-14 shrink-0 text-right text-[8px] text-muted-foreground">waiting 2</span>
      </div>
    </div>
  );
}

// 按请求计费：识别模型 → 统计 in/out token × 倍率 → 生成一条计费快照。形态是「计费小票」
// 字段流 + 末行金额，金额行有高光扫过、金额本身呼吸，表示「刚结算出这笔」。
function BillingAnim() {
  return (
    <div className={PANEL}>
      <PanelHead icon={Receipt}>
        <span>bill · snapshot</span>
      </PanelHead>
      <div className="flex items-center justify-between text-[9px]">
        <span className="text-muted-foreground">model</span>
        <span className="text-foreground">claude-3.5-sonnet</span>
      </div>
      <div className="flex items-center justify-between text-[9px]">
        <span className="text-muted-foreground">tokens · rate</span>
        <span className="text-foreground">↑1.2k ↓0.8k · ×1.0</span>
      </div>
      <div className="relative flex items-center justify-between overflow-hidden">
        <span className="flex items-center gap-1 text-[8px] text-status-success">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          snapshot
        </span>
        <span className="animate-pulse text-[11px] font-semibold text-amber-500">$0.0213</span>
        <Sheen />
      </div>
    </div>
  );
}

// API Key 分发：签发一把客户端密钥，限定授权上游与有效期。形态是「密钥卡」——脱敏 ID +
// scope/有效期 + 一排授权上游药丸，点位雷达式扩散点亮，表示把授权派发到这些上游。
const KEY_SCOPES = ["azure-gpt-01", "openai-pool-02", "claude-eu-01"];

function KeysAnim() {
  return (
    <div className={PANEL}>
      <div className="flex items-center gap-1.5 text-[9px]">
        <KeyRound className="h-3.5 w-3.5 shrink-0 animate-pulse text-amber-500" />
        <span className="text-foreground">sk-live-…7f2c</span>
      </div>
      <div className="flex items-center gap-1.5 text-[8px] text-muted-foreground">
        <span>scope 3 upstreams</span>
        <span>·</span>
        <span>exp 2026-12-31</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {KEY_SCOPES.map((u, i) => (
          <span
            key={u}
            className="inline-flex items-center gap-1 rounded-cf-sm border border-amber-500/30 bg-amber-500/5 px-1 py-[1px] text-[8px] text-foreground"
          >
            <span className="relative flex h-1 w-1 shrink-0">
              <span
                className="absolute inset-0 animate-ping rounded-full bg-amber-400/70"
                style={{ animationDelay: `${i * 0.45}s` }}
              />
              <span className="relative h-1 w-1 rounded-full bg-amber-400" />
            </span>
            {u}
          </span>
        ))}
      </div>
    </div>
  );
}

// 故障转移与会话亲和：同一会话的请求第 1 次命中失败（5xx 红框 + 红数据包撞向右端）→
// failover 改道 → 第 2 次接管成功（200 绿框呼吸 + 绿数据包穿过）。两个数据包错峰
// 流动，体现「转移」的因果时序，借后台 RetryTimeline 的视觉语言。
function FailoverAnim() {
  return (
    <div className={PANEL}>
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
        <Link2 className="h-3 w-3 shrink-0 text-amber-500" />
        <span>session …a3f9 · affinity</span>
      </div>
      <div className="relative flex items-center gap-1.5 overflow-hidden rounded-cf-sm border border-status-error/25 bg-status-error/5 px-1.5 py-[3px] text-[9px]">
        <span className="shrink-0 text-[8px] text-muted-foreground">1</span>
        <Zap className="h-3 w-3 shrink-0 text-status-error" />
        <span className="min-w-0 flex-1 truncate text-foreground">azure-gpt-01</span>
        <span className="shrink-0 text-[8px] text-status-error">http_5xx</span>
        <Trace tone="error" duration={2.8} />
      </div>
      <div className="flex items-center gap-1 pl-1 text-[8px] text-amber-500">
        <CornerDownRight className="h-3 w-3 shrink-0 animate-pulse" />
        <span>failover</span>
      </div>
      <div
        className="relative flex items-center gap-1.5 overflow-hidden rounded-cf-sm border border-status-success/40 px-1.5 py-[3px] text-[9px]"
        style={{ animation: "vr-cap-select 2.8s ease-in-out infinite" }}
      >
        <span className="shrink-0 text-[8px] text-muted-foreground">2</span>
        <CheckCircle2 className="h-3 w-3 shrink-0 text-status-success" />
        <span className="min-w-0 flex-1 truncate text-foreground">openai-pool-02</span>
        <span className="shrink-0 text-[8px] text-status-success">200 OK</span>
        <Trace tone="success" delay={1.4} duration={2.8} />
      </div>
    </div>
  );
}
