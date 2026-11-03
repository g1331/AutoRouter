"use client";

import { Suspense, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { APP_DOCS_URL } from "@/lib/app-version";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";

const SECTIONS = ["live", "connect", "features"] as const;

/** 与控制台侧栏一致的品牌块：闪电图标 + 应用名。 */
function Brand() {
  const tCommon = useTranslations("common");
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-cf-md">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-cf-md bg-amber-500/12 text-amber-500">
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2.3}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </span>
      <span className="type-label-large text-foreground">{tCommon("appName")}</span>
    </Link>
  );
}

/** 顶栏：页首透明融入背景，滚动后变为毛玻璃并显出分隔线。 */
export function LandingHeader() {
  const t = useTranslations("landing.nav");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 border-b transition-[background-color,border-color,backdrop-filter] duration-500",
        scrolled
          ? "border-divider bg-background/70 backdrop-blur-xl backdrop-saturate-150"
          : "border-transparent bg-transparent"
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 md:grid md:grid-cols-[1fr_auto_1fr] lg:px-8">
        <Brand />
        <nav className="hidden items-center gap-1 md:flex">
          {SECTIONS.map((section) => (
            <a
              key={section}
              href={`#${section}`}
              className="rounded-full px-3.5 py-1.5 text-sm text-muted-foreground transition-colors duration-300 hover:bg-surface-300/60 hover:text-foreground"
            >
              {t(section)}
            </a>
          ))}
          <a
            href={APP_DOCS_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-full px-3.5 py-1.5 text-sm text-muted-foreground transition-colors duration-300 hover:bg-surface-300/60 hover:text-foreground"
          >
            {t("docs")}
          </a>
        </nav>
        <div className="flex items-center justify-end gap-1 sm:gap-2">
          <Suspense>
            <LanguageSwitcher compact />
          </Suspense>
          <ThemeToggle />
          <Button asChild size="sm" className="ml-1">
            <Link href="/login">{t("login")}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
