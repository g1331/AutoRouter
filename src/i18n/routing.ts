import { defineRouting } from "next-intl/routing";
import { defaultLocale, localeCookieMaxAge, localeCookieName, locales } from "./config";

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "always",
  localeCookie: {
    name: localeCookieName,
    maxAge: localeCookieMaxAge,
    sameSite: "lax",
  },
});
