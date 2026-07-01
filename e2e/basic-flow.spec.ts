import { expect, test } from "@playwright/test";
import { gotoReady, isUnexpectedConsoleError } from "./helpers";

// Formalizes the load -> filter -> search -> select -> MPO -> login -> cases
// walkthrough run manually against the fixture data during development.

test("core public-map flow: filter, search an owner, open a parcel", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && isUnexpectedConsoleError(msg)) consoleErrors.push(msg.text());
  });

  await gotoReady(page);
  await expect(page.locator(".loading")).toHaveCount(0);

  // Filter: hide empty lots, then restore.
  const lotsToggle = page.locator(".filter-toggle", { hasText: "Empty lots" }).locator("input");
  await expect(lotsToggle).toBeChecked();
  await lotsToggle.click();
  await expect(lotsToggle).not.toBeChecked();
  await lotsToggle.click();
  await expect(lotsToggle).toBeChecked();

  // Search for a multi-property owner and open their portfolio panel.
  await page.locator(".search-input").fill("Kipilla");
  const ownerResult = page.locator(".search-result", { hasText: "Kipilla, Ronnie" });
  await expect(ownerResult).toBeVisible();
  await ownerResult.click();

  const mpoPanel = page.locator(".mpo-panel");
  await expect(mpoPanel).toBeVisible();
  await expect(mpoPanel.locator(".mpo-owner-name")).toHaveText("Kipilla, Ronnie");
  await expect(mpoPanel.locator(".mpo-count")).toContainText("2 properties");

  // Open one of that owner's parcels from the portfolio list.
  await mpoPanel.locator(".mpo-row").first().click();
  const sidePanel = page.locator(".side-panel");
  await expect(sidePanel).toBeVisible();
  await expect(sidePanel.locator(".panel-address")).not.toBeEmpty();

  // The live score panel resolves (stubbed vcpp response) instead of hanging
  // on "Computing live score…" or erroring.
  await expect(sidePanel.locator(".score-panel.score-loading")).toHaveCount(0);
  await expect(sidePanel.locator(".score-section").first()).toBeVisible();

  await sidePanel.locator(".panel-close").click();
  await expect(sidePanel).toHaveCount(0);
  await mpoPanel.locator(".panel-close").click();
  await expect(mpoPanel).toHaveCount(0);

  expect(consoleErrors, `unexpected console errors:\n${consoleErrors.join("\n")}`).toEqual([]);
});

test("search by address opens the matching parcel", async ({ page }) => {
  await gotoReady(page);

  await page.locator(".search-input").fill("Highland");
  const addressResult = page.locator(".search-result", { hasText: "Highland Av" });
  await expect(addressResult).toBeVisible();
  await addressResult.click();

  const sidePanel = page.locator(".side-panel");
  await expect(sidePanel).toBeVisible();
  await expect(sidePanel.locator(".panel-address")).toContainText("Highland Av");
});

test("login as LSEM staff reveals the Cases tab; logout hides it again", async ({ page }) => {
  await gotoReady(page);

  await expect(page.locator(".view-nav-btn", { hasText: "Cases" })).toHaveCount(0);

  await page.locator(".auth-btn", { hasText: "Log in" }).click();
  await expect(page.locator(".login-modal")).toBeVisible();
  await page.locator(".login-continue").click();
  await page.locator(".login-demo-chip", { hasText: "staff@stlv.demo" }).click();
  await page.locator(".login-submit").click();

  await expect(page.locator(".login-modal")).toHaveCount(0);
  await expect(page.locator(".logged-in-as")).toContainText("Sam Staff");

  const casesTab = page.locator(".view-nav-btn", { hasText: "Cases" });
  await expect(casesTab).toBeVisible();
  await casesTab.click();

  const casesView = page.locator(".cases-view");
  await expect(casesView).toBeVisible();
  await expect(casesView.locator(".cases-sample-tag")).toContainText("fictional sample data");

  await page.locator(".auth-btn", { hasText: "Log out" }).click();
  await expect(page.locator(".view-nav-btn", { hasText: "Cases" })).toHaveCount(0);
});
