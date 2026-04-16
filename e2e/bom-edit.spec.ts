import { test, expect } from "@playwright/test";
import { guardConsole } from "./lib/test-helpers";

test.describe.configure({ mode: "serial" });

test.describe("Inline BOM editing", () => {
  test("user can flip a BOM row from needs_review to selected without AI", async ({ page }, testInfo) => {
    const getErrors = guardConsole(page, testInfo);
    const unique = `BomEdit ${Date.now()}`;

    await page.goto("/projects/new");
    await page.getByLabel("Project name").fill(unique);
    await page.getByLabel("Design prompt").fill("ESP32 board for BOM test");
    await page.getByRole("button", { name: /continue to workspace/i }).click();
    await page.getByRole("button", { name: /generate design/i }).click();
    // Wait for review state + DOM stable (generate = 5 stubbed LLM calls)
    await expect(page.getByText(/review/i).first()).toBeVisible();
    await page.waitForLoadState("networkidle");

    // Grab the first BOM row's designator from the DOM — find by "Edit <des>" aria-label
    const firstEditBtn = page.locator("button[aria-label^='Edit ']").first();
    await expect(firstEditBtn).toBeVisible();
    const ariaLabel = (await firstEditBtn.getAttribute("aria-label")) ?? "";
    const designator = ariaLabel.replace("Edit ", "");

    // Capture original revision count before editing
    const originalRevCount = await page
      .locator("section,article,div")
      .filter({ hasText: /ai generation|initial brief|ai improvement|edited /i })
      .count();

    // Click pencil, change the part name (always differs from the current
    // value so the save is never a no-op regardless of seed data), save.
    await firstEditBtn.click();
    const nameInput = page.getByLabel("Part name", { exact: true });
    await expect(nameInput).toBeVisible();
    const newName = `Edited part ${Date.now()}`;
    await nameInput.fill(newName);
    const saveBtn = page.getByRole("button", { name: "Save BOM edit", exact: true });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Status badge should now read "selected" for that designator
    await expect(
      page.locator(`text=${designator}`).first()
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /save bom edit/i })
    ).toHaveCount(0); // edit mode exited

    // A new "Edited {designator}" revision should appear in history
    await expect(
      page.getByText(new RegExp(`edited ${designator}`, "i")).first()
    ).toBeVisible();

    const newRevCount = await page
      .locator("section,article,div")
      .filter({ hasText: /ai generation|initial brief|ai improvement|edited /i })
      .count();
    expect(newRevCount).toBeGreaterThan(originalRevCount);

    expect(getErrors()).toEqual([]);
  });

  test("Cancel button discards edits without creating a revision", async ({ page }) => {
    const unique = `BomCancel ${Date.now()}`;
    await page.goto("/projects/new");
    await page.getByLabel("Project name").fill(unique);
    await page.getByLabel("Design prompt").fill("test");
    await page.getByRole("button", { name: /continue to workspace/i }).click();
    await page.getByRole("button", { name: /generate design/i }).click();
    await expect(page.getByText(/review/i).first()).toBeVisible();
    await page.waitForLoadState("networkidle");

    const firstEditBtn = page.locator("button[aria-label^='Edit ']").first();
    await firstEditBtn.click();

    // Modify the Part name
    const nameInput = page.getByLabel("Part name");
    await nameInput.fill("SHOULD NOT PERSIST");

    // Cancel
    await page.getByRole("button", { name: /cancel edit/i }).click();

    // Edit mode exited
    await expect(page.getByLabel("Part name")).toHaveCount(0);
    // The abandoned value doesn't show anywhere on the page
    await expect(page.locator("text=SHOULD NOT PERSIST")).toHaveCount(0);
  });
});
