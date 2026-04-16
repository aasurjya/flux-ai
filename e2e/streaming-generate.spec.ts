import { test, expect } from "@playwright/test";
import { guardConsole } from "./lib/test-helpers";

test.describe.configure({ mode: "serial" });

test.describe("Streaming generate button", () => {
  test("SSE stream narrates stage progress and page updates when done", async ({ page }, testInfo) => {
    const getErrors = guardConsole(page, testInfo);
    const unique = `Streaming ${Date.now()}`;

    await page.goto("/projects/new");
    await page.getByLabel("Project name").fill(unique);
    await page.getByLabel("Design prompt").fill("ESP32 dev board streaming test");
    await page.getByRole("button", { name: /continue to workspace/i }).click();

    // Watch the /generate-stream response — this asserts the SSE route is
    // actually hit (vs the fallback form path).
    const ssePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/generate-stream") &&
        res.headers()["content-type"]?.includes("text/event-stream") === true
    );

    await page.getByRole("button", { name: /generate design/i }).click();

    const sseResponse = await ssePromise;
    expect(sseResponse.status()).toBe(200);

    // The live pipeline progress panel should appear — UX-logic check:
    // the user sees SOMETHING within 2 seconds, not a dead spinner
    await expect(page.getByRole("status", { name: /generation progress/i }))
      .toBeVisible({ timeout: 2000 });

    // Eventually the page settles into review state (stub pipeline is fast)
    await expect(page.getByText(/review/i).first()).toBeVisible();

    expect(getErrors()).toEqual([]);
  });

  test("streaming panel fits within 375px mobile viewport without horizontal overflow", async ({ page }, testInfo) => {
    const getErrors = guardConsole(page, testInfo);

    // Use iPhone SE width — worst-case mobile
    await page.setViewportSize({ width: 375, height: 667 });

    const unique = `StreamMobile ${Date.now()}`;
    await page.goto("/projects/new");
    await page.getByLabel("Project name").fill(unique);
    await page.getByLabel("Design prompt").fill("ESP32 mobile overflow test");
    await page.getByRole("button", { name: /continue to workspace/i }).click();

    await page.getByRole("button", { name: /generate design/i }).click();

    // Wait for the live pipeline panel to appear
    const panel = page.getByRole("status", { name: /generation progress/i });
    await expect(panel).toBeVisible({ timeout: 4000 });

    // The panel must not cause horizontal scroll on the document
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    // The panel itself must fit within the viewport
    const panelBox = await panel.boundingBox();
    if (panelBox) {
      expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(375 + 1);
    }

    expect(getErrors()).toEqual([]);
  });

  test("clicking Generate while pending is a no-op (button disabled)", async ({ page }) => {
    const unique = `StreamingDisabled ${Date.now()}`;
    await page.goto("/projects/new");
    await page.getByLabel("Project name").fill(unique);
    await page.getByLabel("Design prompt").fill("test");
    await page.getByRole("button", { name: /continue to workspace/i }).click();

    const btn = page.getByRole("button", { name: /generate design/i });
    await btn.click();
    // Immediately after click, the button relabels to "Generating..." and is disabled
    await expect(page.getByRole("button", { name: /generating/i })).toBeDisabled();
  });
});
