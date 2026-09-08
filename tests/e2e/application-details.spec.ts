import { expect, test } from "@playwright/test";
import { mockApplicationPages } from "../support/application-page-mocks";
import { KEY_DETAIL, UPSTREAM_DETAIL, seedTheme } from "../support/admin-page-mocks";

for (const [theme, width] of [
  ["dark", 390],
  ["light", 1440],
] as const) {
  for (const [resource, id, sectionCount] of [
    ["keys", KEY_DETAIL.id, 6],
    ["upstreams", UPSTREAM_DETAIL.id, 13],
  ] as const) {
    test(`${resource} all sections ${theme}-${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await seedTheme(page, theme);
      await mockApplicationPages(page);
      await page.goto(`/zh-CN/${resource}/${id}`);
      const sections = page.locator("section[id]");
      await expect(sections).toHaveCount(sectionCount);
      for (const section of await sections.all()) {
        const sectionId = await section.getAttribute("id");
        const anchor = page.locator(`a[href="#${sectionId}"]`);
        await anchor.click();
        await expect(section).toBeVisible();
        await expect.poll(async () => (await section.boundingBox())!.y).toBeGreaterThanOrEqual(50);
        await page.screenshot({ path: info.outputPath(`${sectionId}.png`) });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      );
    });
  }
}
