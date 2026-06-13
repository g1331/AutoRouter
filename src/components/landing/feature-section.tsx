"use client";

import { useTranslations } from "next-intl";
import { Gauge, KeyRound, Receipt, RefreshCw, Route, Scale } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";

const FEATURES: { key: string; Icon: LucideIcon }[] = [
  { key: "routing", Icon: Route },
  { key: "balancing", Icon: Scale },
  { key: "quota", Icon: Gauge },
  { key: "billing", Icon: Receipt },
  { key: "keys", Icon: KeyRound },
  { key: "failover", Icon: RefreshCw },
];

/**
 * 核心能力卡片网格。每张卡片错峰播放 vr-log-card-enter 进场动画，
 * reduced-motion 时由全局规则压成即时显示。
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
          {FEATURES.map(({ key, Icon }, index) => (
            <Card
              key={key}
              variant="filled"
              className="animate-log-card-enter p-6 hover:border-amber-400/35 hover:shadow-cf-glow-subtle"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-cf-md border border-amber-500/30 bg-amber-500/10 text-amber-500">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 type-title-large text-foreground">
                {t(`features.${key}.title`)}
              </h3>
              <p className="mt-2 type-body-small text-muted-foreground">
                {t(`features.${key}.desc`)}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
