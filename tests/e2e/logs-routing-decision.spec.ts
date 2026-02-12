import { expect, test, type Page } from "@playwright/test";

function seedAdminToken(page: Page): Promise<void> {
  return page.addInitScript(() => {
    window.sessionStorage.setItem("admin_token", "e2e-admin-token");
  });
}

function mockLogsApi(page: Page): Promise<void> {
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

  return page.route("**/api/admin/logs**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
}

test.describe("Logs routing diagnostics", () => {
  test("does not show selected upstream when request was never sent upstream", async ({ page }) => {
    await seedAdminToken(page);
    await mockLogsApi(page);

    await page.goto("/en/logs");

    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByText("Not sent to upstream")).toBeVisible();

    await page.getByRole("button", { name: "Expand failover details" }).first().click();

    const rcCandidateRow = page
      .locator("div.flex.items-center.gap-2.p-1.rounded")
      .filter({ hasText: "rc" })
      .filter({ hasText: "w:2" })
      .first();

    await expect(rcCandidateRow).toBeVisible();
    await expect(rcCandidateRow).not.toContainText("Selected");
    await expect(page.getByText("Selected", { exact: true })).toHaveCount(0);
  });
});
