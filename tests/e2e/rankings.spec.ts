import { expect, test } from "@playwright/test";

import { mockAdminApis, RANKINGS_FIXTURES, seedAdminSession } from "../support/admin-page-mocks";

// 排行榜页 E2E（mock API）：默认维度渲染、维度切换、列头排序（第一名互换）、
// 行展开构成明细、「查看日志」跳转 logs 携带过滤参数、返回后视图状态不丢
// （dim/sort 等状态 URL 化，见 rankings-url-state.ts）。

const [UPSTREAM_TOP, UPSTREAM_COSTLY] = RANKINGS_FIXTURES.upstreams;

test.describe("Rankings page", () => {
  test.beforeEach(async ({ page }) => {
    await seedAdminSession(page);
    await mockAdminApis(page);
  });

  test("renders the default upstream rankings", async ({ page }) => {
    await page.goto("/zh-CN/rankings");

    await expect(page.getByRole("tab", { name: "上游" })).toHaveAttribute("aria-selected", "true");
    const rows = page.getByTestId("rankings-row");
    await expect(rows).toHaveCount(2);
    // 默认按请求数降序：openai-primary 第一。
    await expect(rows.first()).toContainText(UPSTREAM_TOP.name);
    // 错误率 6% 命中告警配色阈值，同时验证列渲染。
    await expect(rows.nth(1)).toContainText("6.0%");
  });

  test("switches dimension and reflects it in the URL", async ({ page }) => {
    await page.goto("/zh-CN/rankings");

    await page.getByRole("tab", { name: "模型" }).click();

    await expect(page).toHaveURL(/dim=models/);
    const rows = page.getByTestId("rankings-row");
    await expect(rows.first()).toContainText("gpt-4.1");
    // claude-3-opus 的 comparison.prev_rank 为 null → 新上榜徽标。
    await expect(page.getByText("新上榜")).toBeVisible();
  });

  test("sorting by cost flips first place and lands in the URL", async ({ page }) => {
    await page.goto("/zh-CN/rankings");

    await page.getByRole("button", { name: "费用" }).click();

    await expect(page).toHaveURL(/sort=cost/);
    await expect(page.getByTestId("rankings-row").first()).toContainText(UPSTREAM_COSTLY.name);
  });

  test("expands a row, jumps to filtered logs, and returns with the view state intact", async ({
    page,
  }) => {
    await page.goto("/zh-CN/rankings");

    // 先制造一个非默认视图状态（按费用排序），验证往返后不丢。
    // router.replace 走 React transition，先等 URL 落地再继续点击，
    // 否则 Link 的 push 可能抢在 replace 提交之前，history 条目丢掉查询串。
    await page.getByRole("button", { name: "费用" }).click();
    await expect(page).toHaveURL(/sort=cost/);
    const firstRow = page.getByTestId("rankings-row").first();
    await expect(firstRow).toContainText(UPSTREAM_COSTLY.name);

    await firstRow.click();
    const detailRow = page.getByTestId("rankings-detail-row");
    await expect(detailRow).toBeVisible();
    await expect(detailRow).toContainText("模型构成");

    await detailRow.getByRole("link", { name: "查看日志" }).click();

    await expect(page).toHaveURL(new RegExp(`/zh-CN/logs\\?.*upstream_id=${UPSTREAM_COSTLY.id}`));
    await expect(page).toHaveURL(/start_time=/);
    // logs 页从 URL 参数初始化了上游过滤（Phase 4 行为的端到端验证）。
    await expect(page.getByRole("combobox", { name: "上游" })).toContainText(UPSTREAM_COSTLY.name);

    await page.goBack();

    await expect(page).toHaveURL(/\/zh-CN\/rankings\?.*sort=cost/);
    await expect(page.getByTestId("rankings-row").first()).toContainText(UPSTREAM_COSTLY.name);
  });
});
