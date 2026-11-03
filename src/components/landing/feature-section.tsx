import type { ComponentType } from "react";
import { useTranslations } from "next-intl";
import {
  Activity,
  Gauge,
  KeyRound,
  LayoutGrid,
  ReceiptText,
  RefreshCcw,
  Route,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { IconBox } from "@/components/ui/icon-box";

import { Reveal } from "./effects/reveal";
import { SpotlightCard } from "./effects/spotlight-card";
import {
  BalancingVisual,
  BillingVisual,
  FailoverVisual,
  KeysVisual,
  QuotaVisual,
  RoutingVisual,
} from "./feature-visuals";

type FeatureKey = "routing" | "balancing" | "quota" | "billing" | "keys" | "failover";
type FeatureTone = "amber" | "success" | "warning" | "info" | "error";

/** 不等宽的格子：路由与故障转移占宽格，其余三列并排。 */
const FEATURES: {
  key: FeatureKey;
  icon: LucideIcon;
  tone: FeatureTone;
  span: string;
  Visual: ComponentType;
}[] = [
  { key: "routing", icon: Route, tone: "amber", span: "lg:col-span-4", Visual: RoutingVisual },
  { key: "keys", icon: KeyRound, tone: "info", span: "lg:col-span-2", Visual: KeysVisual },
  {
    key: "balancing",
    icon: Activity,
    tone: "success",
    span: "lg:col-span-2",
    Visual: BalancingVisual,
  },
  { key: "quota", icon: Gauge, tone: "warning", span: "lg:col-span-2", Visual: QuotaVisual },
  {
    key: "billing",
    icon: ReceiptText,
    tone: "amber",
    span: "lg:col-span-2",
    Visual: BillingVisual,
  },
  {
    key: "failover",
    icon: RefreshCcw,
    tone: "error",
    span: "lg:col-span-6",
    Visual: FailoverVisual,
  },
];

export function FeatureSection() {
  const t = useTranslations("landing.features");

  return (
    <section id="features" aria-labelledby="landing-features-title" className="scroll-mt-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="type-label inline-flex items-center gap-2 text-amber-600 dark:text-amber-500">
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
            {t("label")}
          </p>
          <h2
            id="landing-features-title"
            className="mt-3 font-display text-3xl font-semibold leading-tight tracking-[-0.015em] text-foreground sm:text-4xl"
          >
            {t("title")}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{t("description")}</p>
        </Reveal>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {FEATURES.map(({ key, icon: Icon, tone, span, Visual }, index) => (
            <li
              key={key}
              className={cn(
                "min-w-0",
                span,
                (key === "routing" || key === "failover") && "sm:col-span-2"
              )}
            >
              <Reveal delay={(index % 3) * 90} className="h-full">
                <SpotlightCard className="flex h-full flex-col gap-4 rounded-cf-md border border-border/70 bg-surface-200/80 p-5 transition-colors duration-500 hover:border-border">
                  <div className="flex items-start gap-3">
                    <IconBox size="md" tone={tone}>
                      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                    </IconBox>
                    <div className="min-w-0">
                      <h3 className="type-title-medium text-foreground">{t(`${key}.title`)}</h3>
                      <p className="type-body-small mt-1 text-muted-foreground">
                        {t(`${key}.desc`)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-auto">
                    <Visual />
                  </div>
                </SpotlightCard>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
