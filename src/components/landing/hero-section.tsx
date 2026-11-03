import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, BookOpen, ChevronRight } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { APP_DOCS_URL, APP_REPOSITORY_URL, APP_VERSION_TAG } from "@/lib/app-version";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusLed } from "@/components/ui/status-led";

import styles from "./landing.module.css";
import { HeroBackdrop } from "./effects/hero-backdrop";
import { LiveConsole } from "./live-console/live-console";

const step = (i: number) => ({ "--i": i }) as CSSProperties;

export function HeroSection() {
  const t = useTranslations("landing.hero");

  return (
    <section id="live" className="relative isolate pt-28 sm:pt-40">
      <HeroBackdrop />

      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 text-center sm:px-6 lg:px-8">
        <a
          href={`${APP_REPOSITORY_URL}/releases`}
          target="_blank"
          rel="noreferrer noopener"
          style={step(0)}
          className={cn(
            styles.fadeUp,
            "group inline-flex items-center gap-2 rounded-full border border-border/70 bg-surface-200/60 py-1 pl-3 pr-2 text-xs text-muted-foreground backdrop-blur transition-colors duration-300 hover:border-amber-500/50 hover:text-foreground"
          )}
        >
          <StatusLed tone="ok" pulse />
          <span>{t("eyebrow")}</span>
          <span className="hidden h-3 w-px bg-border sm:inline" aria-hidden="true" />
          <span className="hidden font-mono text-amber-600 dark:text-amber-500 sm:inline">
            {t("release", { version: APP_VERSION_TAG })}
          </span>
          <ChevronRight
            className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </a>

        <h1 className="mt-7 font-display text-[clamp(2.75rem,7.4vw,6rem)] font-semibold leading-[1.04] tracking-[-0.025em] text-foreground">
          <span className={cn(styles.line, "[text-wrap:balance]")} style={step(0)}>
            {t("line1")}
          </span>
          <span
            className={cn(styles.line, styles.shimmer, "pb-[0.08em] [text-wrap:balance]")}
            style={step(1)}
          >
            {t("line2")}
          </span>
        </h1>

        <p
          className={cn(
            styles.fadeUp,
            "mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
          )}
          style={step(2)}
        >
          {t("description")}
        </p>

        <div
          className={cn(styles.fadeUp, "mt-9 flex flex-wrap justify-center gap-3")}
          style={step(3)}
        >
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
          <Button asChild size="lg" variant="outline" className="bg-surface-200/50 backdrop-blur">
            <a href={APP_DOCS_URL} target="_blank" rel="noreferrer noopener">
              <BookOpen aria-hidden="true" />
              {t("secondary")}
            </a>
          </Button>
        </div>

        <p
          className={cn(
            styles.fadeUp,
            "mt-14 max-w-xl text-xs leading-relaxed text-muted-foreground sm:mt-16"
          )}
          style={step(4)}
        >
          {t("demoHint")}
        </p>
      </div>

      <div className="mx-auto mt-6 w-full max-w-6xl px-3 pb-8 sm:px-6 lg:px-8">
        <div className={styles.stage}>
          <div className={styles.halo} aria-hidden="true" />
          <div className={styles.tilt}>
            <div className={cn(styles.consoleIn, "relative")}>
              <span className={styles.horizon} aria-hidden="true" />
              <LiveConsole />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
