import { useTranslations } from "next-intl";
import { BookOpen, Github } from "lucide-react";

import { APP_DOCS_URL, APP_REPOSITORY_URL, APP_VERSION_TAG } from "@/lib/app-version";

import styles from "./landing.module.css";
import { ClientsMarquee } from "./clients-marquee";
import { ConnectSection } from "./connect-section";
import { FeatureSection } from "./feature-section";
import { HeroSection } from "./hero-section";
import { LandingAuthGate } from "./landing-auth-gate";
import { LandingHeader } from "./landing-header";
import { StartSection } from "./start-section";

/** 公开首页：一段活的故障转移演示开场，随后是接入方式与能力说明，视觉沿用控制台令牌。 */
export function LandingPage() {
  const t = useTranslations("landing");

  return (
    <LandingAuthGate>
      <div className={`${styles.root} flex min-h-dvh flex-col overflow-x-clip`}>
        <LandingHeader />

        <main className="flex flex-1 flex-col gap-24 pb-24 sm:gap-32 sm:pb-32">
          <HeroSection />
          <ClientsMarquee />
          <ConnectSection />
          <FeatureSection />
          <StartSection />
        </main>

        <footer className="border-t border-divider">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <p>
              <span className="text-foreground">{t("footer.tagline")}</span>
              <span className="mx-2" aria-hidden="true">
                ·
              </span>
              <span className="font-mono">{APP_VERSION_TAG}</span>
            </p>
            <div className="flex items-center gap-4">
              <a
                href={APP_DOCS_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                {t("nav.docs")}
              </a>
              <a
                href={APP_REPOSITORY_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
              >
                <Github className="h-3.5 w-3.5" aria-hidden="true" />
                {t("nav.github")}
              </a>
            </div>
          </div>
        </footer>
      </div>
    </LandingAuthGate>
  );
}
