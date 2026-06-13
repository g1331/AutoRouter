"use client";

import { useTranslations } from "next-intl";

/**
 * Hero 产品视觉：模拟终端卡片，演示「改一行 base URL，即可接管全部上游」。
 * 卡片内为一段 curl 请求 + 网关路由结果条，一行内体现路由命中 / 负载均衡 /
 * 延迟 / 计费这几项核心价值。终端内的命令与日志保留原文（CLI / 日志惯例），
 * 仅卡片下方的说明文案走 i18n。
 */
export function HeroTerminal() {
  const t = useTranslations("hero");

  return (
    <div
      className="animate-hero-rise mx-auto mt-14 w-full max-w-2xl"
      style={{ animationDelay: "340ms" }}
    >
      {/* 卡片自带 shadow-cf-glow-medium 边缘辉光即可立住，不再叠加背景光池，
          避免与页面顶部主光源之间形成「暗谷→亮带」的断层。 */}
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

        {/* 请求：drop-in 的 OpenAI 兼容调用，仅改 base URL 指向网关 */}
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
      </div>

      <p className="mt-4 text-center type-body-small text-muted-foreground">
        {t("terminal.caption")}
      </p>
    </div>
  );
}
