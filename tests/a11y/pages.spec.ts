import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import {
  mockAdminApis,
  seedAdminSession,
  seedTheme,
  UPSTREAM_DETAIL,
} from "../support/admin-page-mocks";

// axe WCAG 2.1 A/AA 扫描：login / dashboard / keys / upstreams 四页 × 暗/亮
// 两主题。亮色主题是 bronze 强调色对比度的最终裁判（设计令牌对比度断言见
// tests/unit/design-tokens-contrast.test.ts）。运行：pnpm test:a11y

const THEMES = ["dark", "light"] as const;

async function expectNoViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();

  expect(
    results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target.join(" ")),
    }))
  ).toEqual([]);
}

for (const theme of THEMES) {
  test.describe(`Accessibility (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await seedTheme(page, theme);
    });

    test("login page has no WCAG A/AA violations", async ({ page }) => {
      await page.goto("/en/login");
      await expect(page.getByLabel("USERNAME")).toBeEnabled({ timeout: 15_000 });

      await expectNoViolations(page);
    });

    test.describe("admin pages", () => {
      test.beforeEach(async ({ page }) => {
        await seedAdminSession(page);
        await mockAdminApis(page);
      });

      test("dashboard page has no WCAG A/AA violations", async ({ page }) => {
        await page.goto("/en/dashboard");
        await expect(page.getByText("openai-primary").first()).toBeVisible({ timeout: 15_000 });

        await expectNoViolations(page);
      });

      test("keys page has no WCAG A/AA violations", async ({ page }) => {
        await page.goto("/en/keys");
        await expect(page.getByText("visual-baseline-key").first()).toBeVisible({
          timeout: 15_000,
        });

        await expectNoViolations(page);
      });

      test("upstreams page has no WCAG A/AA violations", async ({ page }) => {
        await page.goto("/en/upstreams");
        await expect(page.getByText("anthropic-backup").first()).toBeVisible({ timeout: 15_000 });

        await expectNoViolations(page);
      });

      test("upstream detail page has no WCAG A/AA violations", async ({ page }) => {
        await page.goto(`/en/upstreams/${UPSTREAM_DETAIL.id}`);
        await expect(page.getByText(UPSTREAM_DETAIL.name).first()).toBeVisible({
          timeout: 15_000,
        });

        await expectNoViolations(page);
      });
    });
  });
}
