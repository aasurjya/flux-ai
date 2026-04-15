import { test, expect } from "@playwright/test";
import { guardConsole } from "./lib/test-helpers";

test.describe.configure({ mode: "serial" });

test.describe("Project JSON export + import", () => {
  test("round-trip: create → export → import → new project appears", async ({ page, request }, testInfo) => {
    const getErrors = guardConsole(page, testInfo);
    const unique = `RoundTrip ${Date.now()}`;

    // Create + generate (so there's some data worth exporting)
    await page.goto("/projects/new");
    await page.getByLabel("Project name").fill(unique);
    await page.getByLabel("Design prompt").fill("USB-C sensor board");
    await page.getByRole("button", { name: /continue to workspace/i }).click();
    await expect(page).toHaveURL(/\/projects\/roundtrip-/);
    await page.getByRole("button", { name: /generate design/i }).click();

    // Find the project's id from the URL
    const url = new URL(page.url());
    const projectId = url.pathname.split("/").pop()!;

    // Fetch the export JSON directly via the API (avoids download dialog handling)
    const exportRes = await request.get(`/api/projects/${projectId}/export-json`);
    expect(exportRes.status()).toBe(200);
    expect(exportRes.headers()["content-type"]).toMatch(/application\/json/);
    const json = await exportRes.json();
    expect(json.id).toBe(projectId);
    expect(json.name).toBe(unique);

    // POST that payload back to the import endpoint
    const importRes = await request.post("/api/projects/import", {
      data: json,
      headers: { "content-type": "application/json" }
    });
    expect(importRes.status()).toBe(201);
    const importBody = await importRes.json();
    expect(importBody.id).toBeDefined();
    expect(importBody.id).not.toBe(projectId); // fresh id

    // Reload list and check both copies are present
    await page.goto("/projects");
    const cards = page.getByText(unique);
    // Title appears at least twice (original + imported) — both retain the same display name
    expect(await cards.count()).toBeGreaterThanOrEqual(2);

    expect(getErrors()).toEqual([]);
  });

  test("import rejects invalid JSON via the UI", async ({ page }, testInfo) => {
    guardConsole(page, testInfo);
    await page.goto("/projects");

    // Expand the import panel
    await page.getByText(/import project from json/i).click();
    const textarea = page.getByPlaceholder(/paste the contents/i);
    await textarea.fill("not valid json {{{");
    await page.getByRole("button", { name: /^import$/i }).click();

    // Client-side server action returns an error to the form state
    await expect(page.getByText(/not valid json|check the file contents|schema mismatch/i).first()).toBeVisible();
  });

  test("export-json API rejects path-traversal-shaped ids", async ({ request }) => {
    const res = await request.get("/api/projects/..%2F..%2Fetc%2Fpasswd/export-json");
    expect([400, 404]).toContain(res.status());
  });
});
