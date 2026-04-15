import { test, expect } from "@playwright/test";
import { guardConsole } from "./lib/test-helpers";

test.describe.configure({ mode: "serial" });

test.describe("Revision compare", () => {
  test("user can compare two revisions and see structured diff rows", async ({ page }, testInfo) => {
    const getErrors = guardConsole(page, testInfo);
    const unique = `CompareTest ${Date.now()}`;

    // Create a project and generate — that produces 2 revisions
    // (Initial brief + AI generation)
    await page.goto("/projects/new");
    await page.getByLabel("Project name").fill(unique);
    await page.getByLabel("Design prompt").fill("USB-C sensor board");
    await page.getByRole("button", { name: /continue to workspace/i }).click();
    await page.getByRole("button", { name: /generate design/i }).click();

    // Run Improve — 3rd revision with richer diff (stub adds decoupling caps)
    await page.getByRole("button", { name: /improve design/i }).click();
    await expect(page.getByText(/ai improvement/i).first()).toBeVisible({ timeout: 10_000 });

    // Compare panel should be visible (3 revisions ≥ 2 threshold)
    await expect(page.getByRole("heading", { name: /compare revisions/i })).toBeVisible();

    // Pick the latest (Revision B = current default) vs Initial brief (Revision A).
    // Playwright's selectOption only accepts string labels (not regexes),
    // so use the option's exact text.
    await page.locator("#compareA").selectOption({ label: "Initial brief" });
    await page.getByRole("button", { name: /^compare$/i }).click();

    // After the GET submit, URL has compareA + compareB params
    await expect(page).toHaveURL(/compareA=rev-.+&compareB=rev-.+/);

    // Diff card renders
    await expect(page.getByText(/initial brief.*→/i).first()).toBeVisible();
    // Expect BOM additions from the AI generation + improve (stub adds C1/C2 via improveDesign)
    // The diff should mention at least "BOM" section heading
    await expect(page.getByText(/^BOM$/i).first()).toBeVisible();

    expect(getErrors()).toEqual([]);
  });

  test("compare panel is hidden when only one revision exists (fresh draft)", async ({ page }) => {
    const unique = `OneRev ${Date.now()}`;
    await page.goto("/projects/new");
    await page.getByLabel("Project name").fill(unique);
    await page.getByLabel("Design prompt").fill("fresh");
    await page.getByRole("button", { name: /continue to workspace/i }).click();
    // Draft has just "Initial brief" — only 1 revision
    await expect(page.getByRole("heading", { name: /compare revisions/i })).toHaveCount(0);
  });
});
