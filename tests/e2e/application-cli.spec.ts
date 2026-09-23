import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockApplicationPages } from "../support/application-page-mocks";
import { seedTheme } from "../support/admin-page-mocks";

for (const width of [1440, 320]) {
  for (const theme of ["dark", "light"] as const) {
    test(`CLI selection and OAuth cancellation ${theme}-${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await seedTheme(page, theme);
      await mockApplicationPages(page);
      await page.route("**/oauth-login", (route) =>
        route.fulfill({
          json: {
            data: {
              provider: "codex",
              url: "https://example.com/authorize?state=local-audit",
              state: "local-audit",
            },
          },
        })
      );
      await page.route("**/oauth-login/status?*", (route) =>
        route.fulfill({ json: { data: { status: "wait" } } })
      );
      await page.goto("/en/system/cliproxy");
      const instance = page.getByRole("button", { name: "Local CLIProxyAPI", exact: true });
      await instance.focus();
      await page.keyboard.press("Enter");
      await expect(instance).toHaveAttribute("aria-pressed", "true");
      await expect(
        page
          .getByRole("row")
          .filter({ hasText: "Local CLIProxyAPI" })
          .getByText("https://proxy.example.com", { exact: true })
      ).toBeVisible();
      await expect(page.getByText("audit@example.com", { exact: true })).toBeVisible();
      await expect(page.getByRole("row").filter({ hasText: "audit@example.com" })).toContainText(
        "Success 12"
      );
      await page.getByRole("tab", { name: "Instance Logs" }).click();
      await expect(
        page.getByText("2026-06-10 08:00:00 INFO Local fixture ready", { exact: true })
      ).toBeVisible();
      await page.getByRole("tab", { name: "OAuth Accounts" }).click();
      const login = page.getByRole("button", { name: "OAuth Login", exact: true });
      await login.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("combobox")).toBeEnabled();
      await dialog.getByRole("button", { name: "Start Login", exact: true }).click();
      await expect(
        dialog.getByText("Waiting for login to complete...", { exact: true })
      ).toBeVisible();
      const result = await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      expect(result.violations.map(({ id }) => id)).toEqual([]);
      await page.screenshot({ path: info.outputPath("oauth.png") });
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(login).toBeFocused();
      await login.click();
      await expect(dialog.getByRole("button", { name: "Start Login", exact: true })).toBeVisible();
      await expect(
        dialog.getByText("Waiting for login to complete...", { exact: true })
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await page.getByRole("button", { name: "Upload Auth File", exact: true }).click();
      await dialog.getByRole("button", { name: "Paste JSON", exact: true }).click();
      const json = dialog.getByRole("textbox", { name: "Paste JSON" });
      await json.fill('{"provider":"codex","note":"local fixture"}');
      await dialog.getByRole("button", { name: "Choose File", exact: true }).click();
      await dialog.getByRole("button", { name: "Paste JSON", exact: true }).click();
      await expect(json).toHaveValue('{"provider":"codex","note":"local fixture"}');
      await expect(dialog.getByRole("button", { name: "Paste JSON", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      await page.screenshot({ path: info.outputPath("upload.png"), animations: "disabled" });
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await page
        .getByRole("row")
        .filter({ hasText: "Local CLIProxyAPI" })
        .getByRole("button", { name: "Actions", exact: true })
        .click();
      await page.getByRole("menuitem", { name: "Create Pool Upstream", exact: true }).click();
      await expect(dialog.getByRole("combobox", { name: "Provider" })).toBeVisible();
      await page.screenshot({ path: info.outputPath("pool.png") });
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    });
  }
}

test("single CLIProxy instance uses the desktop workspace width without a tinted selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedTheme(page, "light");
  await mockApplicationPages(page);
  await page.goto("/en/system/cliproxy");
  await expect(page.getByText("audit@example.com", { exact: true })).toBeVisible();

  const shell = await page.locator(".app-page").boundingBox();
  const workspace = await page.locator(".app-page section[aria-label]").boundingBox();
  expect(shell).not.toBeNull();
  expect(workspace).not.toBeNull();
  expect(workspace!.width / shell!.width).toBeGreaterThan(0.9);
  expect(workspace!.y).toBeLessThan(280);
  await expect(page.locator(".app-page aside tbody tr")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)"
  );
});

for (const [width, theme] of [
  [1440, "light"],
  [320, "light"],
  [1440, "dark"],
] as const) {
  test(`provider quota is visible from the account row at ${width}px in ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await seedTheme(page, theme);
    await mockApplicationPages(page);
    await page.goto("/en/system/cliproxy");
    await expect(page.getByText("audit@example.com", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "View quota" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Provider quota", { exact: true })).toBeVisible();
    await expect(dialog.getByText("75%", { exact: true })).toBeVisible();
    await expect(dialog.getByText("20%", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("progressbar", { name: "Primary window" })).toHaveAttribute(
      "aria-valuenow",
      "75"
    );
    await expect(dialog.getByText("Request usage", { exact: true }).first()).toBeVisible();
    expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(width);
    const result = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(result.violations.map(({ id }) => id)).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`provider-quota-${theme}-${width}.png`),
      animations: "disabled",
    });
  });
}

test("account usage failure keeps account management and secondary views available", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await seedTheme(page, "light");
  await mockApplicationPages(page);
  await page.route("**/api/admin/cliproxy/instances/instance-audit/auth-accounts/usage", (route) =>
    route.fulfill({ status: 502, json: { error: "upstream unavailable" } })
  );

  await page.goto("/en/system/cliproxy");
  await expect(page.getByText("audit@example.com", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not load account usage" })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry usage" })).toBeEnabled();
  await page.screenshot({ path: info.outputPath("usage-failed.png"), animations: "disabled" });

  await page.getByRole("tab", { name: "Linked Upstreams" }).click();
  await expect(page.getByText("No linked upstreams yet.")).toBeVisible();
  await page.getByRole("tab", { name: "Instance Logs" }).click();
  await expect(page.getByText("2026-06-10 08:00:00 INFO Local fixture ready")).toBeVisible();
});

test("multiple instances keep account names readable at 1024px", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 844 });
  await seedTheme(page, "light");
  await mockApplicationPages(page);
  const date = "2026-06-10T16:00:00.000Z";
  await page.route("**/api/admin/cliproxy/instances", (route) =>
    route.fulfill({
      json: {
        data: [
          ["instance-audit", "Local CLIProxyAPI", "https://proxy.example.com"],
          ["instance-b", "Team Proxy", "https://team.example.com"],
          ["instance-c", "Backup Proxy", "https://backup.example.com"],
        ].map(([id, name, base_url]) => ({
          id,
          name,
          base_url,
          management_url: base_url,
          mode: "external",
          has_client_api_key: true,
          has_management_key: true,
          enabled: true,
          description: null,
          created_at: date,
          updated_at: date,
        })),
      },
    })
  );

  await page.goto("/en/system/cliproxy");
  await expect(page.getByRole("button", { name: "Team Proxy" })).toBeVisible();
  const accountName = page
    .getByRole("row")
    .filter({ hasText: "audit@example.com" })
    .getByText("audit.json", { exact: true });
  await expect(accountName).toBeVisible();
  const lineCount = await accountName.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getClientRects().length;
  });
  expect(lineCount).toBe(1);
  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(1024);
});
