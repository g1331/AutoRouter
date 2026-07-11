import type { Page, Route } from "@playwright/test";

// visual / a11y 两套 Playwright project 共用的管理后台页面 mock：
// 以确定性的接口响应渲染 dashboard / keys / upstreams，保证截图与 axe
// 扫描的页面内容跨运行一致。路由守卫与真实鉴权行为由 tests/e2e 覆盖。

// /api/auth/token-login 签发的 admin 会话 JWT 只被客户端解码（不验签），
// 用 admin_session scope 即可得到超管主体。
export function makeAdminSessionJwt(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ scope: "admin_session" });
  return `${header}.${payload}.visual-signature`;
}

/** 三段式用户 JWT 走 localStorage（与 auth-provider 的分流规则一致）。 */
export async function seedAdminSession(page: Page): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("admin_token", value);
  }, makeAdminSessionJwt());
}

/** 固定主题，避免截图 / axe 结果依赖宿主系统的 prefers-color-scheme。 */
export async function seedTheme(page: Page, theme: "dark" | "light"): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("autorouter-theme", value);
  }, theme);
}

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

const STATS_OVERVIEW = {
  today_requests: 1284,
  avg_response_time_ms: 820,
  total_tokens_today: 345_000,
  total_cost_today: 12.34,
  success_rate_today: 99.2,
  avg_ttft_ms: 640,
  cache_hit_rate: 0.35,
  yesterday_requests: 1100,
  yesterday_total_tokens: 300_000,
  yesterday_cost_usd: 10.5,
  yesterday_avg_response_time_ms: 900,
  yesterday_avg_ttft_ms: 700,
  yesterday_cache_hit_rate: 0.3,
};

const STATS_TIMESERIES = {
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

const UPSTREAMS_PAGE = {
  items: [
    {
      id: "00000000-0000-4000-8000-00000000aa01",
      name: "openai-primary",
      base_url: "https://api.openai.com",
      provider: "openai",
      priority: 1,
      weight: 10,
      is_active: true,
      model_redirects: null,
      created_at: new Date("2026-06-01T00:00:00.000Z").toISOString(),
      updated_at: new Date("2026-06-10T00:00:00.000Z").toISOString(),
      circuit_breaker: {
        state: "closed",
        failure_count: 0,
        success_count: 10,
        last_failure_at: null,
        opened_at: null,
        config: null,
      },
    },
    {
      id: "00000000-0000-4000-8000-00000000aa02",
      name: "anthropic-backup",
      base_url: "https://api.anthropic.com",
      provider: "anthropic",
      priority: 2,
      weight: 5,
      is_active: true,
      model_redirects: null,
      created_at: new Date("2026-06-01T00:00:00.000Z").toISOString(),
      updated_at: new Date("2026-06-10T00:00:00.000Z").toISOString(),
      circuit_breaker: {
        state: "open",
        failure_count: 6,
        success_count: 0,
        last_failure_at: new Date("2026-06-10T08:55:00.000Z").toISOString(),
        opened_at: new Date("2026-06-10T08:56:00.000Z").toISOString(),
        config: null,
      },
    },
  ],
  total: 2,
  page: 1,
  page_size: 50,
  total_pages: 1,
};

// 详情页 GET /admin/upstreams/{id}：与列表首项（openai-primary）保持同一份数据，
// 避免列表页与详情页之间出现不一致的 mock 快照。导出供 tests/e2e 引用其 id，
// 避免测试文件里出现重复的魔法 UUID 字面量。
export const UPSTREAM_DETAIL = UPSTREAMS_PAGE.items[0];

const UPSTREAM_HEALTH = {
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
    {
      upstream_id: "00000000-0000-4000-8000-00000000aa02",
      upstream_name: "anthropic-backup",
      is_healthy: false,
      last_check_at: new Date("2026-06-10T09:00:00.000Z").toISOString(),
      last_success_at: null,
      failure_count: 6,
      latency_ms: null,
      error_message: "connect timeout",
    },
  ],
  total: 2,
};

const LIVE_PULSE_SNAPSHOT = {
  requestsPerMinute: 24,
  errorRatePct: 0,
  avgLatencyMs: 800,
  tokensPerMinute: 4200,
  sampleCount: 24,
  windowSeconds: 60,
  generatedAt: new Date("2026-06-10T09:00:00.000Z").toISOString(),
  gateway: { healthyUpstreams: 1, totalUpstreams: 2, openCircuitBreakers: 1 },
};

const KEYS_PAGE = {
  items: [
    {
      id: "00000000-0000-4000-8000-00000000bb01",
      key_prefix: "sk-ar-visual",
      name: "visual-baseline-key",
      description: "Deterministic fixture for visual regression",
      access_mode: "restricted",
      upstream_ids: ["00000000-0000-4000-8000-00000000aa01"],
      allowed_models: null,
      spending_rules: null,
      spending_rule_statuses: [],
      is_quota_exceeded: false,
      is_active: true,
      disabled_by_admin: false,
      expires_at: null,
      created_at: new Date("2026-06-01T00:00:00.000Z").toISOString(),
      updated_at: new Date("2026-06-10T00:00:00.000Z").toISOString(),
    },
  ],
  total: 1,
  page: 1,
  page_size: 20,
  total_pages: 1,
};

/** 后注册的精确 route 优先于 catch-all（Playwright 路由匹配从新到旧）。 */
export async function mockAdminApis(page: Page): Promise<void> {
  await page.route("**/api/admin/**", (route) => fulfillJson(route, 200, {}));
  await page.route("**/api/auth/me", (route) =>
    fulfillJson(route, 200, { kind: "admin_token", role: "admin" })
  );
  await page.route("**/api/admin/stats/overview**", (route) =>
    fulfillJson(route, 200, STATS_OVERVIEW)
  );
  await page.route("**/api/admin/stats/timeseries**", (route) =>
    fulfillJson(route, 200, STATS_TIMESERIES)
  );
  await page.route("**/api/admin/upstreams?page=**", (route) =>
    fulfillJson(route, 200, UPSTREAMS_PAGE)
  );
  await page.route("**/api/admin/upstreams/health**", (route) =>
    fulfillJson(route, 200, UPSTREAM_HEALTH)
  );
  await page.route(`**/api/admin/upstreams/${UPSTREAM_DETAIL.id}`, (route) =>
    fulfillJson(route, 200, UPSTREAM_DETAIL)
  );
  // failure-rules 分区的 useUpstreamFailureRules / useGlobalUpstreamFailureRules
  // 都从响应体里取 `.data`；catch-all 的裸 `{}` 没有该字段，queryFn 会 resolve
  // 出 undefined，触发 TanStack Query 的 "Query data cannot be undefined" 报错。
  // 两个端点都回空规则列表，形状与真实 API 对齐。
  await page.route("**/api/admin/upstreams/*/failure-rules", (route) =>
    fulfillJson(route, 200, { data: [] })
  );
  await page.route("**/api/admin/upstream-failure-rules", (route) =>
    fulfillJson(route, 200, { data: [] })
  );
  // useLivePulse 的 SSE 读不到事件流会降级为快照轮询，两种形态都回同一份快照。
  await page.route("**/api/admin/stats/live**", (route) =>
    fulfillJson(route, 200, LIVE_PULSE_SNAPSHOT)
  );
  await page.route("**/api/admin/keys?**", (route) => fulfillJson(route, 200, KEYS_PAGE));
}
