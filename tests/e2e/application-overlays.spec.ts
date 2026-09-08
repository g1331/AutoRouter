import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { AUDIT_USER_ID, mockApplicationPages } from "../support/application-page-mocks";
import { seedTheme } from "../support/admin-page-mocks";

const forms = [
  ["keys", "/keys", "Create API Key"],
  ["upstreams", "/upstreams", "Add Upstream"],
  ["users", "/system/users", "Create User"],
  ["compensation", "/system/header-compensation", "Add Rule"],
  ["cliproxy", "/system/cliproxy", "Add Instance"],
  ["member-keys", "/portal/keys", "Create API Key"],
] as const;

for (const width of [320, 390]) {
  test(`date range fits narrow viewport ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 600 });
    await seedTheme(page, "light");
    await mockApplicationPages(page);
    await page.goto("/zh-CN/logs");
    const trigger = page.getByRole("button", { name: "自定义", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("date-range.png"), animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}

for (const theme of ["dark", "light"] as const) {
  for (const width of [1440, 320]) {
    test.describe(`${theme}-${width}`, () => {
      test.use({
        viewport: { width, height: 844 },
        contextOptions: { reducedMotion: "no-preference" },
      });
      for (const [id, path, action] of forms) {
        test(`${id} form`, async ({ page }, info) => {
          await seedTheme(page, theme);
          await mockApplicationPages(page, path.startsWith("/portal"));
          await page.goto(`/en${path}`);
          const trigger = page.getByRole("button", { name: action, exact: true });
          await trigger.click();
          const dialog = page.getByRole("dialog");
          await expect(dialog).toBeVisible();
          await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeVisible();
          const bounds = await dialog.boundingBox();
          expect(bounds!.x).toBeGreaterThanOrEqual(0);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
          expect(bounds!.y).toBeGreaterThanOrEqual(0);
          expect(bounds!.height).toBeLessThanOrEqual(844);
          const a11y = await new AxeBuilder({ page })
            .include('[role="dialog"]')
            .withTags(["wcag2a", "wcag2aa"])
            .analyze();
          expect(
            a11y.violations.map(({ id, nodes }) => ({
              id,
              targets: nodes.map((node) => node.target),
            }))
          ).toEqual([]);
          await page.screenshot({ path: info.outputPath("overlay.png") });
          await page.keyboard.press("Escape");
          await expect(dialog).toBeHidden();
          await expect(trigger).toBeFocused();
        });
      }
    });
  }
}

for (const [theme, width] of [
  ["dark", 320],
  ["light", 1440],
] as const) {
  for (const area of ["users", "cliproxy"] as const) {
    test(`${area} related dialogs ${theme}-${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 844 });
      await seedTheme(page, theme);
      await mockApplicationPages(page);
      await page.route(`**/api/admin/users/${AUDIT_USER_ID}/upstreams`, (route) =>
        route.fulfill({ json: { upstream_ids: [] } })
      );
      await page.goto(`/en/system/${area}`);
      if (area === "cliproxy") {
        await page.getByRole("button", { name: "Local CLIProxyAPI", exact: true }).click();
        await expect(page.getByText("audit@example.com", { exact: true })).toBeVisible();
      }
      const actions =
        area === "users"
          ? [
              "Edit",
              "Change Username",
              "Reset Password",
              "Configure Upstreams",
              "View API Keys",
              "Assign API Keys",
              "Delete User",
            ]
          : ["View Details", "View Models", "Edit Account", "Map to Upstream", "Delete"];
      const trigger =
        area === "users"
          ? page.getByRole("button", { name: "Actions: alice", exact: true })
          : page
              .getByRole("row")
              .filter({ hasText: "audit@example.com" })
              .getByRole("button", { name: "Actions", exact: true });
      for (const action of actions) {
        await trigger.click();
        await page.getByRole("menuitem", { name: action, exact: true }).click();
        const dialog = page
          .locator('[role="dialog"], [role="alertdialog"]')
          .filter({ visible: true });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("heading")).toBeVisible();
        const bounds = await dialog.boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        const result = await new AxeBuilder({ page })
          .include('[role="dialog"], [role="alertdialog"]')
          .withTags(["wcag2a", "wcag2aa"])
          .analyze();
        expect(
          result.violations.map(({ id, nodes }) => ({
            id,
            targets: nodes.map((node) => node.target),
          }))
        ).toEqual([]);
        await page.screenshot({ path: info.outputPath(`${action.replaceAll(" ", "-")}.png`) });
        await page.keyboard.press("Escape");
        await expect(dialog).toBeHidden();
        await expect(trigger).toBeFocused();
      }
    });
  }
}
