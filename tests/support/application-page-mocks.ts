import type { Page } from "@playwright/test";
import {
  KEY_DETAIL,
  UPSTREAM_DETAIL,
  LOGS_PAGE,
  mockAdminApis,
  seedAdminSession,
} from "./admin-page-mocks";

export const AUDIT_USER_ID = "00000000-0000-4000-8000-000000000001";
export const APPLICATION_PAGES = [
  ["P01", "/login"],
  ["P02", "/dashboard"],
  ["P03", "/rankings"],
  ["P04", "/keys"],
  ["P05", `/keys/${KEY_DETAIL.id}`],
  ["P06", "/upstreams"],
  ["P07", `/upstreams/${UPSTREAM_DETAIL.id}`],
  ["P08", "/logs"],
  ["P09", "/system/users"],
  ["P10", `/system/users/${AUDIT_USER_ID}`],
  ["P11", "/system/billing"],
  ["P12", "/system/background-sync"],
  ["P13", "/system/traffic-recording"],
  ["P14", "/system/failure-rules"],
  ["P15", "/system/header-compensation"],
  ["P16", "/system/cliproxy"],
  ["P17", "/settings"],
  ["P18", "/portal"],
  ["P19", "/portal/keys"],
  ["P20", "/portal/requests"],
  ["P21", "/portal/password"],
] as const;
const date = "2026-06-10T08:00:00.000Z";
const user = {
  id: AUDIT_USER_ID,
  username: "alice",
  display_name: "Alice Doe",
  role: "member",
  is_active: true,
  expose_upstreams: true,
  api_key_count: 1,
  month_requests: 120,
  month_cost_usd: 3.5,
  created_at: date,
  updated_at: date,
};
const overview = {
  today_requests: 42,
  month_requests: 120,
  month_cost_usd: 3.5,
  total_requests: 500,
  total_cost_usd: 12.34,
  active_key_count: 1,
  total_key_count: 1,
};
const usage = {
  range: "7d",
  granularity: "day",
  points: Array.from({ length: 7 }, (_, i) => ({
    timestamp: `2026-06-${String(i + 4).padStart(2, "0")}T00:00:00.000Z`,
    request_count: 10 + i * 7,
    total_tokens: 1000 + i * 500,
    total_cost_usd: 0.5 + i / 10,
  })),
};
const recording = {
  id: "recording-audit",
  request_log_id: LOGS_PAGE.items[0].id,
  model: "gpt-4.1",
  method: "POST",
  path: "/v1/chat/completions",
  status_code: 200,
  outcome: "success",
  fixture_path: "test-fixture.json",
  fixture_size_bytes: 512,
  request_size_bytes: 64,
  response_size_bytes: 256,
  redacted: true,
  created_at: date,
};

/** 补齐 21 页的只读、确定性数据；业务写入另由对应 E2E 明确拦截。 */
export async function mockApplicationPages(page: Page, member = false) {
  await mockAdminApis(page);
  if (member) {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: AUDIT_USER_ID, role: "member" })}.audit-signature`;
    await page.addInitScript((value) => localStorage.setItem("admin_token", value), token);
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({
        json: { kind: "user", role: "member", username: "alice", displayName: "Alice Doe" },
      })
    );
  } else await seedAdminSession(page);

  const responses: Array<[string, unknown]> = [
    [
      "**/api/admin/cliproxy/instances/instance-audit/auth-accounts",
      {
        data: [
          {
            id: "account-audit",
            instance_id: "instance-audit",
            auth_file_name: "audit.json",
            provider: "codex",
            email: "audit@example.com",
            status: "active",
            disabled: false,
            prefix: null,
            model_count: 1,
            priority: 0,
            note: null,
            raw_metadata: {},
            last_synced_at: date,
            created_at: date,
            updated_at: date,
          },
        ],
      },
    ],
    ["**/api/admin/cliproxy/instances/instance-audit/linked-upstreams", { data: [] }],
    [
      "**/api/admin/cliproxy/instances/instance-audit/logs*",
      {
        data: {
          lines: ["2026-06-10 08:00:00 INFO Local fixture ready"],
          line_count: 1,
          latest_timestamp: 1781078400,
        },
      },
    ],
    [
      "**/api/admin/cliproxy/instances/instance-audit/auth-accounts/audit.json/models",
      { data: [{ id: "gpt-4.1", object: "model", owned_by: "openai" }] },
    ],
    [
      "**/api/admin/users?*",
      { items: [user], total: 1, page: 1, page_size: 10, total_pages: 1, active_admin_total: 2 },
    ],
    [`**/api/admin/users/${AUDIT_USER_ID}`, user],
    [`**/api/admin/users/${AUDIT_USER_ID}/overview`, overview],
    [`**/api/admin/users/${AUDIT_USER_ID}/usage?*`, usage],
    [
      "**/api/admin/compensation-rules",
      {
        data: [
          {
            id: "rule-audit",
            name: "Session header",
            enabled: true,
            is_builtin: false,
            target_header: "x-session-id",
            sources: ["headers.session_id", "body.session_id"],
            capabilities: ["openai_chat_compatible"],
            mode: "missing_only",
            created_at: date,
            updated_at: date,
          },
        ],
      },
    ],
    [
      "**/api/admin/traffic-recording/settings",
      {
        enabled: true,
        mode: "failure",
        redact_sensitive: true,
        retention_days: 7,
        updated_at: date,
      },
    ],
    [
      "**/api/admin/traffic-recordings?*",
      {
        items: [recording],
        total: 1,
        page: 1,
        page_size: 20,
        total_pages: 1,
        stats: { total: 1, total_size_bytes: 512, latest_created_at: date },
      },
    ],
    [
      "**/api/admin/traffic-recordings/recording-audit",
      {
        ...recording,
        fixture: {
          request: { model: "gpt-4.1", messages: [{ role: "user", content: "Local fixture" }] },
          response: { status: 200 },
        },
      },
    ],
    [
      "**/api/admin/cliproxy/instances",
      {
        data: [
          {
            id: "instance-audit",
            name: "Local CLIProxyAPI",
            mode: "external",
            base_url: "https://proxy.example.com",
            management_url: "https://proxy.example.com",
            has_client_api_key: true,
            has_management_key: true,
            enabled: true,
            description: null,
            created_at: date,
            updated_at: date,
          },
        ],
      },
    ],
    ["**/api/user/overview", overview],
    ["**/api/user/usage?*", usage],
    [
      "**/api/user/keys?*",
      { items: [KEY_DETAIL], total: 1, page: 1, page_size: 10, total_pages: 1 },
    ],
    [
      "**/api/user/upstreams",
      { upstreams_visible: true, items: [{ id: "upstream-1", name: "openai-primary" }] },
    ],
    ["**/api/user/logs?*", LOGS_PAGE],
    [
      "**/api/user/logs/stats?*",
      { total: 2, p50_ttft_ms: 230, p90_ttft_ms: 400, p50_tps: 80, slow_count: 0, stream_count: 2 },
    ],
  ];
  for (const [url, json] of responses) await page.route(url, (route) => route.fulfill({ json }));
}
