import { expect, test, type Page, type Route } from "@playwright/test";

// 多用户体系的登录与角色分流 E2E（mock API）：
// - 账号登录（member）落地自助门户，管理员令牌登录落地管理后台
// - member 访问管理后台、管理员身份访问门户时被客户端守卫送回各自首页
// - 用户被停用后（用户侧接口返回 401），会话被终止并回到登录页
// 服务端的 requireAdmin / requireUser 越权 403 行为由单元测试覆盖
// （tests/unit/api/admin/role-guard-regression.test.ts、tests/unit/api/user/）。

function makeUserJwt(role: "admin" | "member"): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ sub: "00000000-0000-4000-8000-000000000001", role });
  return `${header}.${payload}.e2e-signature`;
}

// The admin session JWT minted by /api/auth/token-login carries only the
// admin_session scope; the client decodes (does not verify) it to derive the
// super-admin principal.
function makeAdminSessionJwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ scope: "admin_session" });
  return `${header}.${payload}.e2e-signature`;
}

function seedToken(page: Page, token: string): Promise<void> {
  return page.addInitScript((value) => {
    // 用户 JWT（三段式）持久化到 localStorage；ADMIN_TOKEN 存 sessionStorage（会话级）。
    const storage = value.split(".").length === 3 ? window.localStorage : window.sessionStorage;
    storage.setItem("admin_token", value);
  }, token);
}

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

const MEMBER_ME = {
  kind: "user",
  role: "member",
  username: "alice",
  displayName: "Alice",
};

const MEMBER_OVERVIEW = {
  today_requests: 42,
  month_requests: 120,
  month_cost_usd: 3.5,
  total_requests: 500,
  total_cost_usd: 12.34,
  active_key_count: 2,
  total_key_count: 3,
};

const MEMBER_USAGE = {
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
};

// 门户页面的用户侧接口；后注册的精确 route 优先于 catch-all。
async function mockPortalApis(page: Page): Promise<void> {
  await page.route("**/api/user/**", (route) => fulfillJson(route, 200, {}));
  await page.route("**/api/auth/me", (route) => fulfillJson(route, 200, MEMBER_ME));
  await page.route("**/api/user/overview", (route) => fulfillJson(route, 200, MEMBER_OVERVIEW));
  await page.route("**/api/user/usage**", (route) => fulfillJson(route, 200, MEMBER_USAGE));
}

// 管理后台接口兜底：令牌探针与仪表盘数据请求都以空对象成功返回，
// 该流程只断言路由落点，不断言后台页面内容。
async function mockAdminApis(page: Page): Promise<void> {
  await page.route("**/api/admin/**", (route) => fulfillJson(route, 200, {}));
}

async function waitForLoginForm(page: Page): Promise<void> {
  await expect(page.getByLabel("USERNAME")).toBeEnabled({ timeout: 10_000 });
}

test.describe("Login role routing", () => {
  test("member account login lands on the self-service portal", async ({ page }) => {
    await mockPortalApis(page);
    await page.route("**/api/auth/login", (route) =>
      fulfillJson(route, 200, {
        token: makeUserJwt("member"),
        user: { id: "u-1", username: "alice", displayName: "Alice", role: "member" },
      })
    );

    await page.goto("/en/login");
    await waitForLoginForm(page);

    await page.getByLabel("USERNAME").fill("alice");
    await page.getByLabel("PASSWORD").fill("Sup3rSecret!");
    await page.getByRole("button", { name: "LOGIN" }).click();

    await expect(page).toHaveURL(/\/en\/portal$/);
    await expect(page.getByText("Today's Requests")).toBeVisible();
  });

  test("admin token login lands on the dashboard", async ({ page }) => {
    await mockAdminApis(page);
    // Token-mode login exchanges the ADMIN_TOKEN for a short-lived session JWT.
    await page.route("**/api/auth/token-login", (route) =>
      fulfillJson(route, 200, { token: makeAdminSessionJwt() })
    );

    await page.goto("/en/login");
    await waitForLoginForm(page);

    await page.getByRole("tab", { name: "ADMIN TOKEN" }).click();
    await page.getByLabel("ADMIN TOKEN").fill("e2e-admin-token");
    await page.getByRole("button", { name: "LOGIN" }).click();

    await expect(page).toHaveURL(/\/en\/dashboard$/);
  });
});

test.describe("Cross-role route guards", () => {
  test("a member visiting the dashboard is sent back to the portal", async ({ page }) => {
    await seedToken(page, makeUserJwt("member"));
    await mockPortalApis(page);
    await mockAdminApis(page);

    await page.goto("/en/dashboard");

    await expect(page).toHaveURL(/\/en\/portal$/);
    await expect(page.getByText("Today's Requests")).toBeVisible();
  });

  test("the admin token identity visiting the portal is sent back to the dashboard", async ({
    page,
  }) => {
    await seedToken(page, "e2e-admin-token");
    await mockAdminApis(page);

    await page.goto("/en/portal");

    await expect(page).toHaveURL(/\/en\/dashboard$/);
  });
});

test.describe("Disabled account session", () => {
  test("a disabled member is logged out when the API rejects the token", async ({ page }) => {
    await seedToken(page, makeUserJwt("member"));
    // 停用用户后服务端对所有用户侧请求返回 401，前端应清除会话回到登录页。
    await page.route("**/api/auth/me", (route) =>
      fulfillJson(route, 401, { error: "Account disabled" })
    );
    await page.route("**/api/user/**", (route) =>
      fulfillJson(route, 401, { error: "Account disabled" })
    );

    await page.goto("/en/portal");

    await expect(page).toHaveURL(/\/en\/login/);
  });
});
