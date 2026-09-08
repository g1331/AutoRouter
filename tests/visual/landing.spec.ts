import { expect, test } from "@playwright/test";
import { seedTheme } from "../support/admin-page-mocks";

for (const theme of ["dark", "light"] as const) {
  for (const width of [1440, 390]) {
    test(`public landing ${theme}-${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await seedTheme(page, theme);
      await page.goto("/zh-CN");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
      await page.screenshot({ path: info.outputPath("landing.png"), animations: "disabled" });
      await expect(page).toHaveScreenshot(`landing-${theme}-${width}.png`, {
        animations: "disabled",
      });
    });
  }
}
