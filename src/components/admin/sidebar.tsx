"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Check,
  ChevronLeft,
  Globe,
  Key,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  ScrollText,
  Server,
  Settings,
  Sun,
  Wrench,
  ArrowLeftRight,
} from "lucide-react";

import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { Button } from "@/components/ui/button";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

type NavigationItem = {
  href: string;
  icon: typeof LayoutDashboard;
  labelKey: "dashboard" | "apiKeys" | "upstreams" | "logs" | "settings";
};

type SystemNavigationItem = {
  href: string;
  icon: typeof LayoutDashboard;
  labelKey: "headerCompensation";
};

const navigation: NavigationItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "dashboard" },
  { href: "/keys", icon: Key, labelKey: "apiKeys" },
  { href: "/upstreams", icon: Server, labelKey: "upstreams" },
  { href: "/logs", icon: ScrollText, labelKey: "logs" },
];

const systemNavigation: SystemNavigationItem[] = [
  { href: "/system/header-compensation", icon: ArrowLeftRight, labelKey: "headerCompensation" },
];

const mobileNavigation: NavigationItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "dashboard" },
  { href: "/keys", icon: Key, labelKey: "apiKeys" },
  { href: "/upstreams", icon: Server, labelKey: "upstreams" },
  { href: "/logs", icon: ScrollText, labelKey: "logs" },
  { href: "/settings", icon: Settings, labelKey: "settings" },
];

function isPathActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

function baseControlItemClass(collapsed: boolean): string {
  return cn(
    "group flex w-full items-center rounded-cf-sm border border-transparent transition-all duration-cf-normal ease-cf-standard",
    "text-muted-foreground hover:border-border hover:bg-surface-300 hover:text-foreground",
    collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
  );
}

