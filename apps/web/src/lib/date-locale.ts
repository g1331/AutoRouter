import { zhCN, enUS } from "date-fns/locale";
import type { Locale } from "@/i18n/config";

/**
 * Get date-fns locale based on app locale
 */
export function getDateLocale(locale: string): typeof zhCN | typeof enUS {
  const localeMap: Record<Locale, typeof zhCN | typeof enUS> = {
    "zh-CN": zhCN,
    en: enUS,
  };
  return localeMap[locale as Locale] || zhCN;
}
