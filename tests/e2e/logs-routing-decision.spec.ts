import { expect, test, type Page } from "@playwright/test";

function seedAdminToken(page: Page): Promise<void> {
  return page.addInitScript(() => {
    window.sessionStorage.setItem("admin_token", "e2e-admin-token");
  });
}

async function mockLogsApi(page: Page): Promise<void> {
  const now = new Date().toISOString();
  const payload = {
    items: [
      {
        id: "log-e2e-1",
        api_key_id: "key-e2e-1",
        upstream_id: null,
        upstream_name: null,
        method: "POST",
        path: "/api/proxy/v1/responses",
        model: "gpt-5.3-codex",
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        cached_tokens: 0,
        reasoning_tokens: 0,
        cache_creation_tokens: 0,
        cache_read_tokens: 0,
        status_code: 503,
        duration_ms: 301,
        routing_duration_ms: 145,
        error_message: "No authorized upstreams available for provider type: openai",
        routing_type: "provider_type",
        group_name: null,
        lb_strategy: null,
        failover_attempts: 0,
        failover_history: null,
        routing_decision: {
          original_model: "gpt-5.3-codex",
          resolved_model: "gpt-5.3-codex",
          model_redirect_applied: false,
          provider_type: "openai",
          routing_type: "provider_type",
          candidates: [
            { id: "up-88", name: "88-cx", weight: 1, circuit_state: "open" },
            { id: "up-rc", name: "rc", weight: 2, circuit_state: "closed" },
          ],
          excluded: [{ id: "up-88", name: "88-cx", reason: "circuit_open" }],
          candidate_count: 2,
          final_candidate_count: 1,
          selected_upstream_id: "up-rc",
          candidate_upstream_id: null,
          actual_upstream_id: null,
          did_send_upstream: false,
          failure_stage: "candidate_selection",
          selection_strategy: "weighted",
        },
        priority_tier: null,
        session_id: "019c4fce-9a11-7ba0-a1af-a3587bfc10d2",
        affinity_hit: false,
        affinity_migrated: false,
        created_at: now,
      },
    ],
    total: 1,
    page: 1,
    page_size: 20,
  };

  await page.route("**/api/admin/logs**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
  // Registered after the list route so it wins for /logs/stats (Playwright
  // matches routes in reverse registration order); the list-shaped payload
  // above must not leak into the window-stats hook.
  await page.route("**/api/admin/logs/stats**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        total: 1,
        stream_count: 0,
        slow_count: 0,
        p50_ttft_ms: null,
        p90_ttft_ms: null,
        p50_tps: null,
      }),
    });
  });
}

// Expanding a log row mounts LogRecordingSection, whose recording probe hits
// /api/admin/traffic-recordings. Left unmocked it reaches the real server with
// the fake e2e token, and the resulting 401 logs the session out mid-test.
function mockTrafficRecordingsApi(page: Page): Promise<void> {
  return page.route("**/api/admin/traffic-recordings**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        total: 0,
        page: 1,
        page_size: 1,
        total_pages: 0,
        stats: { total: 0, total_size_bytes: 0, latest_created_at: null },
      }),
    });
  });
}

// The logs page fetches upstream / API-key filter options. Left unmocked they
// reach the real server with the fake e2e token and the 401 logs the session
// out mid-test, so stub them with empty pages.
async function mockLogsFilterOptionApis(page: Page): Promise<void> {
  const emptyPage = { items: [], total: 0, page: 1, page_size: 100, total_pages: 0 };
  const fulfillEmpty = (route: Parameters<Parameters<Page["route"]>[1]>[0]) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyPage),
    });
  await page.route("**/api/admin/upstreams?**", fulfillEmpty);
  await page.route("**/api/admin/keys?**", fulfillEmpty);
}

// The live pulse bar in the dashboard layout opens a stats/live connection on
// every page. Stub it so this mocked flow stays isolated from the real server.
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

  return page.route("**/api/admin/stats/live**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(snapshot),
    });
  });
}

test.describe("Logs routing diagnostics", () => {
  test.beforeEach(async ({ page }) => {
    await mockLivePulse(page);
  });

  test("does not show selected upstream when request was never sent upstream", async ({ page }) => {
    await seedAdminToken(page);
    await mockLogsApi(page);
    await mockLogsFilterOptionApis(page);
    await mockTrafficRecordingsApi(page);

    await page.goto("/en/logs");

    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByText("Not outbound")).toBeVisible();

    await page.getByRole("button", { name: "Expand failover details" }).first().click();
    await page.getByRole("button", { name: "Decision" }).first().click();

    await expect(page.getByText("Selection basis")).toBeVisible();
    await expect(page.getByText("rc", { exact: true })).toBeVisible();
    await expect(page.getByText("w:2", { exact: true })).toBeVisible();
    await expect(page.getByText("Selected", { exact: true })).toHaveCount(0);
  });
});
