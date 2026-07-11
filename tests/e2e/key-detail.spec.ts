import { expect, test, type Page, type Route } from "@playwright/test";

import { KEY_DETAIL, mockAdminApis, seedAdminSession } from "../support/admin-page-mocks";

// API Key 详情页 E2E（mock API）：页头 + 分区导航渲染、5 个分区锚点存在、
// 单分区编辑触发 dirty 态并发出只含本分区字段的 partial PUT、404 分支、
// 返回按钮回列表页。列表页（keys-table）的行为由另一份 spec 覆盖，本文件
// 不断言列表页内容。镜像 tests/e2e/upstream-detail.spec.ts 的结构。

const SECTION_IDS = ["basic", "expiry", "access-grants", "spending-rules", "model-allowlist"];

const MISSING_KEY_ID = "00000000-0000-4000-8000-00000000ff98";

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/**
 * Overrides the GET/PUT stub for the fixture key registered by mockAdminApis
 * (Playwright runs the most-recently-registered matching route first), so PUT
 * requests can be captured for the partial-payload assertion while GET keeps
 * returning the same detail fixture.
 */
async function mockKeyDetailPut(
  page: Page,
  onPut: (payload: Record<string, unknown>) => void
): Promise<void> {
  await page.route(`**/api/admin/keys/${KEY_DETAIL.id}`, async (route) => {
    if (route.request().method() !== "PUT") {
      await fulfillJson(route, 200, KEY_DETAIL);
      return;
    }
    const payload = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    onPut(payload);
    await fulfillJson(route, 200, { ...KEY_DETAIL, ...payload });
  });
}

test.describe("Key detail page", () => {
  test.beforeEach(async ({ page }) => {
    await seedAdminSession(page);
    await mockAdminApis(page);
  });

  test("renders the page header and left section navigation", async ({ page }) => {
    await page.goto(`/zh-CN/keys/${KEY_DETAIL.id}`);

    await expect(page.getByRole("navigation", { name: "API 密钥详情" })).toBeVisible();
    await expect(page.getByText(KEY_DETAIL.name, { exact: true }).first()).toBeVisible();
    await expect(page.getByText("基础", { exact: true })).toBeVisible();
    await expect(page.getByText("访问与策略", { exact: true })).toBeVisible();
  });

  test("renders anchors for all 5 sections", async ({ page }) => {
    await page.goto(`/zh-CN/keys/${KEY_DETAIL.id}`);

    for (const sectionId of SECTION_IDS) {
      await expect(page.locator(`#${sectionId}`)).toBeVisible();
    }
  });

  test("editing the basic section marks it dirty and PUTs only that section's fields", async ({
    page,
  }) => {
    let capturedPayload: Record<string, unknown> | null = null;
    await mockKeyDetailPut(page, (payload) => {
      capturedPayload = payload;
    });

    await page.goto(`/zh-CN/keys/${KEY_DETAIL.id}`);

    const basicSection = page.locator("#basic");
    await basicSection.getByLabel("名称").fill("Renamed Key");

    await expect(basicSection.getByText("未保存的更改")).toBeVisible();
    const saveButton = basicSection.getByRole("button", { name: "保存" });
    await expect(saveButton).toBeEnabled();

    await saveButton.click();

    await expect.poll(() => capturedPayload).not.toBeNull();
    expect(capturedPayload).toEqual({
      name: "Renamed Key",
      description: KEY_DETAIL.description,
      is_active: KEY_DETAIL.is_active,
    });
  });

  test("shows the not-found state for a non-existent id", async ({ page }) => {
    await page.route(`**/api/admin/keys/${MISSING_KEY_ID}`, (route) =>
      fulfillJson(route, 404, { error: "API key not found" })
    );

    await page.goto(`/zh-CN/keys/${MISSING_KEY_ID}`);

    await expect(page.getByText("密钥不存在")).toBeVisible();
    await expect(page.getByText("该密钥可能已被吊销，或链接无效。")).toBeVisible();
  });

  test("the back button returns to the keys list", async ({ page }) => {
    await page.goto(`/zh-CN/keys/${KEY_DETAIL.id}`);

    await page.getByRole("link", { name: "返回密钥列表" }).click();

    await expect(page).toHaveURL(/\/zh-CN\/keys$/);
  });
});
