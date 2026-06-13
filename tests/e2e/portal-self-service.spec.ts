import { expect, test, type Page, type Route } from "@playwright/test";

// member 自助门户 E2E（mock API）：概览页统计与趋势渲染、自助密钥列表
// 与启用/停用开关的请求行为。密钥归属、access_mode 强制与支出规则收紧等
// 服务端约束由 tests/unit/services/user-key-service.test.ts 与
// tests/unit/api/user/key-routes.test.ts 覆盖。

function makeMemberJwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ sub: "00000000-0000-4000-8000-000000000001", role: "member" });
  return `${header}.${payload}.e2e-signature`;
}

function seedMemberToken(page: Page): Promise<void> {
  return page.addInitScript((value) => {
    window.sessionStorage.setItem("admin_token", value);
  }, makeMemberJwt());
}

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

const PORTAL_KEY = {
  id: "key-e2e-1",
  key_prefix: "sk-test-12345678",
  name: "my-portal-key",
  description: null,
  access_mode: "restricted",
  upstream_ids: ["upstream-1"],
  allowed_models: null,
  spending_rules: null,
  spending_rule_statuses: [],
  is_quota_exceeded: false,
  is_active: true,
  expires_at: null,
  created_at: new Date("2026-06-01T00:00:00.000Z").toISOString(),
  updated_at: new Date("2026-06-01T00:00:00.000Z").toISOString(),
};

async function mockPortalApis(page: Page): Promise<void> {
  await page.route("**/api/user/**", (route) => fulfillJson(route, 200, {}));
  await page.route("**/api/auth/me", (route) =>
    fulfillJson(route, 200, {
      kind: "user",
      role: "member",
      username: "alice",
      displayName: "Alice",
    })
  );
  await page.route("**/api/user/overview", (route) =>
    fulfillJson(route, 200, {
      today_requests: 42,
      month_requests: 120,
      month_cost_usd: 3.5,
      total_requests: 500,
      total_cost_usd: 12.34,
      active_key_count: 2,
      total_key_count: 3,
    })
  );
  await page.route("**/api/user/usage**", (route) =>
    fulfillJson(route, 200, {
      range: "7d",
      granularity: "day",
      points: [
        {
          timestamp: new Date("2026-06-10T00:00:00.000Z").toISOString(),
          request_count: 10,
          total_tokens: 1000,
          total_cost_usd: 0.5,
        },
      ],
    })
  );
  await page.route("**/api/user/upstreams", (route) =>
    fulfillJson(route, 200, { items: [{ id: "upstream-1", name: "alpha" }] })
  );
}

test.describe("Portal self-service", () => {
  test.beforeEach(async ({ page }) => {
    await seedMemberToken(page);
    await mockPortalApis(page);
  });

  test("overview page renders the member's personal aggregates", async ({ page }) => {
    await page.goto("/en/portal");

    await expect(page.getByText("Today's Requests")).toBeVisible();
    await expect(page.getByText("42", { exact: true })).toBeVisible();
    await expect(page.getByText("Active Keys")).toBeVisible();
    await expect(page.getByText("Usage Trend")).toBeVisible();
  });

  test("keys page lists the member's keys and toggles one inactive", async ({ page }) => {
    const putBodies: Array<Record<string, unknown>> = [];
    await page.route("**/api/user/keys**", async (route) => {
      const request = route.request();
      if (request.method() === "PUT") {
        putBodies.push(request.postDataJSON() as Record<string, unknown>);
        return fulfillJson(route, 200, { ...PORTAL_KEY, is_active: false });
      }
      return fulfillJson(route, 200, {
        items: [PORTAL_KEY],
        total: 1,
        page: 1,
        page_size: 10,
        total_pages: 1,
      });
    });

    await page.goto("/en/portal/keys");

    await expect(page.getByText("my-portal-key")).toBeVisible();

    await page.getByRole("switch").first().click();

    await expect.poll(() => putBodies.length).toBeGreaterThan(0);
    expect(putBodies[0]).toEqual({ is_active: false });
  });
});
