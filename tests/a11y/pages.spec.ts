import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

import {
  KEY_DETAIL,
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

      test("key detail page has no WCAG A/AA violations", async ({ page }) => {
        await page.goto(`/en/keys/${KEY_DETAIL.id}`);
        await expect(page.getByText(KEY_DETAIL.name).first()).toBeVisible({
          timeout: 15_000,
        });

        await expectNoViolations(page);
      });

      test("billing page has no WCAG A/AA violations", async ({ page }) => {
        await page.goto("/en/system/billing");
        // 价目目录在桌面/移动两套布局各渲染一份 gpt-4.1，getByText().first() 会先命中
        // 视口下隐藏的那一份；未匹配价的模型只在待处理表里渲染一次，用它当就绪信号。
        await expect(page.getByText("custom-unpriced-model").first()).toBeVisible({
          timeout: 15_000,
        });

        await expectNoViolations(page);
      });

      test("logs page has no WCAG A/AA violations", async ({ page }) => {
        // LogsTable 按 isMobileLayout 状态二选一渲染桌面表格/移动卡片，默认桌面
        // 视口下不会像 billing 价目目录那样重复命中，first() 只是防御性写法。
        await page.goto("/en/logs");
        await expect(page.getByText("gpt-4.1").first()).toBeVisible({ timeout: 15_000 });

        await expectNoViolations(page);
      });
    });
  });
}
