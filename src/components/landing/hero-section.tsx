"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, BookOpen } from "lucide-react";

import { APP_DOCS_URL } from "@/lib/app-version";
import { Button } from "@/components/ui/button";
import { RippleLinkButton } from "@/components/landing/ripple-button";
import { HeroTerminal } from "@/components/landing/hero-terminal";

/**
 * 落地页首屏：大标题 + 副标题 + 主/次 CTA。装饰背景（amber 柔光 + 网格）由
 * 页面级连续背景统一承载，本区块不再单独贴背景，避免与下方区块出现接缝。
 * 文案、副标题、按钮依次淡入上移（animate-hero-rise + 错峰 delay）。
 */
export function HeroSection() {
  const t = useTranslations("hero");

  return (
    <section className="relative px-6 pb-20 pt-28 sm:px-8 sm:pb-28 sm:pt-36">
      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center">
        <span
          className="animate-hero-rise inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-surface-300/70 px-3.5 py-1.5 font-mono text-amber-500 type-label-small"
          style={{ animationDelay: "0ms" }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
          {t("badge")}
        </span>

        <h1
          className="animate-hero-rise mt-6 type-display-large text-foreground"
          style={{ animationDelay: "80ms" }}
        >
          {t.rich("headline", {
            hi: (chunks) => <span className="text-amber-500">{chunks}</span>,
          })}
        </h1>

        <p
          className="animate-hero-rise mt-5 max-w-2xl type-body-large text-muted-foreground"
          style={{ animationDelay: "160ms" }}
        >
          {t("subheadline")}
        </p>

        <div
          className="animate-hero-rise mt-9 flex flex-col items-center gap-3 sm:flex-row"
          style={{ animationDelay: "240ms" }}
        >
          <RippleLinkButton href="/login" className="gap-2">
            {t("ctaPrimary")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </RippleLinkButton>

          <Button asChild variant="outline" size="lg">
            <a href={APP_DOCS_URL} target="_blank" rel="noreferrer noopener" className="gap-2">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              {t("ctaSecondary")}
            </a>
          </Button>
        </div>

        <HeroTerminal />
      </div>
    </section>
  );
}
