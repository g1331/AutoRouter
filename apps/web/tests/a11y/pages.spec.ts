import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility Tests for AutoRouter Pages
 *
 * Uses axe-core to test WCAG 2.1 AA compliance.
 */

test.describe("Accessibility", () => {
  test("login page should have no accessibility violations", async ({ page }) => {
    await page.goto("/login");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test("dashboard page should have no accessibility violations", async ({ page }) => {
    // Login first (mock or real auth)
    await page.goto("/dashboard");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test("keys page should have no accessibility violations", async ({ page }) => {
    await page.goto("/keys");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test("upstreams page should have no accessibility violations", async ({ page }) => {
    await page.goto("/upstreams");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
