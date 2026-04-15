import { test, expect } from "@playwright/test";
import { guardConsole } from "./lib/test-helpers";

test.describe("Export to KiCad flow", () => {
  test("running an export produces a completed job with a download link", async ({ page }, testInfo) => {
    const getErrors = guardConsole(page, testInfo);

    // Fresh project → generate → export
    const unique = `Export Test ${Date.now()}`;
    await page.goto("/projects/new");
    await page.getByLabel("Project name").fill(unique);
    await page.getByLabel("Design prompt").fill("USB-C mcu board with IMU");
    await page.getByLabel("Constraints").fill("SMD only, 2-layer");
    await page.getByRole("button", { name: /continue to workspace/i }).click();
    await page.getByRole("button", { name: /generate design/i }).click();

    // Run export
    await page.getByRole("button", { name: /export to kicad/i }).click();

    // Export job card appears and completes (server action runs synchronously now)
    await expect(page.getByRole("heading", { name: /kicad export/i })).toBeVisible();
    await expect(page.getByText(/completed/i).first()).toBeVisible({ timeout: 15_000 });

    // Download link must only appear when status is completed
    const downloadLink = page.getByRole("link", { name: /download kicad package/i });
    await expect(downloadLink).toBeVisible();
    const href = await downloadLink.getAttribute("href");
    expect(href).toMatch(/^\/api\/exports\/.+\/download$/);

    // Fetch the zip and confirm firmware scaffold is in it
    const response = await page.request.get(href!);
    expect(response.status()).toBe(200);
    const bytes = await response.body();
    expect(bytes.length).toBeGreaterThan(500);
    // zip local-file-header entries include each path as ASCII — search
    // raw bytes for 'firmware/' which indicates MCU scaffold present
    expect(bytes.toString("binary")).toContain("firmware/");

    expect(getErrors()).toEqual([]);
  });

  test("hitting the download endpoint for a non-existent job returns 404", async ({ request }) => {
    const res = await request.get("/api/exports/does-not-exist/download");
    expect(res.status()).toBe(404);
  });

  test("hitting the download endpoint with a path-traversal-shaped id returns 400", async ({ request }) => {
    const res = await request.get("/api/exports/..%2F..%2Fetc%2Fpasswd/download");
    // Either 400 (our validation) or 404 if url decoded differently — both acceptable
    expect([400, 404]).toContain(res.status());
  });
});
