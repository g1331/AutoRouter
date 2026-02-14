"use client";

import { useTranslations } from "next-intl";

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
  const t = useTranslations("common");

  return (
    <header className="cf-scanlines sticky top-0 z-20 w-full bg-surface-200/95 backdrop-blur-sm border-b-2 border-amber-500 hidden md:block">
      <div className="flex items-center justify-between h-14 px-6">
        {/* Page Title */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-amber-700 hidden sm:inline">{">>"}</span>
          <h1 className="font-mono text-lg font-medium tracking-wide text-amber-500 cf-glow-text">
            {title.toUpperCase()}
          </h1>
        </div>

        {/* System Status */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-amber-700">{t("status").toUpperCase()}:</span>
          <span className="text-status-success">{t("online").toUpperCase()}</span>
        </div>
      </div>
    </header>
  );
}
