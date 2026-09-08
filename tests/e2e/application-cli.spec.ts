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
      await expect(page.getByText("audit@example.com", { exact: true })).toBeVisible();
      await expect(
        page.getByText("2026-06-10 08:00:00 INFO Local fixture ready", { exact: true })
      ).toBeVisible();
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
