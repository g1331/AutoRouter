"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, BookOpen } from "lucide-react";
import { APP_DOCS_URL } from "@/lib/app-version";
import { Button } from "@/components/ui/button";
import { RippleLinkButton } from "@/components/landing/ripple-button";
import styles from "./landing.module.css";

const CHAPTERS = ["routing", "balancing", "quota", "billing", "keys", "failover"] as const;

/** 海报式首屏：固定文案与共享路由雕塑的首个停靠槽。 */
export function HeroSection() {
  const t = useTranslations("hero");
  return (
    <section className={`${styles.container} ${styles.hero}`} data-scene-step="hero">
      <div className={styles.copy} data-scene-panel>
        <span className={`${styles.badge} font-mono`}>{t("badge")}</span>
        <h1 className={`${styles.headline} font-display`}>
          <span className={styles.textBacking}>
            {t.rich("headline", {
              hi: (chunks) => (
                <span className={styles.highlight}>
                  <span className={styles.textBacking}>{chunks}</span>
                </span>
              ),
            })}
          </span>
        </h1>
        <p className={styles.description}>
          <span className={styles.textBacking}>{t("subheadline")}</span>
        </p>
        <div className={styles.actions}>
          <RippleLinkButton href="/login" className={styles.primary}>
            {t("ctaPrimary")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </RippleLinkButton>
          <Button asChild variant="outline" size="lg">
            <a
              href={APP_DOCS_URL}
              target="_blank"
              rel="noreferrer noopener"
              className={styles.secondary}
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              {t("ctaSecondary")}
            </a>
          </Button>
        </div>
      </div>
      <div className={styles.heroDock}>
        <div className={`${styles.heroLegend} font-mono`} data-scene-panel>
          <span>{t("bookends.eyebrow")}</span>
          <span>API / GATEWAY</span>
        </div>
        <div className={styles.heroAnchor} data-scene-anchor="hero">
          <div
            className={`${styles.flowRail} font-mono`}
            role="group"
            aria-label={t("scene.caption")}
          >
            <span>{t("flowLabels.hero.input")}</span>
            <span>{t("flowLabels.hero.operation")}</span>
            <span>{t("flowLabels.hero.output")}</span>
          </div>
        </div>
        <div className={`${styles.protocolLegend} font-mono`} data-scene-panel>
          <span>{t("bookends.protocols")}</span>
          <span>OpenAI</span>
          <span>Anthropic</span>
        </div>
        <p className={`${styles.caption} font-mono`}>{t("scene.caption")}</p>
        <p className="sr-only">{t("scene.description")}</p>
      </div>
      <nav className={styles.heroIndex} aria-label={t("features.title")} data-scene-panel>
        {CHAPTERS.map((key, index) => (
          <a key={key} href={`#capability-${key}`}>
            <span className="font-mono">{String(index + 1).padStart(2, "0")}</span>
            <span>{t(`features.${key}.title`)}</span>
            <ArrowRight size={14} aria-hidden="true" />
          </a>
        ))}
      </nav>
    </section>
  );
}
