"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { Check, Globe, LogOut, Menu, Monitor, Moon, Sun } from "lucide-react";

import { locales, localeNames, type Locale } from "@/i18n/config";
import { usePathname, useRouter } from "@/i18n/navigation";
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
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/auth-provider";

const radioItemClass = cn(
  "cursor-pointer justify-between border border-transparent",
  "data-[state=checked]:border-amber-500/35 data-[state=checked]:bg-surface-300"
);

/**
 * Compact account/controls overflow menu for the mobile header. The member
 * portal has no settings page and its bottom navigation is fixed at four
 * entries, so language switching, theme toggling, and logout live here on
 * small screens — mirroring the controls already present in the desktop
 * sidebar footer.
 */
export function MobileAccountMenu() {
  const tNav = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tLanguage = useTranslations("language");
  const tTheme = useTranslations("theme");

  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { theme, setTheme } = useTheme();
  const selectedTheme = theme ?? "system";

  const { logout } = useAuth();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const handleLocaleChange = (nextLocale: Locale) => {
    if (nextLocale === locale) {
      return;
    }
    const query = searchParams.toString();
    const targetPath = query ? `${pathname}?${query}` : pathname;
    router.replace(targetPath, { locale: nextLocale });
  };

  const confirmLogout = () => {
    setShowLogoutDialog(false);
    logout();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground"
            aria-label={tCommon("menu")}
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel className="flex items-center gap-2 text-muted-foreground">
            <Globe className="h-4 w-4" aria-hidden="true" />
            {tLanguage("switch")}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={locale}
            onValueChange={(value) => handleLocaleChange(value as Locale)}
          >
            {locales.map((nextLocale) => (
              <DropdownMenuRadioItem key={nextLocale} value={nextLocale} className={radioItemClass}>
                <span>{localeNames[nextLocale]}</span>
                {nextLocale === locale && <Check className="h-4 w-4 text-amber-500" aria-hidden />}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />

          <DropdownMenuLabel className="flex items-center gap-2 text-muted-foreground">
            <Sun className="h-4 w-4" aria-hidden="true" />
            {tTheme("toggle")}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={selectedTheme} onValueChange={setTheme}>
            <DropdownMenuRadioItem value="light" className={radioItemClass}>
              <span className="flex items-center gap-2">
                <Sun className="h-4 w-4 text-muted-foreground" />
                <span>{tTheme("light")}</span>
              </span>
              {selectedTheme === "light" && (
                <Check className="h-4 w-4 text-amber-500" aria-hidden />
              )}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark" className={radioItemClass}>
              <span className="flex items-center gap-2">
                <Moon className="h-4 w-4 text-muted-foreground" />
                <span>{tTheme("dark")}</span>
              </span>
              {selectedTheme === "dark" && <Check className="h-4 w-4 text-amber-500" aria-hidden />}
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system" className={radioItemClass}>
              <span className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                <span>{tTheme("system")}</span>
              </span>
              {selectedTheme === "system" && (
                <Check className="h-4 w-4 text-amber-500" aria-hidden />
              )}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="cursor-pointer text-status-error focus:text-status-error"
            onSelect={(event) => {
              event.preventDefault();
              setShowLogoutDialog(true);
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {tNav("logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
