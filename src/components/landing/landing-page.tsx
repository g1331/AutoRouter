"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { HeroSection } from "@/components/landing/hero-section";
import { FeatureSection } from "@/components/landing/feature-section";
import { CtaSection } from "@/components/landing/cta-section";
import styles from "./landing.module.css";
import { RouteScene } from "./route-scene";
import { HeroTerminal } from "./hero-terminal";

/** 公开首页保留已登录角色跳转，品牌样式仅在当前页面生效。 */
export function LandingPage() {
  const t = useTranslations("hero");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { token, principal } = useAuth();

  // 已登录则按角色跳转，避免门面页打断既有会话。
  React.useEffect(() => {
    if (token && principal) {
      router.replace(principal.role === "member" ? "/portal" : "/dashboard");
    }
  }, [token, principal, router]);

  // 已登录主体在跳转前不渲染落地内容，避免门面页一闪。
  if (token && principal) {
    return null;
  }

  return (
    <div className={styles.page}>
      <header className={`${styles.container} ${styles.header}`}>
        <span className={`${styles.brand} font-mono`}>{tCommon("appName")}</span>
        <div className={styles.nav}>
          <React.Suspense>
            <LanguageSwitcher compact />
          </React.Suspense>
          <ThemeToggle />
          <Button asChild variant="secondary" size="sm">
            <Link href="/login">{t("nav.login")}</Link>
          </Button>
        </div>
      </header>

      <main className={styles.main}>
        <RouteScene />
        <HeroSection />
        <HeroTerminal />
        <FeatureSection />
        <CtaSection />
      </main>
    </div>
  );
}
