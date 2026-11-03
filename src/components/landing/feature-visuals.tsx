"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";
import { Check, KeyRound, Pin, RotateCw, X } from "lucide-react";

import { StatusLed } from "@/components/ui/status-led";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

import styles from "./landing.module.css";
import { useInView } from "./effects/use-in-view";

/** 视口内且未开启减少动态效果时才运转，离开视口即停。 */
function useLive(ref: RefObject<Element | null>) {
  const inView = useInView(ref, { threshold: 0.25 });
  const reduced = usePrefersReducedMotion();
  return inView && !reduced;
}

function useTicker(active: boolean, ms: number, tick: () => void) {
  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  });
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => tickRef.current(), ms);
    return () => window.clearInterval(id);
  }, [active, ms]);
}

const PANEL = "rounded-cf-md bg-surface-100/60 p-3 sm:p-4";

/* ───────── 按能力路由：路由表逐行命中 ───────── */

const ROUTES = [
  { path: "/v1/chat/completions", capability: "openai_chat_compatible", provider: "OpenAI" },
  { path: "/v1/messages", capability: "anthropic_messages", provider: "Anthropic" },
  { path: "/v1/responses", capability: "openai_responses", provider: "OpenAI" },
  {
    path: "/v1beta/models/*:generateContent",
    capability: "gemini_native_generate",
    provider: "Gemini",
  },
];

