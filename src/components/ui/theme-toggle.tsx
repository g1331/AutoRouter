"use client";

import * as React from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const THEME_SWITCH_ANIMATION_MS = 360;

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);
  const t = useTranslations("theme");

  React.useEffect(() => {
    setMounted(true);
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const onChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  const handleThemeChange = (nextTheme: string) => {
    if (!prefersReducedMotion) {
      document.documentElement.classList.add("theme-switching");
      window.setTimeout(() => {
        document.documentElement.classList.remove("theme-switching");
      }, THEME_SWITCH_ANIMATION_MS);
    }
    setTheme(nextTheme);
  };

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 border border-border bg-surface-300 text-muted-foreground"
      >
        <Sun className="h-4 w-4" />
        <span className="sr-only">{t("toggle")}</span>
      </Button>
    );
  }

  const activeTheme = theme ?? "system";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 border border-border bg-surface-300 text-foreground hover:border-amber-500/50 hover:bg-surface-400"
          aria-label={t("toggle")}
        >
          <Sun
            className={
              "h-4 w-4 transition-all duration-300 " +
              (resolvedTheme === "dark"
                ? "scale-0 -rotate-90 opacity-0"
                : "scale-100 rotate-0 opacity-100")
            }
          />
          <Moon
            className={
              "absolute h-4 w-4 transition-all duration-300 " +
              (resolvedTheme === "dark"
                ? "scale-100 rotate-0 opacity-100"
                : "scale-0 rotate-90 opacity-0")
            }
          />
          <span className="sr-only">{t("toggle")}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[152px]">
        <DropdownMenuRadioGroup value={activeTheme} onValueChange={handleThemeChange}>
          <DropdownMenuRadioItem value="light" className="cursor-pointer gap-2">
            <Sun className="h-4 w-4" />
            <span>{t("light")}</span>
            {activeTheme === "light" && <Check className="ml-auto h-4 w-4 text-status-success" />}
          </DropdownMenuRadioItem>

          <DropdownMenuRadioItem value="dark" className="cursor-pointer gap-2">
            <Moon className="h-4 w-4" />
            <span>{t("dark")}</span>
            {activeTheme === "dark" && <Check className="ml-auto h-4 w-4 text-status-success" />}
          </DropdownMenuRadioItem>

          <DropdownMenuRadioItem value="system" className="cursor-pointer gap-2">
            <Monitor className="h-4 w-4" />
            <span>{t("system")}</span>
            {activeTheme === "system" && <Check className="ml-auto h-4 w-4 text-status-success" />}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
