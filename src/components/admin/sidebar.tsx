"use client";

import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  LayoutDashboard,
  Key,
  Server,
  ScrollText,
  ChevronLeft,
  LogOut,
  Settings,
  Globe,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

/**
 * Language Switcher Item for Sidebar - Full row clickable
 */
function LanguageItem({ collapsed }: { collapsed: boolean }) {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tLang = useTranslations("language");

  const handleLocaleChange = (nextLocale: Locale) => {
    if (nextLocale === locale) return;
    const queryString = searchParams.toString();
    const targetPath = queryString ? `${pathname}?${queryString}` : pathname;
    router.replace(targetPath, { locale: nextLocale });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "group relative flex items-center w-full font-mono text-xs font-medium tracking-wider",
            "transition-all duration-300 ease-cf-standard",
            collapsed
              ? "mx-2 justify-center px-2 py-3 rounded-cf-sm"
              : "mx-2 gap-3 px-3 py-3 rounded-cf-sm",
            "text-amber-700 border-l-2 border-transparent hover:bg-surface-400 hover:text-amber-500 hover:border-l-amber-700/50"
          )}
          title={tLang("switch")}
        >
          <Globe className="flex-shrink-0 h-5 w-5 transition-all duration-200 group-hover:scale-110" />
          {!collapsed && <span className="whitespace-nowrap">{tLang("current")}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {locales.map((item) => (
          <DropdownMenuItem
            key={item}
            onClick={() => handleLocaleChange(item)}
            className={cn(
              "gap-2 cursor-pointer font-mono text-xs",
              item === locale && "bg-amber-500/10 text-amber-500"
            )}
          >
            {localeNames[item]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Theme Toggle Item for Sidebar - Full row clickable
 */
function ThemeItem({ collapsed }: { collapsed: boolean }) {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("theme");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "group relative flex items-center w-full font-mono text-xs font-medium tracking-wider",
            "transition-all duration-300 ease-cf-standard",
            collapsed
              ? "mx-2 justify-center px-2 py-3 rounded-cf-sm"
              : "mx-2 gap-3 px-3 py-3 rounded-cf-sm",
            "text-amber-700 border-l-2 border-transparent hover:bg-surface-400 hover:text-amber-500 hover:border-l-amber-700/50"
          )}
          title={t("toggle")}
        >
          <Sun className="flex-shrink-0 h-5 w-5 dark:hidden transition-all duration-200 group-hover:scale-110" />
          <Moon className="flex-shrink-0 h-5 w-5 hidden dark:block transition-all duration-200 group-hover:scale-110" />
          {!collapsed && <span className="whitespace-nowrap">{t("toggle")}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className={cn(
            "gap-2 cursor-pointer font-mono text-xs text-amber-500 hover:bg-amber-500/10",
            theme === "light" && "bg-amber-500/10"
          )}
        >
          <Sun className="h-4 w-4" />
          <span>{t("light")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className={cn(
            "gap-2 cursor-pointer font-mono text-xs text-amber-500 hover:bg-amber-500/10",
            theme === "dark" && "bg-amber-500/10"
          )}
        >
          <Moon className="h-4 w-4" />
          <span>{t("dark")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className={cn(
            "gap-2 cursor-pointer font-mono text-xs text-amber-500 hover:bg-amber-500/10",
            theme === "system" && "bg-amber-500/10"
          )}
        >
          <Monitor className="h-4 w-4" />
          <span>{t("system")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Navigation item definition
 */
type NavigationItem = {
  href: string;
  icon: typeof LayoutDashboard;
  labelKey: "dashboard" | "apiKeys" | "upstreams" | "logs" | "settings";
};

/**
 * Navigation configuration
 */
const navigation: NavigationItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "dashboard" },
  { href: "/keys", icon: Key, labelKey: "apiKeys" },
  { href: "/upstreams", icon: Server, labelKey: "upstreams" },
  { href: "/logs", icon: ScrollText, labelKey: "logs" },
];

const mobileNavigation: NavigationItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "dashboard" },
  { href: "/keys", icon: Key, labelKey: "apiKeys" },
  { href: "/upstreams", icon: Server, labelKey: "upstreams" },
  { href: "/logs", icon: ScrollText, labelKey: "logs" },
  { href: "/settings", icon: Settings, labelKey: "settings" },
];

/**
 * Check if a path is active
 */
function isPathActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

/**
 * Responsive Navigation System
 *
 * Mobile:
 * - Top header bar with logo and menu
 * - Bottom tab bar navigation (like QQ/WeChat apps)
 *
 * Desktop:
 * - Collapsible sidebar (w-20 collapsed, w-64 expanded)
 */
interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const { logout } = useAuth();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const handleLogoutClick = () => {
    setShowLogoutDialog(true);
  };

  const handleConfirmLogout = () => {
    setShowLogoutDialog(false);
    logout();
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-divider-subtle bg-black-900 cf-retro-grid md:flex",
          "transition-[width] duration-300 ease-cf-standard",
          collapsed ? "w-20" : "w-64"
        )}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Decorative top line */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
        </div>

        {/* Logo & Brand */}
        <div
          className={cn(
            "flex items-center gap-3 border-b border-divider-subtle overflow-hidden relative transition-all duration-300",
            collapsed ? "px-2 py-4 justify-center" : "px-4 py-4"
          )}
        >
          <div
            className={cn(
              "flex-shrink-0 w-10 h-10 flex items-center justify-center",
              "bg-gradient-to-br from-amber-500 to-amber-600 text-black-900 rounded-cf-sm shadow-cf-glow-subtle"
            )}
          >
            <svg
              className={cn("transition-all duration-300", collapsed ? "w-5 h-5" : "w-6 h-6")}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div
            className={cn(
              "flex flex-col min-w-0 transition-all duration-300 overflow-hidden",
              collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-[140px]"
            )}
          >
            <span className="font-mono text-sm font-medium text-amber-500 tracking-wide truncate">
              {tCommon("appName").toUpperCase()}
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-amber-700 truncate">
                {tCommon("version")}
              </span>
              <div className="cf-status-led cf-status-led-online" />
            </div>
          </div>
        </div>

        {/* Collapse Toggle Button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className={cn(
            "absolute top-[4.5rem] -right-3 z-50 h-6 w-6 rounded-full border border-divider-subtle",
            "bg-surface-200 text-amber-500 shadow-cf-glow-subtle backdrop-blur-sm",
            "transition-all duration-300 hover:bg-surface-300 hover:text-amber-400 hover:scale-110",
            "hidden md:flex items-center justify-center"
          )}
          aria-label={collapsed ? tCommon("expand") : tCommon("collapse")}
          title={collapsed ? tCommon("expand") : tCommon("collapse")}
        >
          <ChevronLeft
            className={cn("h-3 w-3 transition-transform duration-300", collapsed && "rotate-180")}
          />
        </Button>

        {/* Navigation Items */}
        <nav className="flex-1 py-4 space-y-1" aria-label="Main menu">
          {navigation.map((item, index) => {
            const Icon = item.icon;
            const label = t(item.labelKey).toUpperCase();
            const isActive = isPathActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center font-mono text-xs font-medium tracking-wider",
                  "transition-all duration-300 ease-cf-standard",
                  collapsed
                    ? "mx-2 justify-center px-2 py-3 rounded-cf-sm"
                    : "mx-2 gap-3 px-3 py-3 rounded-cf-sm",
                  isActive
                    ? "bg-surface-300 text-amber-500 border-l-2 border-l-amber-500 shadow-[0_0_12px_rgba(255,191,0,0.15)]"
                    : "text-amber-700 border-l-2 border-transparent hover:bg-surface-400 hover:text-amber-500 hover:border-l-amber-700/50"
                )}
                style={{ animationDelay: `${index * 50}ms` }}
                aria-current={isActive ? "page" : undefined}
                title={label}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 bg-amber-500 shadow-[0_0_8px] shadow-amber-500/50" />
                )}

                <Icon
                  className={cn(
                    "flex-shrink-0 h-5 w-5 transition-all duration-200",
                    "group-hover:scale-110",
                    isActive && "drop-shadow-[0_0_6px_rgba(255,191,0,0.8)]"
                  )}
                  aria-hidden="true"
                />

                <span
                  className={cn(
                    "whitespace-nowrap transition-all duration-300 overflow-hidden",
                    collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-[120px] flex-1"
                  )}
                >
                  {label}
                </span>

                {/* Hover arrow indicator */}
                {!collapsed && (
                  <span
                    className={cn(
                      "opacity-0 -translate-x-2 transition-all duration-200 text-amber-600",
                      "group-hover:opacity-100 group-hover:translate-x-0"
                    )}
                  >
                    &gt;
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section with settings */}
        <div
          className={cn(
            "border-t border-divider-subtle relative overflow-hidden transition-all duration-300 py-4",
            collapsed ? "px-2" : "px-3"
          )}
        >
          {/* Settings Items - Same style as nav links */}
          <div className="space-y-1">
            {/* Language Switcher */}
            <LanguageItem collapsed={collapsed} />

            {/* Theme Toggle */}
            <ThemeItem collapsed={collapsed} />

            {/* Logout button */}
            <button
              type="button"
              onClick={handleLogoutClick}
              className={cn(
                "group relative flex items-center w-full font-mono text-xs font-medium tracking-wider",
                "transition-all duration-300 ease-cf-standard",
                collapsed
                  ? "mx-2 justify-center px-2 py-3 rounded-cf-sm"
                  : "mx-2 gap-3 px-3 py-3 rounded-cf-sm",
                "text-amber-700 border-l-2 border-transparent hover:bg-surface-400 hover:text-amber-500 hover:border-l-amber-700/50"
              )}
              title={t("logout")}
            >
              <LogOut
                className={cn(
                  "flex-shrink-0 h-5 w-5 transition-all duration-200 group-hover:scale-110"
                )}
              />
              {!collapsed && <span className="whitespace-nowrap">{t("logout")}</span>}
            </button>
          </div>

          {/* Status indicator */}
          <div
            className={cn(
              "flex items-center gap-2 mt-3 transition-all duration-300",
              collapsed ? "justify-center" : "justify-start"
            )}
          >
            <div className="cf-status-led cf-status-led-online" />
            <span
              className={cn(
                "font-mono text-xs text-amber-700 whitespace-nowrap transition-all duration-300 overflow-hidden",
                collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-[80px]"
              )}
            >
              {tCommon("sysOk")}
            </span>
          </div>

          {/* Scanning line effect */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/5 to-transparent animate-shimmer" />
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav
        className="fixed left-0 right-0 bottom-0 z-40 bg-black-900/95 backdrop-blur-md border-t border-divider-subtle md:hidden"
        aria-label="Bottom navigation"
      >
        <div className="mx-auto grid max-w-md grid-cols-5 gap-1 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          {mobileNavigation.map((item) => {
            const Icon = item.icon;
            const label = t(item.labelKey);
            const isActive = isPathActive(pathname, item.href);

            return (
              <Link
                key={`mobile-${item.href}`}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-cf-sm px-1 py-2",
                  "font-mono text-[10px] font-medium leading-none tracking-wide transition-all duration-200",
                  isActive
                    ? "text-amber-500 bg-surface-300/70"
                    : "text-amber-700 hover:bg-surface-400/60 hover:text-amber-500"
                )}
              >
                {/* Active indicator dot */}
                {isActive && (
                  <span className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(255,191,0,0.8)]" />
                )}

                <Icon
                  className={cn(
                    "h-5 w-5 transition-transform duration-200",
                    isActive ? "scale-110" : "group-hover:scale-110"
                  )}
                />
                <span className="truncate max-w-full">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent className="bg-surface-200 border-amber-500/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono text-amber-500">{t("logout")}</AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-amber-700">
              {t("logoutConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-mono text-xs bg-surface-300 text-amber-500 border-amber-500/30 hover:bg-surface-400 hover:text-amber-400">
              {tCommon("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmLogout}
              className="font-mono text-xs bg-amber-500 text-black-900 hover:bg-amber-400"
            >
              {t("logout")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
