import { test, expect } from "@playwright/test";
import { guardConsole } from "./lib/test-helpers";

test.describe.configure({ mode: "serial" });

test.describe("Delete project flow", () => {
  test("user can delete their own project after confirming", async ({ page }, testInfo) => {
    const getErrors = guardConsole(page, testInfo);
    const unique = `DeleteMe ${Date.now()}`;

    // Create
    await page.goto("/projects/new");
    await page.getByLabel("Project name").fill(unique);
    await page.getByLabel("Design prompt").fill("throwaway test project");
    await page.getByRole("button", { name: /continue to workspace/i }).click();
    await expect(page).toHaveURL(/\/projects\/deleteme-/);

    // Back to list — verify project is listed
    await page.goto("/projects");
    await expect(page.getByText(unique)).toBeVisible();

    // Click the delete button on the card, accept the confirm()
    page.on("dialog", (dialog) => dialog.accept());
    const deleteBtn = page.getByRole("button", { name: new RegExp(`Delete project ${unique}`, "i") });
    await deleteBtn.click();

    // Project is gone
    await expect(page.getByText(unique)).toHaveCount(0);

    expect(getErrors()).toEqual([]);
  });

  test("mock/sample project is NOT deletable (no delete button)", async ({ page }) => {
    await page.goto("/projects");
    // The seeded ESP32 sensor project is the only one that's always there
    const sampleCard = page.getByRole("heading", { name: "ESP32 Sensor Node" }).locator("..").locator("..");
    // The delete aria-label should NOT appear for sample projects
    await expect(
      sampleCard.getByRole("button", { name: /Delete project ESP32 Sensor Node/i })
    ).toHaveCount(0);
  });

  test("cancelling the confirm dialog keeps the project", async ({ page }) => {
    const unique = `KeepMe ${Date.now()}`;
    await page.goto("/projects/new");
    await page.getByLabel("Project name").fill(unique);
    await page.getByLabel("Design prompt").fill("should not be deleted");
    await page.getByRole("button", { name: /continue to workspace/i }).click();
    // Wait for the workspace redirect to settle before navigating back
    await expect(page).toHaveURL(/\/projects\/keepme-/);

    // Revalidation after the server action can lag under test load —
    // give the list page a generous timeout + reload to force fresh fetch.
    await page.goto("/projects");
    await expect(page.getByText(unique)).toBeVisible({ timeout: 10_000 });

    // Dismiss the confirm — project stays
    page.on("dialog", (dialog) => dialog.dismiss());
    await page
      .getByRole("button", { name: new RegExp(`Delete project ${unique}`, "i") })
      .click();
    await page.waitForTimeout(200);
    await expect(page.getByText(unique)).toBeVisible();
  });
});
