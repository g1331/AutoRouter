"use client";

import { useTranslations } from "next-intl";
import styles from "./landing.module.css";

const EXAMPLE = `curl -X POST https://gateway.example.com/api/proxy/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'`;

/** 完整静态接入示例，不模拟请求状态或实时监测数据。 */
export function HeroTerminal() {
  const t = useTranslations("hero");
  return (
    <section className={styles.routing} data-scene-step="routing">
      <div className={styles.container}>
        <div className={styles.integration}>
          <div className={styles.integrationIntro}>
            <div className={styles.copy} data-scene-panel>
              <h2 className={`${styles.sectionTitle} font-display`}>
                <span className={styles.textBacking}>{t("terminal.title")}</span>
              </h2>
              <p>
                <span className={styles.textBacking}>{t("terminal.caption")}</span>
              </p>
            </div>
            <div className={styles.routingAnchor} data-scene-anchor="routing">
              <div
                className={`${styles.flowRail} font-mono`}
                role="group"
                aria-label={t("scene.caption")}
              >
                <span>{t("flowLabels.integration.input")}</span>
                <span>{t("flowLabels.integration.operation")}</span>
                <span>{t("flowLabels.integration.output")}</span>
              </div>
            </div>
          </div>
          <div className={styles.code} data-scene-panel>
            <div className={`${styles.codeHeader} font-mono`}>
              <span>POST</span>
              <span>/v1/chat/completions</span>
            </div>
            <pre className="font-mono" tabIndex={0} aria-label={t("terminal.exampleNote")}>
              <code>{EXAMPLE}</code>
            </pre>
            <p>
              <span className={styles.textBacking}>{t("terminal.exampleNote")}</span>
            </p>
          </div>
        </div>
        <dl className={`${styles.connectionContract} font-mono`} data-scene-panel>
          <div>
            <dt>base_url</dt>
            <dd>https://gateway.example.com/api/proxy/v1</dd>
          </div>
          <div>
            <dt>Authorization</dt>
            <dd>Bearer YOUR_API_KEY</dd>
          </div>
          <div>
            <dt>model</dt>
            <dd>gpt-4o</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
