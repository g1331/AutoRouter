import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { APPLICATION_PAGES, mockApplicationPages } from "../support/application-page-mocks";
import { seedTheme } from "../support/admin-page-mocks";

for (const theme of ["dark", "light"] as const) {
  for (const width of [1440, 390]) {
    test.describe(`${theme}-${width}`, () => {
      test.use({ viewport: { width, height: 900 } });
      for (const [id, path] of APPLICATION_PAGES) {
        test(`${id} ${path}`, async ({ page }) => {
          await seedTheme(page, theme);
          if (path !== "/login") await mockApplicationPages(page, path.startsWith("/portal"));
          await page.goto(`/en${path}`);
          await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
          await expect(page.locator("div.motion-safe\\:animate-pulse.bg-muted")).toHaveCount(0);
          if (id === "P13") await expect(page.locator("fieldset")).toBeEnabled();
          await page.evaluate(() =>
            Promise.all(
              document
                .getAnimations()
                .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
                .map((animation) => animation.finished.catch(() => undefined))
            )
          );
          const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
          expect(
            results.violations.map(({ id, nodes }) => ({
              id,
              nodes: nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
            }))
          ).toEqual([]);
        });
      }
    });
  }
}
