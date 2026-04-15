import { test, expect } from "@playwright/test";
import { guardConsole } from "./lib/test-helpers";
import { auditPage, expectNoHighFindings } from "./lib/ai-page-audit";

test.describe("Create project flow", () => {
  test("form requires name and prompt and submits successfully", async ({ page }, testInfo) => {
    const getErrors = guardConsole(page, testInfo);
    await page.goto("/projects/new");

    // Required fields
    await expect(page.getByLabel("Project name")).toBeVisible();
    await expect(page.getByLabel("Design prompt")).toBeVisible();

    // HTML5 required prevents submission on empty
    await expect(page.getByLabel("Project name")).toHaveAttribute("required", "");
    await expect(page.getByLabel("Design prompt")).toHaveAttribute("required", "");

    // Fill happy path
    const unique = `Playwright Test ${Date.now()}`;
    await page.getByLabel("Project name").fill(unique);
    await page.getByLabel("Design prompt").fill("USB-C powered MCU dev board, SMD only");
    await page.getByLabel("Constraints").fill("2-layer, SMD only");
    await page.getByLabel("Preferred components").fill("ESP32-S3");

    await page.getByRole("button", { name: /continue to workspace/i }).click();

    // Redirects to the workspace for the new project
    await expect(page).toHaveURL(/\/projects\/playwright-test-/);
    await expect(page.locator("h1, h2, h3").filter({ hasText: unique })).toBeVisible();

    // The Generate-design button SHOULD be visible for a draft project
    await expect(page.getByRole("button", { name: /generate design/i })).toBeVisible();

    expect(getErrors()).toEqual([]);
  });

  test("workspace exposes constraints as badges and the original prompt", async ({ page }) => {
    // Re-use the mock project that ships with the app
    await page.goto("/projects/esp32-sensor-node");
    await expect(
      page.getByText(/battery-powered esp32-s3 board/i)
    ).toBeVisible();
    // constraints rendered as badges
    await expect(page.getByText("2-layer board")).toBeVisible();
    await expect(page.getByText("Low-cost BOM")).toBeVisible();
  });

  test("AI audit: new-project form page", async ({ page }) => {
    await page.goto("/projects/new");
    const audit = await auditPage(page, {
      context: "New project creation form",
      expectedState:
        "Form with project name, design prompt (required), constraints, preferred components; submit CTA; cancel link"
    });
    expectNoHighFindings(audit);
  });
});
