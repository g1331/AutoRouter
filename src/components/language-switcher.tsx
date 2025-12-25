"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Cassette Futurism Language Switcher
 *
 * Terminal-style language selector with:
 * - Amber text on dark background
 * - Globe icon indicator
 * - Dropdown menu for language selection
 * - Preserves query string when switching locales
 */
export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("language");

  const handleLocaleChange = (nextLocale: Locale) => {
    if (nextLocale === locale) return;
    const queryString = searchParams.toString();
    const targetPath = queryString ? `${pathname}?${queryString}` : pathname;
    router.replace(targetPath, { locale: nextLocale });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 gap-2" aria-label={t("switch")}>
          <Globe className="h-4 w-4 text-amber-500" aria-hidden="true" />
          <span className="hidden sm:inline font-mono text-xs text-amber-500">
            {localeNames[locale]}
          </span>
        </Button>
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
