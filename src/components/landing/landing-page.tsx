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

/**
 * 公开落地页（根路径 /）。已登录用户按角色跳回工作台，未登录访客看到
 * Hero + 核心能力 + 底部 CTA。鼠标跟随光斑通过更新 CSS 变量实现，
 * 尊重 prefers-reduced-motion。
 */
export function LandingPage() {
  const t = useTranslations("hero");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { token, principal } = useAuth();
  const spotlightRef = React.useRef<HTMLDivElement>(null);

  // 已登录则按角色跳转，避免门面页打断既有会话。
  React.useEffect(() => {
    if (token && principal) {
      router.replace(principal.role === "member" ? "/portal" : "/dashboard");
    }
  }, [token, principal, router]);

  // 鼠标跟随光斑：直接写 CSS 变量，避免逐帧 re-render；reduced-motion 时不绑定。
  React.useEffect(() => {
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const handleMove = (event: PointerEvent) => {
      const node = spotlightRef.current;
      if (!node) return;
      node.style.setProperty("--spotlight-x", `${event.clientX}px`);
      node.style.setProperty("--spotlight-y", `${event.clientY}px`);
    };
    window.addEventListener("pointermove", handleMove);
    return () => window.removeEventListener("pointermove", handleMove);
  }, []);

  // 已登录主体在跳转前不渲染落地内容，避免门面页一闪。
  if (token && principal) {
    return null;
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      <div
        ref={spotlightRef}
        className="pointer-events-none fixed inset-0 z-0 hidden md:block"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(420px circle at var(--spotlight-x, 50%) var(--spotlight-y, -10%), rgba(201,157,82,0.1), transparent 70%)",
        }}
      />

      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-6 py-5 sm:px-8">
        <span className="font-mono text-sm font-semibold tracking-wide text-foreground">
          {tCommon("appName")}
        </span>
        <div className="flex items-center gap-2">
          <LanguageSwitcher compact />
          <ThemeToggle />
          <Button asChild variant="secondary" size="sm">
            <Link href="/login">{t("nav.login")}</Link>
          </Button>
        </div>
      </header>

      <main className="relative z-10">
        <HeroSection />
        <FeatureSection />
        <CtaSection />
      </main>
    </div>
  );
}
