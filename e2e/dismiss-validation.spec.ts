import { test, expect } from "@playwright/test";
import { guardConsole } from "./lib/test-helpers";

test.describe.configure({ mode: "serial" });

test.describe("Dismiss validation flow", () => {
  test("user can dismiss a validation with a reason, then re-enable it", async ({ page }, testInfo) => {
    const getErrors = guardConsole(page, testInfo);
    const unique = `DismissValidation ${Date.now()}`;

    await page.goto("/projects/new");
    await page.getByLabel("Project name").fill(unique);
    await page.getByLabel("Design prompt").fill("ESP32 dev board with USB-C, no ESD needed");
    await page.getByRole("button", { name: /continue to workspace/i }).click();
    await page.getByRole("button", { name: /generate design/i }).click();
    // Generated project has at least one validation issue (stub fixture)
    await expect(page.getByText(/review/i).first()).toBeVisible();
    await page.waitForLoadState("networkidle");

    // Find the first × dismiss button in the Validation issues card
    const dismissBtn = page.locator('button[aria-label^="Dismiss:"]').first();
    await expect(dismissBtn).toBeVisible();
    const label = (await dismissBtn.getAttribute("aria-label")) ?? "";
    const title = label.replace("Dismiss: ", "");

    await dismissBtn.click();

    // Reason field appears — submit disabled until filled
    const reasonInput = page.getByLabel(/reason for accepting this trade-off/i);
    await expect(reasonInput).toBeVisible();
    const submitBtn = page.getByRole("button", { name: "Dismiss", exact: true });
    await expect(submitBtn).toBeDisabled();

    await reasonInput.fill("Dev board only, not a shipping product");
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Reason field collapses; dismissed panel now shows the item
    await expect(reasonInput).toHaveCount(0);
    const dismissedSummary = page.getByText(/^Dismissed \(\d+\)$/);
    await expect(dismissedSummary).toBeVisible();
    await dismissedSummary.click(); // expand <details>

    // The issue appears in the dismissed section with the reason
    await expect(
      page.getByText(/^Reason: Dev board only, not a shipping product$/)
    ).toBeVisible();

    // Re-enable it
    const reenableBtn = page.locator(`button[aria-label="Re-enable: ${title}"]`);
    await expect(reenableBtn).toBeVisible();
    await reenableBtn.click();

    // Issue returns to the active section; no longer in dismissed
    await expect(
      page.getByText(/^Reason: Dev board only, not a shipping product$/)
    ).toHaveCount(0);

    expect(getErrors()).toEqual([]);
  });

  test("Dismiss button requires a reason (cannot submit empty)", async ({ page }) => {
    const unique = `DismissEmpty ${Date.now()}`;
    await page.goto("/projects/new");
    await page.getByLabel("Project name").fill(unique);
    await page.getByLabel("Design prompt").fill("simple test");
    await page.getByRole("button", { name: /continue to workspace/i }).click();
    await page.getByRole("button", { name: /generate design/i }).click();
    await expect(page.getByText(/review/i).first()).toBeVisible();
    await page.waitForLoadState("networkidle");

    const dismissBtn = page.locator('button[aria-label^="Dismiss:"]').first();
    await dismissBtn.click();

    const submit = page.getByRole("button", { name: "Dismiss", exact: true });
    await expect(submit).toBeDisabled();

    // Cancel returns to the active panel with no change
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByLabel(/reason for accepting this trade-off/i)).toHaveCount(0);
  });
});
