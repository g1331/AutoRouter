"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/providers/auth-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface TopbarProps {
  title: string;
}

/**
 * Cassette Futurism Top Bar
 *
 * Terminal-style header with:
 * - Scanline effect
 * - Amber text on dark background
 * - System status indicators
 */
export function Topbar({ title }: TopbarProps) {
  const { logout } = useAuth();
  const t = useTranslations("common");
  const tNav = useTranslations("nav");

  return (
    <header className="cf-scanlines sticky top-0 z-20 w-full bg-surface-200/95 backdrop-blur-sm border-b-2 border-amber-500">
      <div className="flex items-center justify-between h-14 px-6">
        {/* Page Title */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-amber-700 hidden sm:inline">
            {">>"}
          </span>
          <h1 className="font-mono text-lg font-medium tracking-wide text-amber-500 cf-glow-text">
            {title.toUpperCase()}
          </h1>
        </div>

        {/* System Status & Actions */}
        <div className="flex items-center gap-4">
          {/* Status Indicator */}
          <div className="hidden sm:flex items-center gap-2 font-mono text-xs">
            <span className="text-amber-700">{t("status").toUpperCase()}:</span>
            <span className="text-status-success">{t("online").toUpperCase()}</span>
          </div>

          {/* Language Switcher */}
          <LanguageSwitcher />

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-2"
                aria-label="User menu"
              >
                <div className="w-7 h-7 rounded-cf-sm bg-amber-500 flex items-center justify-center">
                  <span className="font-mono text-sm font-bold text-black-900">
                    A
                  </span>
                </div>
                <span className="hidden sm:inline font-mono text-xs text-amber-500">
                  ADMIN
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={logout}
                className="gap-2 cursor-pointer text-status-error focus:text-status-error focus:bg-status-error-muted"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="font-mono text-xs">{tNav("logout").toUpperCase()}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
