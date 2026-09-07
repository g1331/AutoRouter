"use client";

import { useTranslations } from "next-intl";
import styles from "./landing.module.css";

const FEATURES = ["routing", "balancing", "quota", "billing", "keys", "failover"] as const;

/** 六个独立章节以不同的信息结构解释同一条请求的调度过程。 */
export function FeatureSection() {
  const t = useTranslations("hero");
  return (
    <section className={styles.capabilities}>
      <div className={`${styles.capabilitiesHeader} ${styles.container}`}>
        <h2 className={`${styles.sectionTitle} font-display`}>
          <span className={styles.textBacking}>{t("features.title")}</span>
        </h2>
        <p className={styles.featuresIntro}>
          <span className={styles.textBacking}>{t("features.subtitle")}</span>
        </p>
      </div>
      <ol className={styles.features}>
        {FEATURES.map((key, index) => (
          <li
            key={key}
            id={`capability-${key}`}
            className={styles.chapter}
            data-chapter={key}
            data-scene-step={`capability-${key}`}
          >
            <div className={styles.chapterInner}>
              <div className={styles.chapterMeta} data-scene-panel>
                <span className={styles.chapterIndex} aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={styles.chapterEyebrow}>{t(`chapters.${key}.eyebrow`)}</span>
              </div>
              <header className={styles.chapterHeader} data-scene-panel>
                <h3 className="font-display">{t(`features.${key}.title`)}</h3>
                <p>{t(`features.${key}.desc`)}</p>
              </header>
              <div className={styles.chapterStage}>
                <div className={styles.featureAnchor} data-scene-anchor={`capability-${key}`}>
                  <div
                    className={`${styles.flowRail} font-mono`}
                    role="group"
                    aria-label={t("scene.caption")}
                  >
                    <span>{t(`flowLabels.${key}.input`)}</span>
                    <span>{t(`flowLabels.${key}.operation`)}</span>
                    <span>{t(`flowLabels.${key}.output`)}</span>
                  </div>
                </div>
              </div>
              <div className={styles.chapterDetails} data-scene-panel>
                {key === "routing" && (
                  <dl className={styles.protocolMap} aria-label={t("chapters.routing.label")}>
                    {(
                      [
                        ["chat", "/v1/chat/completions"],
                        ["responses", "/v1/responses"],
                        ["messages", "/v1/messages"],
                      ] as const
                    ).map(([protocol, path]) => (
                      <div className={styles.protocolRow} key={protocol}>
                        <dt>
                          <code>{path}</code>
                        </dt>
                        <dd>{t(`chapters.routing.${protocol}`)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {key === "balancing" && (
                  <ol className={styles.policyStack} aria-label={t("chapters.balancing.label")}>
                    {(["health", "priority", "weight"] as const).map((rule, ruleIndex) => (
                      <li className={styles.policyRule} key={rule}>
                        <span aria-hidden="true">{String(ruleIndex + 1).padStart(2, "0")}</span>
                        <div>
                          <h4>{t(`chapters.balancing.${rule}.title`)}</h4>
                          <p>{t(`chapters.balancing.${rule}.desc`)}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
                {key === "quota" && (
                  <dl className={styles.quotaBands} aria-label={t("chapters.quota.label")}>
                    {(["spending", "concurrency", "queue"] as const).map((rule) => (
                      <div className={styles.quotaBand} key={rule}>
                        <dt>{t(`chapters.quota.${rule}.title`)}</dt>
                        <dd>{t(`chapters.quota.${rule}.desc`)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {key === "billing" && (
                  <div className={styles.ledger}>
                    <p className={styles.ledgerEquation}>
                      <span>{t("chapters.billing.usage")}</span>
                      <span>×</span>
                      <span>{t("chapters.billing.price")}</span>
                      <span>×</span>
                      <span>{t("chapters.billing.multiplier.title")}</span>
                      <span>→</span>
                      <strong>{t("chapters.billing.snapshot")}</strong>
                    </p>
                    <dl aria-label={t("chapters.billing.label")}>
                      {(["base", "override", "multiplier"] as const).map((rule) => (
                        <div className={styles.ledgerRow} key={rule}>
                          <dt>{t(`chapters.billing.${rule}.title`)}</dt>
                          <dd>{t(`chapters.billing.${rule}.desc`)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
                {key === "keys" && (
                  <dl className={styles.permissionList} aria-label={t("chapters.keys.label")}>
                    {(["scope", "upstreams", "capability"] as const).map((rule, ruleIndex) => (
                      <div className={styles.permissionRule} key={rule}>
                        <dt>
                          {ruleIndex > 0 && <span aria-hidden="true">∩ </span>}
                          {t(`chapters.keys.${rule}.title`)}
                        </dt>
                        <dd>{t(`chapters.keys.${rule}.desc`)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {key === "failover" && (
                  <ol className={styles.recoverySequence} aria-label={t("chapters.failover.label")}>
                    {(["failure", "exclude", "retry"] as const).map((step, stepIndex) => (
                      <li className={styles.recoveryStep} key={step}>
                        <span aria-hidden="true">{String(stepIndex + 1).padStart(2, "0")}</span>
                        <h4>{t(`chapters.failover.${step}.title`)}</h4>
                        <p>{t(`chapters.failover.${step}.desc`)}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <footer className={styles.chapterFooter} data-scene-panel>
                <p>{t(`chapters.${key}.takeaway`)}</p>
                <p className={styles.chapterNote}>{t("scene.caption")}</p>
              </footer>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
