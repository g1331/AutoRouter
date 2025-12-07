"use client";

import * as React from "react";
import { Moon, Sun, Monitor, Check } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Cassette Futurism Theme Toggle
 *
 * Features:
 * - CRT-style button with scanline shimmer effect
 * - Light/Dark/System theme options with radio group for accessibility
 * - CRT power-cycle animation on theme switch
 * - Respects prefers-reduced-motion
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);
  const t = useTranslations("theme");

  // Avoid hydration mismatch and detect reduced-motion preference
  React.useEffect(() => {
    setMounted(true);
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Handle theme change with CRT animation
  const handleThemeChange = (nextTheme: string) => {
    if (!prefersReducedMotion) {
      document.documentElement.classList.add("theme-switching");

      setTimeout(() => {
        document.documentElement.classList.remove("theme-switching");
      }, 650);
    }

    setTheme(nextTheme);
  };

  // Skeleton button during SSR
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9 overflow-hidden border border-amber-500/50 bg-surface-300"
      >
        <Sun className="h-4 w-4 text-amber-500" />
        <span className="sr-only">{t("toggle")}</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="group relative h-9 w-9 overflow-hidden border border-amber-500/60 bg-surface-300 text-amber-500 transition-all duration-200 hover:border-amber-500 hover:shadow-[0_0_12px_rgba(255,191,0,0.3)]"
          aria-label={t("toggle")}
        >
          {/* Scanline effect overlay */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          >
            <span
              className="absolute inset-x-0 h-[200%] animate-[cf-toggle-scanline_2s_linear_infinite]"
              style={{
                background: "linear-gradient(to bottom, transparent 0%, transparent 45%, rgba(255, 191, 0, 0.15) 50%, transparent 55%, transparent 100%)",
              }}
            />
          </span>

          {/* Ambient glow on hover */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background: "radial-gradient(circle at center, rgba(255, 191, 0, 0.1) 0%, transparent 70%)",
            }}
          />

          {/* Sun icon (light mode) */}
          <Sun
            className="h-4 w-4 rotate-0 scale-100 transition-transform duration-300 dark:-rotate-90 dark:scale-0"
          />

          {/* Moon icon (dark mode) */}
          <Moon
            className="absolute h-4 w-4 rotate-90 scale-0 transition-transform duration-300 dark:rotate-0 dark:scale-100"
          />

          <span className="sr-only">{t("toggle")}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-40 border border-amber-500/50 bg-surface-300 font-mono text-sm shadow-[0_0_20px_rgba(255,191,0,0.15)]"
      >
        <DropdownMenuRadioGroup value={theme} onValueChange={handleThemeChange}>
          <DropdownMenuRadioItem
            value="light"
            className="cursor-pointer gap-2 text-amber-500 hover:bg-amber-500/10 focus:bg-amber-500/10"
          >
            <Sun className="h-4 w-4" />
            <span>{t("light")}</span>
            {theme === "light" && (
              <Check className="ml-auto h-4 w-4 text-status-success" />
            )}
          </DropdownMenuRadioItem>

          <DropdownMenuRadioItem
            value="dark"
            className="cursor-pointer gap-2 text-amber-500 hover:bg-amber-500/10 focus:bg-amber-500/10"
          >
            <Moon className="h-4 w-4" />
            <span>{t("dark")}</span>
            {theme === "dark" && (
              <Check className="ml-auto h-4 w-4 text-status-success" />
            )}
          </DropdownMenuRadioItem>

          <DropdownMenuRadioItem
            value="system"
            className="cursor-pointer gap-2 text-amber-500 hover:bg-amber-500/10 focus:bg-amber-500/10"
          >
            <Monitor className="h-4 w-4" />
            <span>{t("system")}</span>
            {theme === "system" && (
              <Check className="ml-auto h-4 w-4 text-status-success" />
            )}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
