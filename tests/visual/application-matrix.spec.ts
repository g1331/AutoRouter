import { expect, test } from "@playwright/test";
import { APPLICATION_PAGES, mockApplicationPages } from "../support/application-page-mocks";
import { KEY_DETAIL, UPSTREAM_DETAIL, seedTheme } from "../support/admin-page-mocks";

const pages = APPLICATION_PAGES;

for (const locale of ["en", "zh-CN"] as const) {
  for (const theme of ["dark", "light"] as const) {
    for (const width of [1440, 390]) {
      test.describe(`${locale}-${theme}-${width}`, () => {
        test.use({ viewport: { width, height: width === 390 ? 844 : 1000 } });
        for (const [id, path] of pages) {
          test(`${id} ${path}`, async ({ page }, testInfo) => {
            const errors: string[] = [];
            page.on("pageerror", (error) => errors.push(error.message));
            await page.clock.setFixedTime(new Date("2026-06-10T09:00:00Z"));
            await seedTheme(page, theme);
            if (path !== "/login") await mockApplicationPages(page, path.startsWith("/portal"));
            await page.goto(`/${locale}${path}`);
            await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
            const ready: Record<string, string> = {
              P02: "openai-primary",
              P03: "openai-primary",
              P04: KEY_DETAIL.name,
              P05: KEY_DETAIL.name,
              P06: "anthropic-backup",
              P07: UPSTREAM_DETAIL.name,
              P08: "gpt-4.1",
              P09: "Alice Doe",
              P10: "alice",
              P11: "custom-unpriced-model",
              P13: "gpt-4.1",
              P15: "Session header",
              P16: "Local CLIProxyAPI",
              P18: "42",
              P19: KEY_DETAIL.name,
              P20: "gpt-4.1",
            };
            if (ready[id])
              await expect(
                page.getByText(ready[id], { exact: true }).filter({ visible: true }).first()
              ).toBeVisible();
            await expect(page.locator("div.motion-safe\\:animate-pulse.bg-muted")).toHaveCount(0);
            await expect(page.getByRole("status", { name: /loading|加载/i })).toHaveCount(0);
            await expect(page.locator("html")).toHaveClass(new RegExp(theme));
            await page.screenshot({
              path: testInfo.outputPath("review.png"),
              animations: "disabled",
            });
            expect(errors).toEqual([]);
            expect(
              await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
            ).toBe(true);
            await expect(page).toHaveScreenshot(`${id}-${locale}-${theme}-${width}.png`, {
              animations: "disabled",
            });
          });
        }
      });
    }
  }
}
