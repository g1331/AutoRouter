import { describe, it, expect } from "vitest";
import { getDateLocale } from "@/lib/date-locale";
import { zhCN, enUS } from "date-fns/locale";

describe("date-locale", () => {
  describe("getDateLocale", () => {
    it("returns zhCN for zh-CN locale", () => {
      const locale = getDateLocale("zh-CN");
      expect(locale).toBe(zhCN);
    });

    it("returns enUS for en locale", () => {
      const locale = getDateLocale("en");
      expect(locale).toBe(enUS);
    });

    it("returns zhCN as default for unknown locale", () => {
      const locale = getDateLocale("fr");
      expect(locale).toBe(zhCN);
    });

    it("returns zhCN for empty string", () => {
      const locale = getDateLocale("");
      expect(locale).toBe(zhCN);
    });
  });
});
