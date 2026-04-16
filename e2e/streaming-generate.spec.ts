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
