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

// 详情页 GET /admin/keys/{id}：与列表首项（visual-baseline-key）保持同一份数据，
// 避免列表页与详情页之间出现不一致的 mock 快照。导出供 tests/e2e 引用其 id，
// 避免测试文件里出现重复的魔法 UUID 字面量。
export const KEY_DETAIL = KEYS_PAGE.items[0];

const BILLING_OVERVIEW = {
  today_cost_usd: 12.34,
  month_cost_usd: 345.67,
  unresolved_model_count: 1,
  latest_sync: {
    status: "success",
    source: "litellm",
    success_count: 42,
    failure_count: 0,
    failure_reason: null,
    synced_at: new Date("2026-06-10T08:00:00.000Z").toISOString(),
  },
};

const BILLING_BACKGROUND_TASKS = {
  items: [
    {
      task_name: "billing_price_catalog_sync",
      display_name: "Billing price catalog sync",
      enabled: true,
      interval_seconds: 3600,
      startup_delay_seconds: 0,
      is_running: false,
      last_started_at: new Date("2026-06-10T08:00:00.000Z").toISOString(),
      last_finished_at: new Date("2026-06-10T08:00:05.000Z").toISOString(),
      last_success_at: new Date("2026-06-10T08:00:05.000Z").toISOString(),
      last_failed_at: null,
      last_status: "success",
      last_error: null,
      last_duration_ms: 5000,
      last_success_count: 42,
      last_failure_count: 0,
      next_run_at: new Date("2026-06-10T09:00:00.000Z").toISOString(),
      updated_at: new Date("2026-06-10T08:00:05.000Z").toISOString(),
    },
  ],
  total: 1,
};

const BILLING_UNRESOLVED_MODELS = {
  items: [
    {
      model: "custom-unpriced-model",
      occurrences: 7,
      last_seen_at: new Date("2026-06-10T07:30:00.000Z").toISOString(),
      last_upstream_id: "00000000-0000-4000-8000-00000000aa01",
      last_upstream_name: "openai-primary",
      has_manual_override: false,
    },
  ],
  total: 1,
};

const BILLING_MANUAL_OVERRIDES = {
  items: [
    {
      id: "00000000-0000-4000-8000-00000000cc01",
      model: "gpt-4.1",
      input_price_per_million: 2.5,
      output_price_per_million: 10,
      cache_read_input_price_per_million: 0.5,
      cache_write_input_price_per_million: 1.25,
      note: "Negotiated volume discount",
      has_official_price: true,
      created_at: new Date("2026-06-01T00:00:00.000Z").toISOString(),
      updated_at: new Date("2026-06-05T00:00:00.000Z").toISOString(),
    },
  ],
  total: 1,
};

const BILLING_TIER_RULE = {
  id: "00000000-0000-4000-8000-00000000dd01",
  model: "gpt-4.1",
  source: "manual",
  threshold_input_tokens: 200000,
  display_label: null,
  input_price_per_million: 3,
  output_price_per_million: 12,
  cache_read_input_price_per_million: 0.6,
  cache_write_input_price_per_million: 1.5,
  note: "Long-context tier",
  is_active: true,
  created_at: new Date("2026-06-01T00:00:00.000Z").toISOString(),
  updated_at: new Date("2026-06-05T00:00:00.000Z").toISOString(),
};

const BILLING_TIER_RULES = {
  items: [BILLING_TIER_RULE],
  total: 1,
};

