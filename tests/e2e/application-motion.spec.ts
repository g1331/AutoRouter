import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { mockApplicationPages } from "../support/application-page-mocks";
import {
  KEY_DETAIL,
  LOGS_PAGE,
  mockAdminApis,
  seedAdminSession,
  seedTheme,
} from "../support/admin-page-mocks";

test.use({ contextOptions: { reducedMotion: "no-preference" } });

test("移动偏好连续切换、语言保留查询参数并清理浮层", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await mockApplicationPages(page, true);
  await page.goto("/en/portal/requests?model=gpt-4.1");
  for (const [name, theme] of [
    ["Light Mode", "light"],
    ["Dark Mode", "dark"],
    ["Light Mode", "light"],
  ]) {
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("menuitemradio", { name, exact: true }).click();
    await expect(page.locator("html")).toHaveClass(new RegExp(theme));
  }
  await expect(page.locator("html")).not.toHaveClass(/theme-switching/);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "简体中文", exact: true }).click();
  await expect(page).toHaveURL(/\/zh-CN\/portal\/requests\?model=gpt-4.1$/);
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(page.locator("html")).not.toHaveAttribute("data-page-transition");
  expect(await page.evaluate(() => document.body.style.pointerEvents)).not.toBe("none");
});

test.beforeEach(async ({ page }) => {
  await seedAdminSession(page);
  await seedTheme(page, "dark");
  await mockAdminApis(page);
  await page.route("**/api/admin/traffic-recordings?*", (route) =>
    route.fulfill({ json: { items: [], total: 0, page: 1, page_size: 1 } })
  );
});

test("请求详情双向改变真实高度，快速反向保留最新状态和焦点", async ({ page }, info) => {
  await page.route("**/api/admin/logs?**", (route) =>
    route.fulfill({
      json: {
        ...LOGS_PAGE,
        items: Array.from({ length: 20 }, (_, index) => ({
          ...LOGS_PAGE.items[index % LOGS_PAGE.items.length],
          id: `motion-log-${index}`,
        })),
        total: 20,
      },
    })
  );
  await page.goto("/en/logs");
  const trigger = page
    .getByRole("button", { name: "Expand failover details", exact: true })
    .first();
  await expect(trigger).toBeVisible();
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
    false
  );
  const id = await trigger.getAttribute("aria-controls");
  expect(id).toBeTruthy();
  const detail = page.locator(`[id="${id}"]`);
  const sample = await trigger.evaluate(async (button) => {
    (button as HTMLButtonElement).click();
    const values: number[] = [];
    const frames: number[] = [];
    let previous = performance.now();
    for (let frame = 0; frame < 24; frame++) {
      await new Promise(requestAnimationFrame);
      const now = performance.now();
      frames.push(now - previous);
      previous = now;
      const element = document.getElementById(button.getAttribute("aria-controls")!);
      values.push(element?.getBoundingClientRect().height ?? 0);
    }
    return { heights: values, frames };
  });
  const { heights } = sample;
  await writeFile(info.outputPath("motion-sample.json"), JSON.stringify(sample));
  await info.attach("twenty-row-motion-sample", {
    body: JSON.stringify(sample),
    contentType: "application/json",
  });
  expect(heights.at(-1)).toBeGreaterThan(100);
  expect(new Set(heights.map(Math.round)).size, JSON.stringify(heights)).toBeGreaterThan(2);
  const collapse = page
    .getByRole("button", { name: "Collapse failover details", exact: true })
    .first();
  await collapse.click();
  await expect(detail).toHaveAttribute("inert");
  await page
    .getByRole("button", { name: "Expand failover details", exact: true })
    .first()
    .click({ force: true });
  await expect(detail).toHaveAttribute("aria-hidden", "false");
  await expect(detail).toBeVisible();
  await page
    .getByRole("button", { name: "Collapse failover details", exact: true })
    .first()
    .click();
  await expect(detail).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Expand failover details", exact: true }).first()
  ).toBeFocused();
  const remaining = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation.effect instanceof KeyframeEffect &&
            animation.effect.target?.id.startsWith("log-detail-")
        ).length
  );
  expect(remaining).toBe(0);
});

test("路由切换保持导航，连续切换后不残留快照", async ({ page }) => {
  await page.goto("/en/keys");
  const navigation = page.getByRole("navigation", { name: "Main navigation", exact: true });
  await expect(navigation).toBeVisible();
  await page.getByRole("link", { name: "Logs", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/logs/);
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/dashboard/);
  await expect(navigation).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-page-transition");
  await page.goBack();
  await expect(page).toHaveURL(/\/en\/logs/);
  await expect(navigation).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-page-transition");
});

test("移动端减少动态效果时详情立即可读，收起不留焦点或动画", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/en/logs");
  const trigger = page
    .getByRole("button", { name: "Expand failover details", exact: true })
    .first();
  await expect(trigger).toBeVisible();
  const id = await trigger.getAttribute("aria-controls");
  await trigger.click();
  const detail = page.locator(`[id="${id}"]`);
  await expect(detail).toBeVisible();
  await expect.poll(() => detail.evaluate((element) => element.getAnimations().length)).toBe(0);
  await page
    .getByRole("button", { name: "Collapse failover details", exact: true })
    .first()
    .click();
  await expect(detail).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Expand failover details", exact: true }).first()
  ).toBeFocused();
});

