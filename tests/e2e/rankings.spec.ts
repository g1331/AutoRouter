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

  test("filters by name search and min requests, then resets", async ({ page }) => {
    await page.goto("/zh-CN/rankings");
    const rows = page.getByTestId("rankings-row");
    await expect(rows).toHaveCount(2);

    // 名称搜索（300ms debounce 后进 URL）。
    await page.getByRole("textbox", { name: "搜索名称..." }).fill(UPSTREAM_COSTLY.name);
    await expect(page).toHaveURL(/q=/);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(UPSTREAM_COSTLY.name);

    // 叠加请求数下限，超过唯一匹配项的请求数 → 空态显示「无匹配条目」。
    await page.getByRole("spinbutton", { name: "最少请求数" }).fill("999999");
    await expect(page).toHaveURL(/min=999999/);
    await expect(page.getByText("无匹配条目")).toBeVisible();

    // 重置一键清空过滤并还原列表与 URL。
    await page.getByRole("button", { name: "重置筛选" }).click();
    await expect(rows).toHaveCount(2);
    await expect(page).not.toHaveURL(/q=|min=/);
  });

  test("restores filters from a shared URL and filters models by upstream", async ({ page }) => {
    // 直达带过滤的 URL：搜索词生效、输入框回填。
    await page.goto(`/zh-CN/rankings?q=${UPSTREAM_COSTLY.name}`);
    const rows = page.getByTestId("rankings-row");
    await expect(rows).toHaveCount(1);
    await expect(page.getByRole("textbox", { name: "搜索名称..." })).toHaveValue(
      UPSTREAM_COSTLY.name
    );

    // models 维度的上游过滤：claude-3-opus 仅由第二个上游提供。
    await page.goto("/zh-CN/rankings?dim=models");
    await expect(rows).toHaveCount(2);
    await page.getByRole("combobox", { name: "上游" }).click();
    await page.getByRole("option", { name: UPSTREAM_COSTLY.name }).click();
    await expect(page).toHaveURL(/upstream=/);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("claude-3-opus");

    // 切换维度丢弃维度特有的上游过滤。
    await page.getByRole("tab", { name: "上游" }).click();
    await expect(page).not.toHaveURL(/upstream=/);
    await expect(rows).toHaveCount(2);
  });
});
