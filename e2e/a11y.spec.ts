import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { gotoReady } from "./helpers";

// The map is a MapLibre canvas — invisible to axe — so List/Cases are the
// accessible data path worth gating in CI (see roadmap plan, B-ii).

test("List view has no detectable a11y violations", async ({ page }) => {
  await gotoReady(page, "/?v=list");
  await expect(page.locator(".list-view")).toBeVisible();

  const results = await new AxeBuilder({ page }).include(".list-view").analyze();
  expect(results.violations).toEqual([]);
});

test("Cases view (LSEM, logged in) has no detectable a11y violations", async ({ page }) => {
  await gotoReady(page);
  await page.locator(".auth-btn", { hasText: "Log in" }).click();
  await page.locator(".login-continue").click();
  await page.locator(".login-demo-chip", { hasText: "staff@stlv.demo" }).click();
  await page.locator(".login-submit").click();
  await page.locator(".view-nav-btn", { hasText: "Cases" }).click();
  await expect(page.locator(".cases-view")).toBeVisible();

  const results = await new AxeBuilder({ page }).include(".cases-view").analyze();
  expect(results.violations).toEqual([]);
});

test("header + filter panel (map view) have no detectable a11y violations", async ({ page }) => {
  await gotoReady(page);

  const results = await new AxeBuilder({ page })
    .include(".app-header")
    .include(".filter-panel")
    .analyze();
  expect(results.violations).toEqual([]);
});
