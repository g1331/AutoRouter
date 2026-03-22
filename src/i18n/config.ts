export const locales = ["zh-CN", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "zh-CN";
export const localeCookieName = "NEXT_LOCALE";
export const localeCookieMaxAge = 60 * 60 * 24 * 365;

export const localeNames: Record<Locale, string> = {
  "zh-CN": "简体中文",
  en: "English",
};
