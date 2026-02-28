"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { Check, Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  compact?: boolean;
}

/**
 * Cassette Futurism Language Switcher
 *
 * Terminal-style language selector with:
 * - Amber text on dark background
 * - Globe icon indicator
 * - Dropdown menu for language selection
 * - Preserves query string when switching locales
 */
export function LanguageSwitcher({ compact = false }: LanguageSwitcherProps = {}) {
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
          {!compact && (
            <span className="font-mono text-xs text-amber-500">{localeNames[locale]}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(value) => handleLocaleChange(value as Locale)}
        >
          {locales.map((item) => (
            <DropdownMenuRadioItem
              key={item}
              value={item}
              className={cn(
                "cursor-pointer justify-between border border-transparent",
                "data-[state=checked]:border-amber-500/35 data-[state=checked]:bg-surface-300"
              )}
            >
              <span className="font-mono text-xs">{localeNames[item]}</span>
              {item === locale && <Check className="h-4 w-4 text-amber-500" aria-hidden />}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