test("来源排序支持键盘与触屏按钮，保留来源身份并播报位置", async ({ page }) => {
  await page.route("**/api/admin/compensation-rules", (route) =>
    route.fulfill({ json: { data: [] } })
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/system/header-compensation");
  await page.getByRole("button", { name: "Add Rule", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const sourceInput = dialog.getByRole("textbox", { name: /source|header/i }).last();
  await sourceInput.fill("x-first");
  await sourceInput.press("Enter");
  await sourceInput.fill("x-second");
  await sourceInput.press("Enter");
  await dialog.getByRole("button", { name: "Move x-second up", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog.getByRole("status")).toHaveText("x-second moved to position 1");
  await expect(
    dialog.getByRole("button", { name: "Move x-second up", exact: true })
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Move x-second down", exact: true })
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Move x-second down", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("x-second moved to position 2");
  await expect(
    dialog.getByRole("button", { name: "Move x-second down", exact: true })
  ).toBeDisabled();
});

test("缺少快照能力仍能导航，创建弹窗退出恢复触发按钮焦点", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(document, "startViewTransition", { value: undefined })
  );
  await page.goto("/en/dashboard");
  await page.getByRole("link", { name: "API Keys", exact: true }).click();
  const create = page.getByRole("button", { name: "Create API Key", exact: true });
  await create.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(create).toBeFocused();
  await expect(page.locator("html")).not.toHaveAttribute("data-page-transition");
});

test("慢搜索保留旧结果且不挤动表格，完成后只呈现最新内容", async ({ page }) => {
  await page.goto("/en/keys");
  await expect(page.getByText(KEY_DETAIL.name, { exact: true }).first()).toBeVisible();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/keys?*", async (route) => {
    await pending;
    await route.fulfill({
      json: {
        items: [{ ...KEY_DETAIL, name: "Latest result" }],
        total: 1,
        page: 1,
        page_size: 10,
        total_pages: 1,
      },
    });
  });
  const table = page.getByRole("table");
  const before = await table.boundingBox();
  await page.getByPlaceholder("Search keys by name...").fill("Latest");
  await expect(page.getByText("Updating results…", { exact: true })).toBeVisible();
  await expect(page.getByText(KEY_DETAIL.name, { exact: true }).first()).toBeVisible();
  expect((await table.boundingBox())?.y).toBe(before?.y);
  release();
  await expect(page.getByText("Latest result", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Updating results…", { exact: true })).toBeHidden();
});

test("图表指标快速切换保留最新读数并记录帧间隔", async ({ page }, info) => {
  await mockApplicationPages(page, true);
  await page.goto("/en/portal");
  const cost = page.getByRole("button", { name: "Cost", exact: true });
  await expect(cost).toBeVisible();
  await expect(page.locator(".recharts-area-curve")).toHaveCount(1);
  const frames = await cost.evaluate(async (button) => {
    (button as HTMLButtonElement).click();
    const values: number[] = [];
    let previous = performance.now();
    for (let index = 0; index < 24; index++) {
      await new Promise(requestAnimationFrame);
      const now = performance.now();
      values.push(now - previous);
      previous = now;
    }
    return values;
  });
  await expect(cost).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Tokens", exact: true }).click();
  await page.getByRole("button", { name: "Requests", exact: true }).click();
  await expect(page.getByRole("button", { name: "Requests", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.locator(".recharts-area-curve")).toHaveCount(1);
  await writeFile(info.outputPath("chart-sample.json"), JSON.stringify({ frames }));
});

test("补偿规则保存失败保留草稿，重试成功才关闭", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let failed = true;
  await page.route("**/api/admin/compensation-rules", (route) => {
    if (route.request().method() === "POST")
      return route.fulfill(
        failed
          ? { status: 500, json: { detail: "Local save failure" } }
          : { json: { data: { id: "saved-rule" } } }
      );
    return route.fulfill({ json: { data: [] } });
  });
  await page.goto("/en/system/header-compensation");
  await page.getByRole("button", { name: "Add Rule", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("e.g., Session ID Recovery").fill("Draft rule");
  await dialog.getByPlaceholder("e.g., session_id", { exact: true }).fill("x-session-id");
  await dialog.getByRole("button", { name: "OpenAI OpenAI Chat", exact: true }).click();
  const source = dialog.getByPlaceholder("e.g., headers.session_id");
  await source.fill("headers.session_id");
  await source.press("Enter");
  await dialog.getByRole("button", { name: "Add Rule", exact: true }).click();
  await expect(page.getByText("Local save failure", { exact: true })).toBeVisible();
  await expect(dialog.getByPlaceholder("e.g., Session ID Recovery")).toHaveValue("Draft rule");
  failed = false;
  await dialog.getByRole("button", { name: "Add Rule", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});
