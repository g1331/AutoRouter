import { expect, test, type Page, type Route } from "@playwright/test";

// 管理员用户管理页 E2E（mock API）：用户列表渲染与角色/状态展示。
// 创建、改名、重置密码、上游授权等写操作的服务端行为由
// tests/unit/api/admin/users.test.ts 与相关组件测试覆盖。

function seedAdminToken(page: Page): Promise<void> {
  return page.addInitScript(() => {
    window.localStorage.setItem("admin_token", "e2e-admin-token");
  });
}

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

const USERS_PAYLOAD = {
  items: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      username: "alice",
      display_name: "Alice Doe",
      role: "admin",
      is_active: true,
      api_key_count: 2,
      month_requests: 42,
      month_cost_usd: 1.25,
      created_at: new Date("2026-06-01T00:00:00.000Z").toISOString(),
      updated_at: new Date("2026-06-01T00:00:00.000Z").toISOString(),
    },
    {
      id: "00000000-0000-4000-8000-000000000002",
      username: "bob",
      display_name: "Bob Smith",
      role: "member",
      is_active: false,
      api_key_count: 0,
      month_requests: 0,
      month_cost_usd: 0,
      created_at: new Date("2026-06-02T00:00:00.000Z").toISOString(),
      updated_at: new Date("2026-06-02T00:00:00.000Z").toISOString(),
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
  total_pages: 1,
};

// The live pulse bar in the dashboard layout opens a stats/live connection on
// every page; a bare `{}` from the catch-all crashes its rendering, so stub the
// real snapshot shape explicitly.
function mockLivePulse(page: Page): Promise<void> {
  const snapshot = {
    requestsPerMinute: 0,
    errorRatePct: 0,
    avgLatencyMs: 0,
    tokensPerMinute: 0,
    sampleCount: 0,
    windowSeconds: 60,
    generatedAt: new Date().toISOString(),
    gateway: { healthyUpstreams: 0, totalUpstreams: 0, openCircuitBreakers: 0 },
  };

  return page.route("**/api/admin/stats/live**", (route) => fulfillJson(route, 200, snapshot));
}

test.describe("User management page", () => {
  test("renders the user list with role and status", async ({ page }) => {
    await seedAdminToken(page);
    await page.route("**/api/admin/**", (route) => fulfillJson(route, 200, {}));
    await mockLivePulse(page);
    await page.route("**/api/admin/users**", (route) => fulfillJson(route, 200, USERS_PAYLOAD));

    await page.goto("/en/system/users");

    await expect(page.getByText("Alice Doe")).toBeVisible();
    await expect(page.getByText("alice", { exact: true })).toBeVisible();
    await expect(page.getByText("Bob Smith")).toBeVisible();
    await expect(page.getByText("bob", { exact: true })).toBeVisible();
  });
});
