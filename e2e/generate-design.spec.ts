import { test, expect } from "@playwright/test";
import { guardConsole } from "./lib/test-helpers";

test.describe("Generate design flow", () => {
  test("Generate design advances a draft project to review", async ({ page }, testInfo) => {
    const getErrors = guardConsole(page, testInfo);

    // Seed a fresh draft via the UI
    const unique = `Gen Test ${Date.now()}`;
    await page.goto("/projects/new");
    await page.getByLabel("Project name").fill(unique);
    await page.getByLabel("Design prompt").fill("Simple LED blinker on ATtiny85");
    await page.getByLabel("Constraints").fill("2-layer");
    await page.getByRole("button", { name: /continue to workspace/i }).click();

    await expect(page).toHaveURL(/\/projects\/gen-test-/);
    // Draft project shows Generate design button
    const generateButton = page.getByRole("button", { name: /generate design/i });
    await expect(generateButton).toBeVisible();

    await generateButton.click();

    // After generation, status becomes review and sections are populated
    await expect(page.getByText(/review/i).first()).toBeVisible();

    // Requirements section populated
    await expect(
      page.getByRole("heading", { name: /requirements summary/i })
    ).toBeVisible();

    // Architecture section populated
    await expect(
      page.getByRole("heading", { name: /architecture blocks/i })
    ).toBeVisible();

    // BOM populated (starter BOM card present)
    await expect(
      page.getByRole("heading", { name: /starter bom/i })
    ).toBeVisible();

    // After generation the Generate button no longer appears (status !== draft)
    await expect(generateButton).not.toBeVisible();

    expect(getErrors()).toEqual([]);
  });

  test("state-coherence: draft has Generate button; review does not", async ({ page }) => {
    // review-status seed from mock data
    await page.goto("/projects/esp32-sensor-node");
    await expect(
      page.getByRole("button", { name: /generate design/i })
    ).toHaveCount(0);
  });

  test("state-coherence: drafts hide Export and Improve buttons until a design exists", async ({ page }) => {
    // Fresh project, no generation yet
    const unique = `Coherence ${Date.now()}`;
    await page.goto("/projects/new");
    await page.getByLabel("Project name").fill(unique);
    await page.getByLabel("Design prompt").fill("anything");
    await page.getByRole("button", { name: /continue to workspace/i }).click();

    // Draft workspace: Generate visible, Export + Improve hidden (no design yet)
    await expect(page.getByRole("button", { name: /generate design/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /export to kicad/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /improve design/i })).toHaveCount(0);

    // After generate: Export + Improve should appear
    await page.getByRole("button", { name: /generate design/i }).click();
    await expect(page.getByRole("button", { name: /export to kicad/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /improve design/i })).toBeVisible();
  });
});
