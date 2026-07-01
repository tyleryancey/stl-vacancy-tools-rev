import { expect, test } from "@playwright/test";
import { gotoReady } from "./helpers";

// Regression coverage for the ARIA combobox (search) and dialog (login modal)
// keyboard behavior added in the B-ii accessibility pass.

test("search box: ArrowDown highlights a result, Enter activates it", async ({ page }) => {
  await gotoReady(page);

  const input = page.locator(".search-input");
  await expect(input).toHaveAttribute("role", "combobox");
  await expect(input).toHaveAttribute("aria-expanded", "false");

  await input.fill("Highland");
  await expect(page.locator(".search-result").first()).toBeVisible();
  await expect(input).toHaveAttribute("aria-expanded", "true");

  await input.press("ArrowDown");
  const firstOption = page.locator("#search-listbox-opt-0");
  await expect(firstOption).toHaveClass(/active/);
  await expect(firstOption).toHaveAttribute("aria-selected", "true");
  await expect(input).toHaveAttribute("aria-activedescendant", "search-listbox-opt-0");

  await input.press("Enter");
  await expect(page.locator(".side-panel")).toBeVisible();
  await expect(page.locator(".side-panel .panel-address")).toContainText("Highland Av");
});

test("login dialog: exposes role=dialog and closes on Escape", async ({ page }) => {
  await gotoReady(page);

  await page.locator(".auth-btn", { hasText: "Log in" }).click();
  const dialog = page.locator(".login-modal");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("role", "dialog");
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
