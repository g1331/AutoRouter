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

// KPI 卡 sparkline（requests/tokens/cost 三个 metric）与用量图共用的
// timeseries 接口返回最小合法结构，避免仪表盘挂载期请求打到 catch-all
// 后组件走进非真实的数据分支。
const ADMIN_TIMESERIES = {
  range: "today",
  granularity: "hour",
  series: [],
  total_series: [
    {
      timestamp: new Date("2026-06-10T08:00:00.000Z").toISOString(),
      request_count: 12,
      total_tokens: 3400,
      avg_duration_ms: 820,
      total_cost: 0.12,
    },
    {
      timestamp: new Date("2026-06-10T09:00:00.000Z").toISOString(),
      request_count: 20,
      total_tokens: 5100,
      avg_duration_ms: 760,
      total_cost: 0.2,
    },
  ],
  period_summary: {
    request_count: 32,
    total_tokens: 8500,
    avg_ttft_ms: 640,
    avg_duration_ms: 790,
    avg_tps: 42,
    total_cost: 0.32,
  },
};

// 路由拓扑面板挂载期请求：上游列表、健康状态与 live pulse 快照都返回
// 最小合法结构（catch-all 的 {} 会让面板走进空态分支）。
const ADMIN_UPSTREAMS = {
  items: [
    {
      id: "00000000-0000-4000-8000-00000000aa01",
      name: "openai-primary",
      priority: 1,
      weight: 10,
      is_active: true,
      circuit_breaker: {
        state: "closed",
        failure_count: 0,
        success_count: 10,
        last_failure_at: null,
        opened_at: null,
        config: null,
      },
    },
  ],
  total: 1,
  page: 1,
  page_size: 50,
  total_pages: 1,
};

const ADMIN_UPSTREAM_HEALTH = {
  data: [
    {
      upstream_id: "00000000-0000-4000-8000-00000000aa01",
      upstream_name: "openai-primary",
      is_healthy: true,
      last_check_at: new Date("2026-06-10T09:00:00.000Z").toISOString(),
      last_success_at: new Date("2026-06-10T09:00:00.000Z").toISOString(),
      failure_count: 0,
      latency_ms: 42,
      error_message: null,
    },
  ],
  total: 1,
};

const LIVE_PULSE_SNAPSHOT = {
  requestsPerMinute: 24,
  errorRatePct: 0,
  avgLatencyMs: 800,
  tokensPerMinute: 4200,
  sampleCount: 24,
  windowSeconds: 60,
  generatedAt: new Date("2026-06-10T09:00:00.000Z").toISOString(),
  gateway: { healthyUpstreams: 1, totalUpstreams: 1, openCircuitBreakers: 0 },
};

// 管理后台接口兜底：令牌探针与仪表盘数据请求都以空对象成功返回，
// 该流程只断言路由落点，不断言后台页面内容。
async function mockAdminApis(page: Page): Promise<void> {
  await page.route("**/api/admin/**", (route) => fulfillJson(route, 200, {}));
  await page.route("**/api/admin/stats/timeseries**", (route) =>
    fulfillJson(route, 200, ADMIN_TIMESERIES)
  );
  await page.route("**/api/admin/upstreams?page=**", (route) =>
    fulfillJson(route, 200, ADMIN_UPSTREAMS)
  );
  await page.route("**/api/admin/upstreams/health**", (route) =>
    fulfillJson(route, 200, ADMIN_UPSTREAM_HEALTH)
  );
  // useLivePulse 的 SSE 连接读不到事件流会自动降级为快照轮询，两种形态都回同一份快照。
  await page.route("**/api/admin/stats/live**", (route) =>
    fulfillJson(route, 200, LIVE_PULSE_SNAPSHOT)
  );
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
