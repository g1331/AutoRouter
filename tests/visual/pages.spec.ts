import { test, expect, type Page } from "@playwright/test";

import {
  mockAdminApis,
  seedAdminSession,
  seedTheme,
  UPSTREAM_DETAIL,
} from "../support/admin-page-mocks";

// 视觉回归基线：login / dashboard / keys / upstreams 四张 fullPage 快照。
// 基线在本地 Windows 生成（快照文件带 -win32 平台后缀）；CI 平台字体渲染
// 不同会必然 diff，因此该套件不接入 verify.yml，仅作本地改版前后的回归工具。
// 运行：pnpm test:visual；重建基线：pnpm test:visual --update-snapshots

const SNAPSHOT_OPTIONS = {
  fullPage: true,
  animations: "disabled",
} as const;

async function gotoAndSettle(page: Page, path: string, readySelector: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator(readySelector).first()).toBeVisible({ timeout: 15_000 });
}

test.describe("Visual Regression", () => {
  test.beforeEach(async ({ page }) => {
    await seedTheme(page, "dark");
  });

  test("login page visual snapshot", async ({ page }) => {
    await page.goto("/en/login");
    await expect(page.getByLabel("USERNAME")).toBeEnabled({ timeout: 15_000 });

    await expect(page).toHaveScreenshot("login.png", SNAPSHOT_OPTIONS);
  });

  test.describe("admin pages", () => {
    test.beforeEach(async ({ page }) => {
      await seedAdminSession(page);
      await mockAdminApis(page);
    });

    test("dashboard page visual snapshot", async ({ page }) => {
      // 拓扑面板渲染出 mock 上游节点后页面才算就绪。
      await gotoAndSettle(page, "/en/dashboard", "text=openai-primary");

      await expect(page).toHaveScreenshot("dashboard.png", SNAPSHOT_OPTIONS);
    });

    test("keys page visual snapshot", async ({ page }) => {
      await gotoAndSettle(page, "/en/keys", "text=visual-baseline-key");

      await expect(page).toHaveScreenshot("keys.png", SNAPSHOT_OPTIONS);
    });

    test("upstreams page visual snapshot", async ({ page }) => {
      await gotoAndSettle(page, "/en/upstreams", "text=anthropic-backup");

      await expect(page).toHaveScreenshot("upstreams.png", SNAPSHOT_OPTIONS);
    });

    test("upstream detail page visual snapshot", async ({ page }) => {
      // 分区导航渲染出上游名称后再截图，避免拍到骨架态。
      await gotoAndSettle(
        page,
        `/en/upstreams/${UPSTREAM_DETAIL.id}`,
        `text=${UPSTREAM_DETAIL.name}`
      );

      await expect(page).toHaveScreenshot("upstream-detail.png", SNAPSHOT_OPTIONS);
    });
  });
});