function LanguageItem({ collapsed }: { collapsed: boolean }) {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tLanguage = useTranslations("language");

  const handleLocaleChange = (nextLocale: Locale) => {
    if (nextLocale === locale) {
      return;
    }
    const query = searchParams.toString();
    const targetPath = query ? `${pathname}?${query}` : pathname;
    router.replace(targetPath, { locale: nextLocale });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={baseControlItemClass(collapsed)}
          title={tLanguage("switch")}
        >
          <Globe className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span className="type-body-small truncate">{tLanguage("current")}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {locales.map((nextLocale) => (
          <DropdownMenuItem
            key={nextLocale}
            onClick={() => handleLocaleChange(nextLocale)}
            className={cn(
              "cursor-pointer",
              nextLocale === locale && "bg-surface-300 text-foreground border border-amber-500/35"
            )}
          >
            {localeNames[nextLocale]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeItem({ collapsed }: { collapsed: boolean }) {
  const { resolvedTheme, theme, setTheme } = useTheme();
  const tTheme = useTranslations("theme");
  const selectedTheme = theme ?? "system";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={baseControlItemClass(collapsed)} title={tTheme("toggle")}>
          {resolvedTheme === "dark" ? (
            <Moon className="h-4 w-4 flex-shrink-0" />
          ) : (
            <Sun className="h-4 w-4 flex-shrink-0" />
          )}
          {!collapsed && <span className="type-body-small truncate">{tTheme("toggle")}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[150px]">
        <DropdownMenuRadioGroup value={selectedTheme} onValueChange={setTheme}>
          <DropdownMenuRadioItem
            value="light"
            className={cn(
              "cursor-pointer justify-between border border-transparent",
              "data-[state=checked]:border-amber-500/35 data-[state=checked]:bg-surface-300"
            )}
          >
            <span className="flex items-center gap-2">
              <Sun className="h-4 w-4 text-muted-foreground" />
              <span>{tTheme("light")}</span>
            </span>
            {selectedTheme === "light" && <Check className="h-4 w-4 text-amber-500" aria-hidden />}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value="dark"
            className={cn(
              "cursor-pointer justify-between border border-transparent",
              "data-[state=checked]:border-amber-500/35 data-[state=checked]:bg-surface-300"
            )}
          >
            <span className="flex items-center gap-2">
              <Moon className="h-4 w-4 text-muted-foreground" />
              <span>{tTheme("dark")}</span>
            </span>
            {selectedTheme === "dark" && <Check className="h-4 w-4 text-amber-500" aria-hidden />}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value="system"
            className={cn(
              "cursor-pointer justify-between border border-transparent",
              "data-[state=checked]:border-amber-500/35 data-[state=checked]:bg-surface-300"
            )}
          >
            <span className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              <span>{tTheme("system")}</span>
            </span>
            {selectedTheme === "system" && <Check className="h-4 w-4 text-amber-500" aria-hidden />}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const { logout } = useAuth();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const confirmLogout = () => {
    setShowLogoutDialog(false);
    logout();
  };

  return (
    <>
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 hidden h-dvh flex-col border-r border-divider bg-surface-200/96 backdrop-blur md:flex",
          "transition-[width] duration-cf-normal ease-cf-standard",
          collapsed ? "w-20" : "w-64"
        )}
        role="navigation"
        aria-label="Main navigation"
      >
        <div
          className={cn(
            "flex items-center gap-3 border-b border-divider py-4",
            collapsed ? "justify-center px-2" : "px-4"
          )}
        >
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-cf-md border border-amber-500/45 bg-surface-300 text-amber-500 shadow-cf-glow-subtle">
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2.3}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="type-label-large truncate text-foreground">{tCommon("appName")}</p>
              <p className="type-caption truncate text-muted-foreground">{tCommon("version")}</p>
            </div>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className={cn(
            "absolute -right-3 top-[4.3rem] z-50 hidden h-6 w-6 rounded-full border border-divider bg-background text-muted-foreground",
            "hover:border-amber-500/45 hover:text-foreground md:flex"
          )}
          aria-label={collapsed ? tCommon("expand") : tCommon("collapse")}
          title={collapsed ? tCommon("expand") : tCommon("collapse")}
        >
          <ChevronLeft className={cn("h-3 w-3 transition-transform", collapsed && "rotate-180")} />
        </Button>

        <nav className="flex-1 space-y-1.5 px-2 py-4" aria-label="Primary">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isPathActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center rounded-cf-sm border text-sm transition-all duration-cf-normal ease-cf-standard",
                  collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
                  active
                    ? "border-amber-500/45 bg-surface-300 text-foreground shadow-cf-glow-subtle"
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-surface-300 hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
                title={tNav(item.labelKey)}
              >
                <Icon
                  className={cn("h-4 w-4 flex-shrink-0", active && "text-amber-500")}
                  aria-hidden="true"
                />
                {!collapsed && <span className="truncate">{tNav(item.labelKey)}</span>}
              </Link>
            );
          })}

          {/* System group */}
          <div className={cn("pt-2", !collapsed && "border-t border-divider/60 mt-2")}>
            {!collapsed && (
              <div className="flex items-center gap-1.5 px-3 pb-1.5 pt-1">
                <Wrench className="h-3 w-3 text-muted-foreground/60" aria-hidden="true" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                  {tNav("system")}
                </span>
              </div>
            )}
            {systemNavigation.map((item) => {
              const Icon = item.icon;
              const active = isPathActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "group relative flex items-center rounded-cf-sm border text-sm transition-all duration-cf-normal ease-cf-standard",
                    collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
                    active
                      ? "border-amber-500/45 bg-surface-300 text-foreground shadow-cf-glow-subtle"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-surface-300 hover:text-foreground"
                  )}
                  aria-current={active ? "page" : undefined}
                  title={tNav(item.labelKey)}
                >
                  <Icon
                    className={cn("h-4 w-4 flex-shrink-0", active && "text-amber-500")}
                    aria-hidden="true"
                  />
                  {!collapsed && <span className="truncate">{tNav(item.labelKey)}</span>}
                </Link>
              );
            })}
          </div>
        </nav>

        <div
          className={cn(
            "space-y-1.5 border-t border-divider px-2 py-3",
            collapsed ? "pb-4" : "pb-5"
          )}
        >
          <LanguageItem collapsed={collapsed} />
          <ThemeItem collapsed={collapsed} />

          <button
            type="button"
            onClick={() => setShowLogoutDialog(true)}
            className={baseControlItemClass(collapsed)}
            title={tNav("logout")}
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span className="type-body-small truncate">{tNav("logout")}</span>}
          </button>
        </div>
      </aside>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-divider bg-surface-200/96 backdrop-blur md:hidden"
        aria-label="Bottom navigation"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-1 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          {mobileNavigation.map((item) => {
            const Icon = item.icon;
            const active = isPathActive(pathname, item.href);

            return (
              <Link
                key={`mobile-${item.href}`}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-cf-sm border px-1.5 py-1.5",
                  "text-[11px] transition-all duration-cf-fast ease-cf-standard",
                  active
                    ? "border-amber-500/45 bg-surface-300 text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-surface-300 hover:text-foreground"
                )}
              >
                <Icon className={cn("h-[18px] w-[18px]", active && "text-amber-500")} />
                <span className="truncate">{tNav(item.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tNav("logout")}</AlertDialogTitle>
            <AlertDialogDescription>{tNav("logoutConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLogout}>{tNav("logout")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
