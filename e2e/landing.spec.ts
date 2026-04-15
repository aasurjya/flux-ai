import { test, expect } from "@playwright/test";

// Baseline smoke test. Asserts the landing page renders with the
// semantic structure a user expects — a single h1, at least one
// primary CTA, and no console errors. Future UX-logic specs extend
// from this pattern.
test.describe("Landing page", () => {
  test("renders the primary pitch and CTA", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("link", { name: /new project|get started|start/i }).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
