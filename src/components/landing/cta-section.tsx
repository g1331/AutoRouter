"use client";

import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";

import { RippleLinkButton } from "@/components/landing/ripple-button";

/**
 * 落地页底部行动召唤区：amber glow 卡片，再次引导进入控制台。
 */
export function CtaSection() {
  const t = useTranslations("hero");

  return (
    <section className="relative px-6 pb-24 pt-4 sm:px-8">
      <div className="relative mx-auto max-w-3xl overflow-hidden rounded-cf-md border border-amber-500/30 bg-surface-300/70 px-6 py-12 text-center shadow-cf-glow-medium sm:px-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          aria-hidden="true"
          style={{
            backgroundImage:
              "radial-gradient(circle at 50% 120%, color-mix(in srgb, var(--vr-accent-500) 20%, transparent), transparent 60%)",
          }}
        />
        <div className="relative z-10 flex flex-col items-center">
          <h2 className="type-display-small text-foreground">{t("cta.title")}</h2>
          <p className="mt-3 max-w-xl type-body-medium text-muted-foreground">{t("cta.desc")}</p>
          <div className="mt-8">
            <RippleLinkButton href="/login" className="gap-2">
              {t("cta.button")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </RippleLinkButton>
          </div>
        </div>
      </div>
    </section>
  );
}
