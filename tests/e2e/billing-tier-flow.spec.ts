import { expect, test, type Page, type Route } from "@playwright/test";

type TierRuleApiItem = {
  id: string;
  model: string;
  source: "litellm" | "manual";
  threshold_input_tokens: number;
  display_label: string | null;
  input_price_per_million: number;
  output_price_per_million: number;
  cache_read_input_price_per_million: number | null;
  cache_write_input_price_per_million: number | null;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function seedAdminToken(page: Page): Promise<void> {
  return page.addInitScript(() => {
    window.sessionStorage.setItem("admin_token", "e2e-admin-token");
  });
}

function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function createTierRule(
  rule: Partial<TierRuleApiItem> & Pick<TierRuleApiItem, "id" | "model" | "source">
) {
  const now = new Date("2026-03-01T00:00:00.000Z").toISOString();
  return {
    threshold_input_tokens: 128000,
    display_label: null,
    input_price_per_million: 5,
    output_price_per_million: 15,
    cache_read_input_price_per_million: null,
    cache_write_input_price_per_million: null,
    note: null,
    is_active: true,
    created_at: now,
    updated_at: now,
    ...rule,
  } satisfies TierRuleApiItem;
}

async function mockBillingApis(page: Page, options?: { duplicateThresholdOnly?: boolean }) {
  const syncedTierRules: TierRuleApiItem[] = [
    createTierRule({
      id: "rule-sync-1",
      model: "gpt-4.1",
      source: "litellm",
      threshold_input_tokens: 128000,
    }),
  ];
  const manualTierRules: TierRuleApiItem[] = options?.duplicateThresholdOnly
    ? [
        createTierRule({
          id: "rule-manual-existing",
          model: "gap-model",
          source: "manual",
          threshold_input_tokens: 64000,
          input_price_per_million: 7.5,
          output_price_per_million: 21,
        }),
      ]
    : [];

  await page.route("**/api/admin/billing/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const method = route.request().method();

    if (pathname === "/api/admin/billing/overview" && method === "GET") {
      await fulfillJson(route, 200, {
        today_cost_usd: 12.34,
        month_cost_usd: 56.78,
        unresolved_model_count: 0,
        latest_sync: {
          status: "success",
          source: "litellm",
          success_count: 1,
          failure_count: 0,
          failure_reason: null,
          synced_at: "2026-03-01T00:00:00.000Z",
        },
      });
      return;
    }

    if (pathname === "/api/admin/billing/prices/unresolved" && method === "GET") {
      await fulfillJson(route, 200, { items: [], total: 0 });
      return;
    }

    if (pathname === "/api/admin/billing/overrides" && method === "GET") {
      await fulfillJson(route, 200, { items: [], total: 0 });
      return;
    }

    if (pathname === "/api/admin/billing/prices" && method === "GET") {
      await fulfillJson(route, 200, {
        items: [
          {
            id: "price-sync-1",
            model: "gpt-4.1",
            input_price_per_million: 3,
            output_price_per_million: 9,
            cache_read_input_price_per_million: 0.8,
            cache_write_input_price_per_million: null,
            max_input_tokens: 128000,
            max_output_tokens: 4096,
            synced_tier_rules: [
              {
                id: "rule-sync-1",
                model: "gpt-4.1",
                source: "litellm",
                threshold_input_tokens: 128000,
                display_label: null,
                input_price_per_million: 5,
                output_price_per_million: 15,
                cache_read_input_price_per_million: null,
                cache_write_input_price_per_million: null,
                note: null,
                is_active: true,
                created_at: "2026-03-01T00:00:00.000Z",
                updated_at: "2026-03-01T00:00:00.000Z",
              },
            ],
            source: "litellm",
            is_active: true,
            synced_at: "2026-03-01T00:00:00.000Z",
            updated_at: "2026-03-01T00:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
        total_pages: 1,
      });
      return;
    }

    if (pathname === "/api/admin/billing/tier-rules" && method === "GET") {
      const items = [...manualTierRules, ...syncedTierRules].sort((a, b) => {
        if (a.source !== b.source) {
          return a.source === "manual" ? -1 : 1;
        }
        if (a.model !== b.model) {
          return a.model.localeCompare(b.model);
        }
        return a.threshold_input_tokens - b.threshold_input_tokens;
      });
      await fulfillJson(route, 200, {
        items,
        total: items.length,
      });
      return;
    }

    if (pathname === "/api/admin/billing/tier-rules" && method === "POST") {
      const payload = route.request().postDataJSON() as {
        model: string;
        threshold_input_tokens: number;
        input_price_per_million: number;
        output_price_per_million: number;
        cache_read_input_price_per_million?: number | null;
        cache_write_input_price_per_million?: number | null;
        note?: string | null;
      };

      const hasDuplicate = manualTierRules.some(
        (rule) =>
          rule.model === payload.model &&
          rule.threshold_input_tokens === payload.threshold_input_tokens
      );
      if (hasDuplicate) {
        await fulfillJson(route, 409, {
          error: "A manual tier rule with the same threshold already exists",
        });
        return;
      }

      const created = createTierRule({
        id: `rule-manual-${manualTierRules.length + 1}`,
        model: payload.model,
        source: "manual",
        threshold_input_tokens: payload.threshold_input_tokens,
        input_price_per_million: payload.input_price_per_million,
        output_price_per_million: payload.output_price_per_million,
        cache_read_input_price_per_million: payload.cache_read_input_price_per_million ?? null,
        cache_write_input_price_per_million: payload.cache_write_input_price_per_million ?? null,
        note: payload.note ?? null,
      });
      manualTierRules.push(created);
      await fulfillJson(route, 201, created);
      return;
    }

    await fulfillJson(route, 404, { error: `Unhandled billing route: ${method} ${pathname}` });
  });
}

async function mockLogsApi(page: Page) {
  const now = new Date("2026-03-01T01:23:45.000Z").toISOString();
  await page.route("**/api/admin/logs**", async (route) => {
    await fulfillJson(route, 200, {
      items: [
        {
          id: "log-tier-1",
          api_key_id: "key-tier-1",
          upstream_id: "upstream-1",
          upstream_name: "Deterministic Upstream",
          method: "POST",
          path: "/api/proxy/v1/responses",
          model: "gap-model",
          prompt_tokens: 70000,
          completion_tokens: 120,
          total_tokens: 70120,
          cached_tokens: 0,
          reasoning_tokens: 0,
          cache_creation_tokens: 0,
          cache_read_tokens: 0,
          status_code: 200,
          duration_ms: 860,
          routing_duration_ms: 120,
          error_message: null,
          routing_type: "provider_type",
          group_name: null,
          lb_strategy: null,
          failover_attempts: 0,
          failover_history: null,
          routing_decision: null,
          priority_tier: null,
          session_id: null,
          affinity_hit: false,
          affinity_migrated: false,
          ttft_ms: null,
          is_stream: false,
          created_at: now,
          billing_status: "billed",
          unbillable_reason: null,
          billed_input_tokens: 70000,
          base_input_price_per_million: 7.5,
          base_output_price_per_million: 21,
          base_cache_read_input_price_per_million: null,
          base_cache_write_input_price_per_million: null,
          input_multiplier: 1,
          output_multiplier: 1,
          cache_read_cost: 0,
          cache_write_cost: 0,
          final_cost: 0.52752,
          currency: "USD",
          price_source: "manual",
          matched_rule_type: "tiered",
          matched_rule_display_label: ">64K",
          applied_tier_threshold: 64000,
          model_max_input_tokens: 128000,
          model_max_output_tokens: 4096,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
    });
  });
}

test.describe("Billing tier-aware verification", () => {
  test("admin can inspect synced tier pricing, create a manual tier rule, and verify matched-rule logs", async ({
    page,
  }) => {
    await seedAdminToken(page);
    await mockBillingApis(page);
    await mockLogsApi(page);

    await page.goto("/en/system/billing");

    await expect(page.getByRole("heading", { name: "Model Price Catalog" })).toBeVisible();
    const gpt41Row = page.locator("tr").filter({ hasText: "gpt-4.1" }).first();
    await expect(gpt41Row).toContainText("128K tokens");
    // Assert window metadata is displayed (max_input_tokens / max_output_tokens)
    await expect(gpt41Row).toContainText("128,000 / 4,096");

    await page.getByTestId("billing-tier-rule-add-button").click();
    await page.getByTestId("billing-tier-rule-model-input").fill("gap-model");
    await page.getByTestId("billing-tier-rule-threshold-input").fill("64000");
    await page.getByTestId("billing-tier-rule-input-price-input").fill("7.5");
    await page.getByTestId("billing-tier-rule-output-price-input").fill("21");
    await page.getByTestId("billing-tier-rule-save-button").click();

    await expect(page.getByText("Tier rule created")).toBeVisible();
    await expect(page.locator("tr").filter({ hasText: "gap-model" }).first()).toContainText(
      "64K tokens"
    );

    await page.goto("/en/logs");

    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByText("gap-model", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Expand failover details" }).first().click();

    await expect(page.getByText("TOKEN DETAILS", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Rule:\s*Tiered$/)).toBeVisible();
    // Assert matched_rule_display_label is shown
    await expect(page.getByText(/^Rule Label:\s*>64K$/)).toBeVisible();
    await expect(page.getByText(/^Threshold:\s*64,000$/)).toBeVisible();
    await expect(page.getByText(/^Source:\s*Manual$/)).toBeVisible();
    // Assert model window metadata is displayed in the expanded row
    await expect(page.getByText(/Max Input: 128,?000/)).toBeVisible();
    await expect(page.getByText(/Max Output: 4,?096/)).toBeVisible();
  });

  test("zh-CN billing flow keeps tier labels localized when duplicate threshold validation fires", async ({
    page,
  }) => {
    await seedAdminToken(page);
    await mockBillingApis(page, { duplicateThresholdOnly: true });

    await page.goto("/zh-CN/system/billing");

    await expect(page.getByRole("heading", { name: "模型价格目录" })).toBeVisible();
    await expect(page.locator("tr").filter({ hasText: "gap-model" }).first()).toContainText(
      "64K Token"
    );

    await page.getByTestId("billing-tier-rule-add-button").click();
    await page.getByTestId("billing-tier-rule-model-input").fill("gap-model");
    await page.getByTestId("billing-tier-rule-threshold-input").fill("64000");
    await page.getByTestId("billing-tier-rule-input-price-input").fill("7.5");
    await page.getByTestId("billing-tier-rule-output-price-input").fill("21");
    await page.getByTestId("billing-tier-rule-save-button").click();

    await expect(page.getByText("该模型已存在相同阈值的手动阶梯规则")).toBeVisible();
    await page
      .locator("tr")
      .filter({ hasText: "gap-model" })
      .first()
      .getByRole("button", { name: "展开阶梯规则" })
      .click();
    await page
      .locator("tr")
      .filter({ hasText: "gpt-4.1" })
      .first()
      .getByRole("button", { name: "展开阶梯规则" })
      .click();
    await expect(page.getByRole("cell", { name: "手动", exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "同步", exact: true })).toBeVisible();
  });
});
