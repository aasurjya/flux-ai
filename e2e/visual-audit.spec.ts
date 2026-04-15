import { test, expect } from "@playwright/test";
import { guardConsole } from "./lib/test-helpers";

/**
 * Visual reality check — drives the complete user flow end-to-end and
 * captures screenshots at every state. Fails on any console error,
 * unhandled rejection, 5xx response, or broken selector.
 *
 * Screenshots land in test-results/ so a human (or a follow-up AI
 * page-audit) can review whether the UI actually looks right.
 */

test.describe("Visual reality check — full user journey", () => {
  test("landing → new → generate → export with screenshots at every state", async ({ page }, testInfo) => {
    const getErrors = guardConsole(page, testInfo);
    const unique = `Audit ${Date.now()}`;

    // 1. Landing page
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);
    await testInfo.attach("01-landing.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png"
    });

    // 2. New project form
    await page.getByRole("link", { name: /start a new project/i }).click();
    await expect(page).toHaveURL(/\/projects\/new/);
    await testInfo.attach("02-new-form-empty.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png"
    });

    // 3. Fill form and submit
    await page.getByLabel("Project name").fill(unique);
    await page.getByLabel("Design prompt").fill(
      "USB-C powered sensor board with ESP32-S3, IMU over I2C, status LEDs, programming header"
    );
    await page.getByLabel("Constraints").fill("2-layer board, Low-cost BOM, USB-C input");
    await page.getByLabel("Preferred components").fill("ESP32-S3, ICM-42688-P");
    await testInfo.attach("03-new-form-filled.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png"
    });

    await page.getByRole("button", { name: /continue to workspace/i }).click();

    // 4. Workspace — draft state
    await expect(page).toHaveURL(/\/projects\/audit-/);
    await expect(page.getByRole("button", { name: /generate design/i })).toBeVisible();
    await testInfo.attach("04-workspace-draft.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png"
    });

    // 5. Run generation
    await page.getByRole("button", { name: /generate design/i }).click();
    await expect(page.getByText(/review/i).first()).toBeVisible();
    // Wait a beat for the circuit graph to paint
    await page.waitForTimeout(400);
    await testInfo.attach("05-workspace-review.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png"
    });

    // Assert the circuit graph rendered as SVG (not placeholder text)
    await expect(page.locator("svg[role='img']").first()).toBeVisible();
    const svgLabel = await page.locator("svg[role='img']").first().getAttribute("aria-label");
    expect(svgLabel).toMatch(/Circuit block diagram with \d+ blocks/);

    // 6. Run export
    await page.getByRole("button", { name: /export to kicad/i }).click();
    await expect(page.getByRole("heading", { name: /kicad export/i })).toBeVisible();
    await expect(page.getByText(/completed/i).first()).toBeVisible({ timeout: 15_000 });
    await testInfo.attach("06-export-completed.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png"
    });

    // 7. Verify the download link works
    const downloadLink = page.getByRole("link", { name: /download kicad package/i });
    await expect(downloadLink).toBeVisible();
    const href = await downloadLink.getAttribute("href");
    expect(href).toMatch(/^\/api\/exports\/.+\/download$/);

    // Fetch the zip and confirm it's a real zip file
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/zip");
    const bytes = await response.body();
    expect(bytes.length).toBeGreaterThan(500);
    // PK is the zip magic number
    expect(bytes.slice(0, 2).toString()).toBe("PK");

    // 8. Check revision history grew
    await expect(
      page.getByRole("heading", { name: /revision history/i })
    ).toBeVisible();
    await testInfo.attach("07-final-workspace.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png"
    });

    // 9. Projects list shows our new project
    await page.goto("/projects");
    await expect(page.getByText(unique)).toBeVisible();
    await testInfo.attach("08-projects-list.png", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png"
    });

    // Final sanity — no errors the whole way through
    expect(getErrors()).toEqual([]);
  });
});
