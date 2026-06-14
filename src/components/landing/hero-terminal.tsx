"use client";

import { useTranslations } from "next-intl";

/**
 * Hero 产品视觉：升级版「活终端」。在原终端卡片基础上加入会动的元素，让它显得
 * 像一个正在跑流量的实时控制台：命令末尾闪烁光标、底部一条会跳动的
 * 实时指标带（LIVE 呼吸点 + sparkline）。终端内的命令与日志保留原文（CLI / 日志
 * 惯例），仅卡片下方说明走 i18n。全部动效为纯 CSS，reduced-motion 时由全局规则
 * 自动压成静止，静态终端仍完整可读。
 */

// 实时指标带的 sparkline 柱高（0~1），跳动相位由 index 错峰
const SPARK = [0.45, 0.7, 0.5, 0.92, 0.6, 1, 0.55, 0.82, 0.42, 0.95, 0.62, 0.78];

export function HeroTerminal() {
  const t = useTranslations("hero");

  return (
    <div
      className="animate-hero-rise mx-auto mt-14 w-full max-w-2xl"
      style={{ animationDelay: "340ms" }}
    >
      <div className="overflow-hidden rounded-cf-md border border-border/70 bg-surface-300/80 text-left shadow-cf-glow-medium backdrop-blur-sm">
        {/* 窗口头：三色点 + 文件名 + 状态徽标 */}
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" aria-hidden="true" />
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" aria-hidden="true" />
          <span className="ml-2 font-mono text-xs text-muted-foreground">request.sh</span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] text-amber-500">
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500"
              aria-hidden="true"
            />
            200 OK
          </span>
        </div>

        {/* 请求：drop-in 的 OpenAI 兼容调用，仅改 base URL 指向网关；末尾闪烁光标 */}
        <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-relaxed">
          <code>
            <span className="text-muted-foreground">$ </span>
            <span className="text-foreground">curl</span>
            <span className="text-amber-500">
              {" https://gateway.example.com/api/proxy/v1/chat/completions"}
            </span>
            {" \\\n    "}
            <span className="text-muted-foreground">-H</span>
            <span className="text-amber-500/90">{' "Authorization: Bearer sk-ar-••••••"'}</span>
            {" \\\n    "}
            <span className="text-muted-foreground">-d</span>
            <span className="text-foreground/80">{" '{ "}</span>
            <span className="text-amber-500">{'"model"'}</span>
            <span className="text-foreground/60">{": "}</span>
            <span className="text-amber-500">{'"gpt-4o"'}</span>
            <span className="text-foreground/60">{", "}</span>
            <span className="text-amber-500">{'"stream"'}</span>
            <span className="text-foreground/60">{": "}</span>
            <span className="text-foreground">true</span>
            <span className="text-foreground/80">{" }'"}</span>
            <span
              className="ml-1 inline-block h-3.5 w-[7px] translate-y-[2px] animate-pulse rounded-[1px] bg-amber-500 align-middle"
              aria-hidden="true"
            />
          </code>
        </pre>

        {/* 路由结果条：一行内体现 路由命中 / 负载均衡 / 延迟 / 计费 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 px-4 py-3 font-mono text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 text-amber-500">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
            routed
          </span>
          <span className="text-foreground/80">→ upstream-azure-02</span>
          <span className="text-muted-foreground/40" aria-hidden="true">
            ·
          </span>
          <span>load-balanced</span>
          <span className="text-muted-foreground/40" aria-hidden="true">
            ·
          </span>
          <span>23&nbsp;ms</span>
          <span className="text-muted-foreground/40" aria-hidden="true">
            ·
          </span>
          <span>$0.0021 billed</span>
        </div>

        {/* 实时指标带（升级点）：LIVE 呼吸点 + 实时数字 + 跳动 sparkline */}
        <div className="flex items-center gap-2.5 border-t border-border/60 px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 text-amber-500">
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500"
              aria-hidden="true"
            />
            LIVE
          </span>
          <span className="text-foreground/80 tabular-nums">1,284</span>
          <span>req/min</span>
          <span className="text-muted-foreground/40" aria-hidden="true">
            ·
          </span>
          <span className="text-foreground/80 tabular-nums">6/6</span>
          <span>healthy</span>
          <span className="text-muted-foreground/40" aria-hidden="true">
            ·
          </span>
          <span className="text-foreground/80 tabular-nums">41</span>
          <span>ms&nbsp;p50</span>
          <span className="ml-auto flex h-4 items-end gap-[2px]" aria-hidden="true">
            {SPARK.map((h, i) => (
              <span
                key={i}
                className="animate-spark block w-[2px] rounded-full bg-amber-500/70"
                style={{ height: `${Math.round(h * 100)}%`, animationDelay: `${i * 90}ms` }}
              />
            ))}
          </span>
        </div>
      </div>

      <p className="mt-4 text-center type-body-small text-muted-foreground">
        {t("terminal.caption")}
      </p>
    </div>
  );
}
