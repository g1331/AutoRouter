"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, BookOpen } from "lucide-react";

import { APP_REPOSITORY_URL } from "@/lib/app-version";
import { Button } from "@/components/ui/button";
import { RippleLinkButton } from "@/components/landing/ripple-button";

/**
 * 落地页首屏：amber 渐变光晕 + 网格底纹背景，大标题 + 副标题 + 主/次 CTA。
 * 文案、副标题、按钮依次淡入上移（animate-hero-rise + 错峰 delay）。
 */
export function HeroSection() {
  const t = useTranslations("hero");

  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-28 sm:px-8 sm:pb-28 sm:pt-36">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        aria-hidden="true"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 0%, rgba(201,157,82,0.18), transparent 52%), radial-gradient(circle at 82% 12%, rgba(89,111,131,0.14), transparent 40%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 opacity-30" aria-hidden="true">
        <div className="h-full w-full [background-image:linear-gradient(to_right,rgba(134,146,158,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(134,146,158,0.08)_1px,transparent_1px)] [background-size:44px_44px]" />
      </div>

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
          {t("headline")}
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
            <a
              href={APP_REPOSITORY_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="gap-2"
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              {t("ctaSecondary")}
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