export function RoutingVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const live = useLive(ref);
  const [active, setActive] = useState(0);
  useTicker(live, 1500, () => setActive((value) => (value + 1) % ROUTES.length));

  return (
    <div ref={ref} className={cn(PANEL, "flex flex-col gap-1")} aria-hidden="true">
      {ROUTES.map((route, index) => {
        const hit = index === active;
        return (
          <div
            key={route.path}
            className={cn(
              "relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-cf-md px-3 py-2 font-mono text-xs transition-colors duration-500",
              hit ? "bg-amber-500/10" : "bg-transparent"
            )}
          >
            {hit && live && <span key={active} className={styles.scan} />}
            <StatusLed tone={hit ? "ok" : "neutral"} className="transition-colors" />
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-muted-foreground">POST</span>
              <span className={cn("truncate", hit ? "text-foreground" : "text-muted-foreground")}>
                {route.path}
              </span>
              <span className="hidden truncate text-muted-foreground/70 xl:inline">
                → {route.capability}
              </span>
            </span>
            <span
              className={cn(
                "rounded-cf-sm px-2 py-0.5 text-[11px] transition-colors duration-500",
                hit
                  ? "bg-amber-500 text-primary-foreground"
                  : "bg-surface-300 text-muted-foreground"
              )}
            >
              {route.provider}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ───────── 负载均衡：主力层按权重分配，备用层待命 ───────── */

export function BalancingVisual() {
  const t = useTranslations("landing.features.visual");
  const ref = useRef<HTMLDivElement>(null);
  const live = useLive(ref);
  const [counts, setCounts] = useState({ openai: 1284, anthropic: 856 });
  useTicker(live, 260, () =>
    setCounts((value) => {
      const batch = 2 + Math.floor(Math.random() * 4);
      const openai = Math.round(batch * (0.5 + Math.random() * 0.2));
      return { openai: value.openai + openai, anthropic: value.anthropic + batch - openai };
    })
  );

  const total = counts.openai + counts.anthropic;
  const rows = [
    { name: "openai-primary", weight: 60, count: counts.openai },
    { name: "anthropic-main", weight: 40, count: counts.anthropic },
  ];

  return (
    <div
      ref={ref}
      className={cn(PANEL, "flex flex-col gap-3 font-mono text-[11px]")}
      aria-hidden="true"
    >
      <div className="flex items-center gap-2">
        <span className="rounded-cf-sm bg-amber-500/15 px-1.5 py-px text-amber-600 dark:text-amber-400">
          P1
        </span>
        <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-surface-300">
          <span
            className={cn(
              "h-full bg-amber-500 transition-[width] duration-300",
              live && styles.stripes
            )}
            style={{ width: `${(counts.openai / total) * 100}%` }}
          />
          <span
            className={cn(
              "h-full bg-status-info/80 transition-[width] duration-300",
              live && styles.stripes
            )}
            style={{ width: `${(counts.anthropic / total) * 100}%` }}
          />
        </div>
      </div>
      {rows.map((row, index) => (
        <div key={row.name} className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-foreground">
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-cf-sm",
                index === 0 ? "bg-amber-500" : "bg-status-info"
              )}
            />
            <span className="truncate">{row.name}</span>
            <span className="text-muted-foreground">w{row.weight}</span>
          </span>
          <span className="tabular-nums text-muted-foreground">
            {t("requests", { count: row.count.toLocaleString("en-US") })}
          </span>
        </div>
      ))}
      <div className="flex items-center gap-2 border-t border-dashed border-border pt-3">
        <span className="rounded-cf-sm bg-surface-300 px-1.5 py-px text-muted-foreground">P2</span>
        <span className="truncate text-muted-foreground">azure-openai</span>
        <span className="ml-auto rounded-cf-sm border border-dashed border-border px-1.5 text-muted-foreground">
          {t("standby")}
        </span>
      </div>
    </div>
  );
}

/* ───────── 配额与并发：并发槽位 + 排队 + 消费额度 ───────── */

const SLOTS = 12;

export function QuotaVisual() {
  const t = useTranslations("landing.features.visual");
  const ref = useRef<HTMLDivElement>(null);
  const live = useLive(ref);
  const [state, setState] = useState({ inflight: 9, queued: 0, spend: 38.2 });
  useTicker(live, 520, () =>
    setState((value) => {
      const demand = Math.max(
        5,
        Math.min(SLOTS + 3, value.inflight + value.queued + Math.round((Math.random() - 0.5) * 4))
      );
      const spend = value.spend > 47.5 ? 31.4 : value.spend + Math.random() * 0.6;
      return { inflight: Math.min(SLOTS, demand), queued: Math.max(0, demand - SLOTS), spend };
    })
  );

  return (
    <div
      ref={ref}
      className={cn(PANEL, "flex flex-col gap-3 font-mono text-[11px]")}
      aria-hidden="true"
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <span>{t("concurrency")}</span>
        <span className="tabular-nums text-foreground">
          {state.inflight}/{SLOTS}
        </span>
      </div>
      <div className="grid grid-cols-12 gap-1">
        {Array.from({ length: SLOTS }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-5 rounded-cf-sm transition-colors duration-300",
              index < state.inflight
                ? state.inflight === SLOTS
                  ? "bg-status-warning"
                  : "bg-amber-500"
                : "bg-surface-300"
            )}
          />
        ))}
      </div>
      <div className="flex h-4 items-center gap-1.5 text-muted-foreground">
        <span>{t("queue")}</span>
        {Array.from({ length: state.queued }, (_, index) => (
          <span key={index} className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-warning" />
        ))}
        <span className="ml-auto tabular-nums">{state.queued}</span>
      </div>
      <div className="border-t border-dashed border-border pt-3">
        <div className="flex items-center justify-between text-muted-foreground">
          <span>{t("spend")}</span>
          <span className="tabular-nums text-foreground">
            ${state.spend.toFixed(2)} <span className="text-muted-foreground">/ $50</span>
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-300">
          <span
            className="block h-full rounded-full bg-gradient-to-r from-amber-500 to-status-warning transition-[width] duration-500"
            style={{ width: `${(state.spend / 50) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/* ───────── 按请求计费：一张会滚动的小票 ───────── */

function receipt(seed: number) {
  const input = 8000 + Math.round(((Math.sin(seed * 12.9) + 1) / 2) * 9000);
  const output = 900 + Math.round(((Math.cos(seed * 7.3) + 1) / 2) * 3200);
  const total = ((input * 2.5 + output * 10) / 1_000_000) * 1.2;
  return { input, output, total };
}

export function BillingVisual() {
  const t = useTranslations("landing.features.visual");
  const ref = useRef<HTMLDivElement>(null);
  const live = useLive(ref);
  const [seed, setSeed] = useState(1);
  const [shown, setShown] = useState(() => receipt(1).total);
  const bill = receipt(seed);
  useTicker(live, 4200, () => setSeed((value) => value + 1));

  // 总价从旧值滚动到新值。
  useEffect(() => {
    if (!live) return;
    const from = shown;
    const started = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / 900);
      const eased = 1 - (1 - progress) ** 3;
      setShown(from + (bill.total - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // 只在小票换新时滚动。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, live]);

  const lines = [
    { label: t("input"), value: `${bill.input.toLocaleString("en-US")} × $2.50/M` },
    { label: t("output"), value: `${bill.output.toLocaleString("en-US")} × $10.00/M` },
    { label: t("multiplier"), value: "× 1.20" },
  ];

  return (
    <div ref={ref} className={cn(PANEL, "font-mono text-[11px]")} aria-hidden="true">
      <div className="flex flex-col gap-2">
        {lines.map((line, index) => (
          <div
            key={`${line.label}-${seed}`}
            className={cn("flex justify-between gap-3", live && "animate-log-row-enter")}
            style={{ animationDelay: `${index * 90}ms` }}
          >
            <span className="text-muted-foreground">{line.label}</span>
            <span className="tabular-nums text-foreground">{line.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-end justify-between border-t border-dashed border-border pt-3">
        <span className="text-muted-foreground">{t("total")}</span>
        <span className="font-display text-xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
          ${(live ? shown : bill.total).toFixed(4)}
        </span>
      </div>
    </div>
  );
}

/* ───────── API Key 分发：逐项校验后放行 ───────── */

export function KeysVisual() {
  const t = useTranslations("landing.features.visual");
  const ref = useRef<HTMLDivElement>(null);
  const live = useLive(ref);
  const [step, setStep] = useState(live ? 0 : 4);
  useTicker(live, 750, () => setStep((value) => (value >= 6 ? 0 : value + 1)));
  const shownStep = live ? step : 4;

  const checks = [
    { label: t("upstreams"), value: "openai-primary, azure-openai" },
    { label: t("expiry"), value: t("expiryValue", { days: 27 }) },
    { label: t("budget"), value: "$12.40 / $50" },
  ];

  return (
    <div
      ref={ref}
      className={cn(PANEL, "flex flex-col gap-2.5 font-mono text-[11px]")}
      aria-hidden="true"
    >
      <div className="flex items-center gap-2 rounded-cf-md border border-border/70 bg-surface-200 px-2.5 py-2">
        <KeyRound className="h-3.5 w-3.5 text-amber-500" />
        <span className="text-foreground">sk-auto-••••7f3a</span>
        <span
          className={cn(
            "ml-auto rounded-cf-sm px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.08em] transition-all duration-500",
            shownStep >= 4
              ? "bg-status-success-muted text-status-success opacity-100"
              : "bg-surface-300 text-muted-foreground opacity-60"
          )}
        >
          {t("allow")}
        </span>
      </div>
      {checks.map((check, index) => {
        const passed = shownStep > index;
        return (
          <div key={check.label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-all duration-300",
                passed
                  ? "scale-100 bg-status-success text-primary-foreground"
                  : "scale-90 bg-surface-300"
              )}
            >
              {passed && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
            </span>
            <span className="text-muted-foreground">{check.label}</span>
            <span
              className={cn(
                "ml-auto truncate transition-colors duration-300",
                passed ? "text-foreground" : "text-muted-foreground/60"
              )}
            >
              {check.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ───────── 故障转移与会话亲和：一段对话的时间线 ───────── */

const TURNS = 5;
const FAIL_TURN = 3;

export function FailoverVisual() {
  const t = useTranslations("landing.features.visual");
  const ref = useRef<HTMLDivElement>(null);
  const live = useLive(ref);
  const [active, setActive] = useState(TURNS - 1);
  useTicker(live, 1100, () => setActive((value) => (value + 1) % (TURNS + 2)));
  const shown = live ? Math.min(active, TURNS - 1) : TURNS - 1;

  return (
    <div ref={ref} className={cn(PANEL, "overflow-x-auto")} aria-hidden="true">
      <ol className="relative grid min-w-[560px] grid-cols-5 gap-3 font-mono text-[11px]">
        <span className="absolute left-[10%] right-[10%] top-[15px] h-px bg-border" />
        <span
          className="absolute left-[10%] top-[15px] h-px bg-amber-500 transition-[width] duration-700 ease-cf-standard"
          style={{ width: `${(shown / (TURNS - 1)) * 80}%` }}
        />
        {Array.from({ length: TURNS }, (_, index) => {
          const reached = index <= shown;
          const failed = index === FAIL_TURN;
          const upstream = index < FAIL_TURN ? "anthropic-main" : "openai-primary";
          return (
            <li key={index} className="relative flex flex-col items-center gap-2 text-center">
              <span
                className={cn(
                  "z-10 flex h-[30px] w-[30px] items-center justify-center rounded-full border transition-all duration-500",
                  !reached && "border-border bg-surface-200 text-muted-foreground",
                  reached &&
                    !failed &&
                    "border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-400",
                  reached &&
                    failed &&
                    "border-status-warning/60 bg-status-warning-muted text-status-warning"
                )}
              >
                {failed ? <RotateCw className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              </span>
              <span className={reached ? "text-foreground" : "text-muted-foreground"}>
                {t("turn", { n: index + 1 })}
              </span>
              {failed ? (
                <span className="flex flex-col items-center gap-0.5">
                  <span className="flex items-center gap-1 text-status-error line-through decoration-status-error/60">
                    <X className="h-3 w-3" />
                    anthropic-main
                  </span>
                  <span className="text-status-success">→ {upstream}</span>
                </span>
              ) : (
                <span
                  className={cn(
                    "truncate",
                    reached ? "text-muted-foreground" : "text-muted-foreground/50"
                  )}
                >
                  {upstream}
                </span>
              )}
              <span
                className={cn(
                  "rounded-cf-sm px-1.5 py-px text-[10px] uppercase tracking-[0.06em] transition-opacity duration-500",
                  failed
                    ? "bg-status-warning-muted text-status-warning"
                    : "bg-surface-300 text-muted-foreground",
                  reached ? "opacity-100" : "opacity-0"
                )}
              >
                {failed ? t("retried") : t("pinned")}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
