import { useTranslations } from "next-intl";
import { ArrowRight, BookOpen, Rocket } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { APP_DOCS_URL } from "@/lib/app-version";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import styles from "./landing.module.css";
import { Reveal } from "./effects/reveal";

const STEPS = ["upstream", "key", "request"] as const;

/** 收尾：一张边框上有光束巡游的大卡片，承接登录与部署文档。 */
export function StartSection() {
  const t = useTranslations("landing.start");

  return (
    <section aria-labelledby="landing-start-title">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div
            className={cn(
              styles.beam,
              "relative overflow-hidden rounded-cf-md border border-border/60 bg-surface-200/80 px-6 py-14 text-center sm:px-12 sm:py-20"
            )}
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
              <div className="absolute left-1/2 top-0 h-64 w-[80%] -translate-x-1/2 rounded-full bg-amber-500/15 blur-3xl" />
              <div className="absolute inset-0 [background-image:radial-gradient(circle_at_1px_1px,var(--vr-grid-dot)_1px,transparent_0)] [background-size:24px_24px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000,transparent)]" />
            </div>

            <p className="type-label inline-flex items-center gap-2 text-amber-600 dark:text-amber-500">
              <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
              {t("label")}
            </p>
            <h2
              id="landing-start-title"
              className="mx-auto mt-4 max-w-3xl font-display text-3xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-5xl"
            >
              {t("title")}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
              {t("description")}
            </p>

            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Button
                asChild
                size="lg"
                className="group shadow-[0_0_0_1px_var(--vr-accent-line),0_10px_34px_-8px_color-mix(in_srgb,var(--vr-accent-500)_65%,transparent)]"
              >
                <Link href="/login">
                  {t("primary")}
                  <ArrowRight
                    className="transition-transform duration-300 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href={APP_DOCS_URL} target="_blank" rel="noreferrer noopener">
                  <BookOpen aria-hidden="true" />
                  {t("secondary")}
                </a>
              </Button>
            </div>

            <ol className="mx-auto mt-12 grid max-w-3xl gap-6 text-left sm:grid-cols-3 sm:gap-4">
              {STEPS.map((step, index) => (
                <li
                  key={step}
                  className="relative flex gap-3 sm:flex-col sm:items-center sm:text-center"
                >
                  {index < STEPS.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute left-[calc(50%+28px)] right-[calc(-50%+28px)] top-4 hidden h-px bg-gradient-to-r from-amber-500/60 to-border sm:block"
                    />
                  )}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-500/50 bg-amber-500/10 font-mono text-xs text-amber-600 dark:text-amber-400">
                    {index + 1}
                  </span>
                  <span>
                    <span className="type-title-small block text-foreground">
                      {t(`${step}.title`)}
                    </span>
                    <span className="type-body-small block text-muted-foreground">
                      {t(`${step}.desc`)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
