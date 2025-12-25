import { test, expect } from "@playwright/test";

/**
 * Visual Regression Tests for AutoRouter Pages
 *
 * Captures baseline screenshots for key pages.
 */

test.describe("Visual Regression", () => {
  test("login page visual snapshot", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("login.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  test("dashboard page visual snapshot", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("dashboard.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  test("keys page visual snapshot", async ({ page }) => {
    await page.goto("/keys");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("keys.png", {
      fullPage: true,
      animations: "disabled",
    });
  });

  test("upstreams page visual snapshot", async ({ page }) => {
    await page.goto("/upstreams");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("upstreams.png", {
      fullPage: true,
      animations: "disabled",
    });
  });
});
