"use client";

import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { RippleLinkButton } from "@/components/landing/ripple-button";
import styles from "./landing.module.css";

/** 橙色行动区承接同一个雕塑，保留本地化登录入口。 */
export function CtaSection() {
  const t = useTranslations("hero");
  return (
    <section className={styles.cta} data-scene-step="cta">
      <div className={`${styles.container} ${styles.closing}`}>
        <div className={`${styles.closingStatement} font-display`} data-scene-panel>
          {t("bookends.closing")}
        </div>
        <div className={styles.copy} data-scene-panel>
          <h2 className={`${styles.sectionTitle} font-display`}>
            <span className={styles.textBacking}>{t("cta.title")}</span>
          </h2>
          <p>
            <span className={styles.textBacking}>{t("cta.desc")}</span>
          </p>
          <RippleLinkButton href="/login" className={styles.primary}>
            {t("cta.button")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </RippleLinkButton>
        </div>
        <div className={styles.ctaArt}>
          <div className={styles.ctaAnchor} data-scene-anchor="cta" />
          <div className={`${styles.wordmark} font-display`} aria-hidden="true" data-scene-panel>
            AUTO ROUTER
          </div>
        </div>
        <ol className={`${styles.closingSteps} font-mono`} data-scene-panel>
          {(["setup", "issueKey", "send"] as const).map((key, index) => (
            <li key={key}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {t(`bookends.${key}`)}
              <ArrowRight size={18} aria-hidden="true" />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
