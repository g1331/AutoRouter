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
 * Hero + 核心能力 + 底部 CTA。装饰背景为整页一层连续的 amber 柔光 + 渐隐
 * 网格，避免分段接缝。
 */
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
    <div className="relative min-h-dvh overflow-hidden bg-background">
      {/* 整页装饰背景：顶部 amber 柔光（椭圆向下自然渐隐）+ 整页网格（遮罩
          向下渐隐），整页一层连续，避免 section 之间出现硬切接缝。 */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <div
          className="absolute inset-x-0 top-0 h-[760px]"
          style={{
            background:
              "radial-gradient(1100px 560px at 50% -180px, var(--vr-atmo), transparent 72%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(to_right,var(--vr-grid-dot)_1px,transparent_1px),linear-gradient(to_bottom,var(--vr-grid-dot)_1px,transparent_1px)] [background-size:44px_44px]"
          style={{
            maskImage: "linear-gradient(to bottom, black, transparent 72%)",
            WebkitMaskImage: "linear-gradient(to bottom, black, transparent 72%)",
          }}
        />
      </div>

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