// 详情页/日志页共用同一份 key 与 upstream 身份，避免测试文件里出现重复的魔法 UUID。
const LOGS_PAGE = {
  items: [
    {
      id: "00000000-0000-4000-8000-00000000ff01",
      api_key_id: KEYS_PAGE.items[0].id,
      api_key_name: KEYS_PAGE.items[0].name,
      api_key_prefix: KEYS_PAGE.items[0].key_prefix,
      upstream_id: UPSTREAMS_PAGE.items[0].id,
      upstream_name: UPSTREAMS_PAGE.items[0].name,
      method: "POST",
      path: "/v1/chat/completions",
      model: "gpt-4.1",
      reasoning_effort: "high",
      prompt_tokens: 128,
      completion_tokens: 512,
      total_tokens: 640,
      cached_tokens: 0,
      reasoning_tokens: 64,
      cache_creation_tokens: 0,
      cache_creation_5m_tokens: 0,
      cache_creation_1h_tokens: 0,
      cache_read_tokens: 0,
      status_code: 200,
      duration_ms: 820,
      routing_duration_ms: 40,
      error_message: null,
      routing_type: "direct",
      group_name: null,
      lb_strategy: null,
      priority_tier: 1,
      failover_attempts: 0,
      failover_history: null,
      routing_decision: null,
      thinking_config: {
        provider: "openai",
        protocol: "openai_chat",
        mode: "reasoning",
        level: "high",
        budget_tokens: null,
        include_thoughts: null,
        source_paths: ["reasoning_effort"],
      },
      session_id: null,
      affinity_hit: false,
      affinity_migrated: false,
      ttft_ms: null,
      is_stream: false,
      session_id_compensated: false,
      header_diff: null,
      billing_status: "billed",
      final_cost: 0.842,
      currency: "USD",
      created_at: new Date("2026-06-10T08:58:00.000Z").toISOString(),
    },
    {
      id: "00000000-0000-4000-8000-00000000ff02",
      api_key_id: null,
      api_key_name: null,
      api_key_prefix: null,
      upstream_id: UPSTREAMS_PAGE.items[1].id,
      upstream_name: UPSTREAMS_PAGE.items[1].name,
      method: "POST",
      path: "/v1/messages",
      model: "claude-3-opus",
      reasoning_effort: null,
      prompt_tokens: 64,
      completion_tokens: 0,
      total_tokens: 64,
      cached_tokens: 0,
      reasoning_tokens: 0,
      cache_creation_tokens: 0,
      cache_creation_5m_tokens: 0,
      cache_creation_1h_tokens: 0,
      cache_read_tokens: 0,
      status_code: 503,
      duration_ms: 2100,
      routing_duration_ms: 60,
      error_message: "upstream connect timeout",
      routing_type: "direct",
      group_name: null,
      lb_strategy: null,
      priority_tier: 2,
      failover_attempts: 1,
      failover_history: null,
      routing_decision: null,
      thinking_config: null,
      session_id: null,
      affinity_hit: false,
      affinity_migrated: false,
      ttft_ms: null,
      is_stream: false,
      session_id_compensated: false,
      header_diff: null,
      billing_status: "unbilled",
      unbillable_reason: "usage_missing",
      final_cost: null,
      currency: null,
      created_at: new Date("2026-06-10T08:55:00.000Z").toISOString(),
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
  total_pages: 1,
};

// 统计瓦片的窗口级指标；catch-all 的裸 `{}` 会让 StatCard 全部渲染成空值。
const LOGS_WINDOW_STATS = {
  total: 2,
  stream_count: 1,
  slow_count: 0,
  p50_ttft_ms: 480,
  p90_ttft_ms: 1200,
  p50_tps: 42,
};

// 单维度排行榜（/admin/stats/leaderboard?dimension=...）的确定性数据。
// 指标刻意做成「按请求数与按费用排序会互换第一名」，让 e2e 的列头排序
// 断言真正可观察；comparison 覆盖排名上升/下降与「新上榜」三种形态。
// 导出供 tests/e2e 引用 id / 名称，避免测试文件里出现重复的魔法字面量。
export const RANKINGS_FIXTURES = {
  upstreams: [
    {
      id: UPSTREAMS_PAGE.items[0].id,
      name: UPSTREAMS_PAGE.items[0].name,
      provider_type: "openai",
      request_count: 12000,
      total_tokens: 400_000,
      total_cost_usd: 8,
      avg_ttft_ms: 640,
      avg_tps: 45.3,
      cache_hit_rate: 5.2,
      error_rate: 0.5,
      model_distribution: [
        { name: "gpt-4.1", count: 9000 },
        { name: "gpt-4o-mini", count: 3000 },
      ],
      comparison: { prev_rank: 2, prev_request_count: 6000 },
    },
    {
      id: UPSTREAMS_PAGE.items[1].id,
      name: UPSTREAMS_PAGE.items[1].name,
      provider_type: "anthropic",
      request_count: 8000,
      total_tokens: 280_000,
      total_cost_usd: 15.5,
      avg_ttft_ms: 900,
      avg_tps: 38.2,
      cache_hit_rate: 2.1,
      error_rate: 6,
      model_distribution: [{ name: "claude-3-opus", count: 8000 }],
      comparison: { prev_rank: 1, prev_request_count: 9000 },
    },
  ],
  models: [
    {
      model: "gpt-4.1",
      request_count: 9000,
      total_tokens: 320_000,
      total_cost_usd: 6.4,
      avg_ttft_ms: 620,
      avg_tps: 48,
      cache_hit_rate: 4.8,
      error_rate: 0.2,
      upstream_distribution: [{ name: UPSTREAMS_PAGE.items[0].name, count: 9000 }],
      comparison: { prev_rank: 1, prev_request_count: 8200 },
    },
    {
      model: "claude-3-opus",
      request_count: 8000,
      total_tokens: 280_000,
      total_cost_usd: 15.5,
      avg_ttft_ms: 900,
      avg_tps: 38.2,
      cache_hit_rate: 2.1,
      error_rate: 6,
      upstream_distribution: [{ name: UPSTREAMS_PAGE.items[1].name, count: 8000 }],
      comparison: { prev_rank: null, prev_request_count: null },
    },
  ],
  api_keys: [
    {
      id: KEYS_PAGE.items[0].id,
      name: KEYS_PAGE.items[0].name,
      key_prefix: KEYS_PAGE.items[0].key_prefix,
      request_count: 15000,
      total_tokens: 500_000,
      total_cost_usd: 12.5,
      avg_ttft_ms: 700,
      avg_tps: 44,
      cache_hit_rate: 3.5,
      error_rate: 1.2,
      model_distribution: [
        { name: "gpt-4.1", count: 12000 },
        { name: "claude-3-opus", count: 3000 },
      ],
      comparison: { prev_rank: 1, prev_request_count: 14000 },
    },
  ],
  users: [
    {
      id: "00000000-0000-4000-8000-00000000dd11",
      username: "alice",
      display_name: "Alice Zhang",
      request_count: 9000,
      total_tokens: 320_000,
      total_cost_usd: 7.8,
      avg_ttft_ms: 680,
      avg_tps: 42,
      cache_hit_rate: 2.8,
      error_rate: 0.9,
      model_distribution: [{ name: "gpt-4.1", count: 9000 }],
      comparison: { prev_rank: 1, prev_request_count: 8500 },
    },
  ],
};

const RANKINGS_SORT_COLUMNS: Record<string, string> = {
  requests: "request_count",
  tokens: "total_tokens",
  cost: "total_cost_usd",
  ttft: "avg_ttft_ms",
  tps: "avg_tps",
  cache_hit: "cache_hit_rate",
  error_rate: "error_rate",
};

const BILLING_MODEL_PRICES = {
  items: [
    {
      id: "00000000-0000-4000-8000-00000000ee01",
      model: "gpt-4.1",
      input_price_per_million: 2,
      output_price_per_million: 8,
      cache_read_input_price_per_million: 0.5,
      cache_write_input_price_per_million: 1,
      max_input_tokens: 128000,
      max_output_tokens: 16000,
      synced_tier_rules: [],
      source: "litellm",
      is_active: true,
      synced_at: new Date("2026-06-10T08:00:00.000Z").toISOString(),
      updated_at: new Date("2026-06-10T08:00:00.000Z").toISOString(),
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
  await page.route(`**/api/admin/keys/${KEY_DETAIL.id}`, (route) =>
    fulfillJson(route, 200, KEY_DETAIL)
  );
  await page.route("**/api/admin/background-sync/tasks", (route) =>
    fulfillJson(route, 200, BILLING_BACKGROUND_TASKS)
  );
  await page.route("**/api/admin/billing/overview", (route) =>
    fulfillJson(route, 200, BILLING_OVERVIEW)
  );
  await page.route("**/api/admin/billing/prices/unresolved", (route) =>
    fulfillJson(route, 200, BILLING_UNRESOLVED_MODELS)
  );
  await page.route("**/api/admin/billing/overrides", (route) =>
    fulfillJson(route, 200, BILLING_MANUAL_OVERRIDES)
  );
  await page.route("**/api/admin/billing/tier-rules", (route) =>
    fulfillJson(route, 200, BILLING_TIER_RULES)
  );
  await page.route("**/api/admin/billing/prices?**", (route) =>
    fulfillJson(route, 200, BILLING_MODEL_PRICES)
  );
  await page.route("**/api/admin/logs?**", (route) => fulfillJson(route, 200, LOGS_PAGE));
  await page.route("**/api/admin/logs/stats**", (route) =>
    fulfillJson(route, 200, LOGS_WINDOW_STATS)
  );
  // useRequestLogLive 读取 text/event-stream；给一个立即结束的空流即可让它稳定
  // 降级为 fallback 轮询，不必等 10s 重连超时或让请求悬挂拖慢页面就绪。
  await page.route("**/api/admin/logs/live**", (route) =>
    route.fulfill({ status: 200, contentType: "text/event-stream", body: "" })
  );
  // 单维度排行榜：按请求的 dimension/sort_by/order 对固定数据排序后返回，
  // 让 e2e 的排序断言观察到真实的名次变化。旧格式（无 dimension，dashboard
  // Top5 用）fallback 给 catch-all 的 `{}`，保持既有视觉/a11y 基线不变。
  await page.route("**/api/admin/stats/leaderboard**", async (route) => {
    const url = new URL(route.request().url());
    const dimension = url.searchParams.get("dimension");
    if (!dimension || !(dimension in RANKINGS_FIXTURES)) {
      await route.fallback();
      return;
    }
    const sortBy = url.searchParams.get("sort_by") ?? "requests";
    const order = url.searchParams.get("order") === "asc" ? 1 : -1;
    const column = RANKINGS_SORT_COLUMNS[sortBy] ?? "request_count";
    const metric = (item: object) => (item as unknown as Record<string, number>)[column];
    const items = [...RANKINGS_FIXTURES[dimension as keyof typeof RANKINGS_FIXTURES]].sort(
      (a, b) => (metric(a) - metric(b)) * order
    );
    await fulfillJson(route, 200, {
      range: url.searchParams.get("range") ?? "7d",
      dimension,
      sort_by: sortBy,
      order: order === 1 ? "asc" : "desc",
      items,
    });
  });
}
