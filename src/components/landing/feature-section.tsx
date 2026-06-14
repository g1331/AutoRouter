"use client";

import { useTranslations } from "next-intl";

import { Card } from "@/components/ui/card";
import { CapabilityAnimation } from "@/components/landing/capability-animations";

const FEATURES = ["routing", "balancing", "quota", "billing", "keys", "failover"] as const;

/**
 * 核心能力卡片网格。每张卡片顶部是该能力的专属微动画（替代原静态图标），下方为
 * 标题 + 描述。卡片整体错峰播放 vr-log-card-enter 进场动画，reduced-motion 时
 * 由全局规则压成即时显示。
 */
export function FeatureSection() {
  const t = useTranslations("hero");

  return (
    <section className="relative px-6 py-20 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="type-display-small text-foreground">{t("features.title")}</h2>
          <p className="mt-3 type-body-medium text-muted-foreground">{t("features.subtitle")}</p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((key, index) => (
            <Card
              key={key}
              variant="filled"
              className="animate-log-card-enter overflow-hidden p-0 hover:border-amber-400/35 hover:shadow-cf-glow-subtle"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <CapabilityAnimation kind={key} />
              <div className="p-6">
                <h3 className="type-title-large text-foreground">{t(`features.${key}.title`)}</h3>
                <p className="mt-2 type-body-small text-muted-foreground">
                  {t(`features.${key}.desc`)}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
