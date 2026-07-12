import { expect, test, type Page, type Route } from "@playwright/test";

import { mockAdminApis, seedAdminSession, UPSTREAM_DETAIL } from "../support/admin-page-mocks";

// 上游详情页 E2E（mock API）：页头 + 分区导航渲染、13 个分区锚点存在、
// 单分区编辑触发 dirty 态并发出只含本分区字段的 partial PUT、404 分支、
// 返回按钮回列表页。列表页（upstreams-table）的行为由另一份 spec 覆盖，
// 本文件不断言列表页内容。

const SECTION_IDS = [
  "basic-name",
  "basic-profile",
  "basic-route-endpoint",
  "basic-api-key",
  "basic-diagnostics",
  "priority-weight",
  "model-routing",
  "billing-multipliers",
  "spending-quota",
  "capacity-control",
  "circuit-breaker",
  "failure-rules",
  "affinity-migration",
] as const;

const MISSING_UPSTREAM_ID = "00000000-0000-4000-8000-00000000ff99";

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/**
 * Overrides the GET/PUT stub for the fixture upstream registered by
 * mockAdminApis (Playwright runs the most-recently-registered matching route
 * first), so PUT requests can be captured for the partial-payload assertion
 * while GET keeps returning the same detail fixture.
 */
async function mockUpstreamDetailPut(
  page: Page,
  onPut: (payload: Record<string, unknown>) => void
): Promise<void> {
  await page.route(`**/api/admin/upstreams/${UPSTREAM_DETAIL.id}`, async (route) => {
    if (route.request().method() !== "PUT") {
      await fulfillJson(route, 200, UPSTREAM_DETAIL);
      return;
    }
    const payload = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    onPut(payload);
    await fulfillJson(route, 200, { ...UPSTREAM_DETAIL, ...payload });
  });
}

test.describe("Upstream detail page", () => {
  test.beforeEach(async ({ page }) => {
    await seedAdminSession(page);
    await mockAdminApis(page);
  });

  test("renders the page header and left section navigation", async ({ page }) => {
    await page.goto(`/zh-CN/upstreams/${UPSTREAM_DETAIL.id}`);

    await expect(page.getByRole("navigation", { name: "上游详情" })).toBeVisible();
    await expect(page.getByText(UPSTREAM_DETAIL.name, { exact: true }).first()).toBeVisible();
    await expect(page.getByText("基础配置", { exact: true })).toBeVisible();
    await expect(page.getByText("路由与计费策略", { exact: true })).toBeVisible();
    await expect(page.getByText("稳定性策略", { exact: true })).toBeVisible();
  });

  test("renders anchors for all 13 sections", async ({ page }) => {
    await page.goto(`/zh-CN/upstreams/${UPSTREAM_DETAIL.id}`);

    for (const sectionId of SECTION_IDS) {
      await expect(page.locator(`#${sectionId}`)).toBeVisible();
    }
  });

  test("editing a field marks the section dirty and PUTs only that section's fields", async ({
    page,
  }) => {
    let capturedPayload: Record<string, unknown> | null = null;
    await mockUpstreamDetailPut(page, (payload) => {
      capturedPayload = payload;
    });

    await page.goto(`/zh-CN/upstreams/${UPSTREAM_DETAIL.id}`);

    const prioritySection = page.locator("#priority-weight");
    await prioritySection.getByLabel("权重").fill("42");

    await expect(prioritySection.getByText("未保存的更改")).toBeVisible();
    const saveButton = prioritySection.getByRole("button", { name: "保存" });
    await expect(saveButton).toBeEnabled();

    await saveButton.click();

    await expect.poll(() => capturedPayload).not.toBeNull();
    expect(capturedPayload).toEqual({ priority: UPSTREAM_DETAIL.priority, weight: 42 });
  });

  test("shows the not-found state for a non-existent id", async ({ page }) => {
    await page.route(`**/api/admin/upstreams/${MISSING_UPSTREAM_ID}`, (route) =>
      fulfillJson(route, 404, { error: "Upstream not found" })
    );

    await page.goto(`/zh-CN/upstreams/${MISSING_UPSTREAM_ID}`);

    await expect(page.getByText("未找到该上游")).toBeVisible();
    await expect(page.getByText("该上游可能已被删除，或链接无效。")).toBeVisible();
  });

  test("shows the load-error state on a 500 and recovers on retry", async ({ page }) => {
    // Fail every GET of the first query (initial attempt + the query client's
    // one retry) so it settles into the error state; the GETs triggered by the
    // retry button then succeed.
    let getCount = 0;
    await page.route(`**/api/admin/upstreams/${UPSTREAM_DETAIL.id}`, async (route) => {
      if (route.request().method() !== "GET") {
        await fulfillJson(route, 200, UPSTREAM_DETAIL);
        return;
      }
      getCount += 1;
      if (getCount <= 2) {
        await fulfillJson(route, 500, { error: "Internal server error" });
        return;
      }
      await fulfillJson(route, 200, UPSTREAM_DETAIL);
    });

    await page.goto(`/zh-CN/upstreams/${UPSTREAM_DETAIL.id}`);

    await expect(page.getByText("加载上游失败")).toBeVisible();
    const retryButton = page.getByRole("button", { name: "重试" });
    await expect(retryButton).toBeVisible();

    await retryButton.click();

    await expect(page.getByText(UPSTREAM_DETAIL.name, { exact: true }).first()).toBeVisible();
    await expect(page.getByText("加载上游失败")).toBeHidden();
  });

  test("the back button returns to the upstreams list", async ({ page }) => {
    await page.goto(`/zh-CN/upstreams/${UPSTREAM_DETAIL.id}`);

    await page.getByRole("link", { name: "返回上游列表" }).click();

    await expect(page).toHaveURL(/\/zh-CN\/upstreams$/);
  });
});
