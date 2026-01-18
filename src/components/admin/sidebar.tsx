"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LayoutDashboard, Key, Server, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Enhanced Cassette Futurism Sidebar Navigation
 *
 * Terminal-style navigation with:
 * - Deep black background with retro grid
 * - Amber text and icons with glow effects
 * - Animated active state with pulse
 * - Hover reveal animations
 * - System status indicator
 */
export function Sidebar() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");

  const navigation = [
    {
      href: "/dashboard",
      icon: LayoutDashboard,
      labelKey: "dashboard" as const,
    },
    { href: "/keys", icon: Key, labelKey: "apiKeys" as const },
    { href: "/upstreams", icon: Server, labelKey: "upstreams" as const },
    { href: "/logs", icon: ScrollText, labelKey: "logs" as const },
  ];

  return (
    <aside
      className="flex flex-col h-full w-16 lg:w-56 bg-black-900 border-r border-divider-subtle cf-retro-grid relative"
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Decorative scanline effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
      </div>

      {/* Logo & Brand */}
      <div className="flex items-center gap-3 px-3 py-4 border-b border-divider-subtle overflow-hidden relative">
        <div
          className={cn(
            "flex-shrink-0 w-10 h-10 flex items-center justify-center",
            "bg-gradient-to-br from-amber-500 to-amber-600 text-black-900 rounded-cf-sm",
            "shadow-cf-glow-subtle cf-glitch"
          )}
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <div className="hidden lg:flex flex-col flex-1 min-w-0">
          <span className="font-mono text-sm font-medium text-amber-500 tracking-wide truncate cf-phosphor-trail">
            {tCommon("appName").toUpperCase()}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-amber-700 truncate">
              ADMIN {tCommon("version")}
            </span>
            <div className="cf-status-led cf-status-led-online" />
          </div>
        </div>
      </div>

      {/* Navigation Destinations */}
      <nav className="flex-1 py-4 space-y-1" aria-label="Main menu">
        {navigation.map((item, index) => {
          const Icon = item.icon;
          const label = t(item.labelKey).toUpperCase();
          const isActive =
            pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href + "/"));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 px-3 py-3 mx-2 rounded-cf-sm relative",
                "font-mono text-xs font-medium tracking-wider",
                "transition-all duration-cf-normal ease-cf-standard",
                isActive
                  ? "bg-surface-300 text-amber-500 border-l-4 border-l-amber-500 cf-pulse-glow scale-[1.02]"
                  : "cf-stagger-reveal text-amber-700 border-l-2 border-transparent hover:bg-surface-400 hover:text-amber-500 hover:border-l-amber-700"
              )}
              style={{ animationDelay: `${index * 50}ms` }}
              aria-current={isActive ? "page" : undefined}
              title={label}
            >
              {/* Active indicator glow */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-amber-500 shadow-[0_0_8px] shadow-amber-500/50" />
              )}

              <Icon
                className={cn(
                  "h-5 w-5 flex-shrink-0 transition-transform duration-200",
                  "group-hover:scale-110",
                  isActive && "scale-110 drop-shadow-[0_0_6px_rgba(255,191,0,0.8)]"
                )}
                aria-hidden="true"
              />
              <span className="hidden lg:inline flex-1">{label}</span>

              {/* Hover arrow indicator */}
              <span
                className={cn(
                  "hidden lg:block opacity-0 -translate-x-2 transition-all duration-200",
                  "group-hover:opacity-100 group-hover:translate-x-0",
                  "text-amber-600"
                )}
              >
                &gt;
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Version Info with enhanced styling */}
      <div className="px-3 py-4 border-t border-divider-subtle relative overflow-hidden">
        <div className="flex items-center justify-center lg:justify-start gap-2">
          <div className="cf-status-led cf-status-led-online" />
          <p className="font-mono text-xs text-amber-700">{tCommon("sysOk")}</p>
        </div>
        {/* Scanning line effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/5 to-transparent animate-shimmer pointer-events-none" />
      </div>
    </aside>
  );
}
