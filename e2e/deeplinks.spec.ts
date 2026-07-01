import { expect, test } from "@playwright/test";
import { gotoReady, WELLS_GOODFELLOW_PARCEL_IDS } from "./helpers";

// Regression suite for the deeplink round-trips found and fixed during the
// code-review pass this session (src/lib/deeplink.ts).

test("?cert= (empty) hides every vacancy tier, not just tier 0", async ({ page }) => {
  await gotoReady(page, "/?cert=");
  const checkboxes = page.locator(".filter-certainty input[type=checkbox]");
  await expect(checkboxes).toHaveCount(4);
  for (let i = 0; i < 4; i++) await expect(checkboxes.nth(i)).not.toBeChecked();
});

test("?sel=<id>&v=stats restores the shared view after flying to the parcel", async ({ page }) => {
  await gotoReady(page, `/?sel=${WELLS_GOODFELLOW_PARCEL_IDS[0]}&v=stats`);
  await expect(page.locator(".view-nav-btn.active")).toHaveText("Stats");
});

test("?list=neighborhood:... alone does not clobber the view into List (legacy ?list param collision)", async ({ page }) => {
  await gotoReady(page, "/?list=neighborhood:Wells Goodfellow");
  await expect(page.locator(".view-nav-btn.active")).toHaveText("Map");
});

test("?nbrhd=... seeds the List tab's neighborhood query", async ({ page }) => {
  await gotoReady(page, "/?nbrhd=Wells Goodfellow");
  await page.locator(".view-nav-btn", { hasText: "List" }).click();

  const listView = page.locator(".list-view");
  await expect(listView.locator("select[aria-label=Neighborhood]")).toHaveValue("Wells Goodfellow");
  await expect(listView.locator(".list-count")).toContainText(`${WELLS_GOODFELLOW_PARCEL_IDS.length} parcels`);
  await expect(listView.locator("tbody tr")).toHaveCount(WELLS_GOODFELLOW_PARCEL_IDS.length);
});
