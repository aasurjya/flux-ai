import { test, expect } from "@playwright/test";
import { guardConsole, keyboardWalk } from "./lib/test-helpers";
import { auditPage, expectNoHighFindings } from "./lib/ai-page-audit";

test.describe("Landing page", () => {
  test("semantic structure: one h1, feature cards, two CTAs", async ({ page }, testInfo) => {
    const getErrors = guardConsole(page, testInfo);
    await page.goto("/");

    // Exactly one h1 (document heading hierarchy discipline)
    await expect(page.locator("h1")).toHaveCount(1);

    // Primary CTA points to /projects/new, secondary to /projects
    await expect(
      page.getByRole("link", { name: /start a new project/i })
    ).toHaveAttribute("href", "/projects/new");
    await expect(
      page.getByRole("link", { name: /view sample workspace/i })
    ).toHaveAttribute("href", "/projects");

    // Four feature cards
    const cards = page.locator("main [class*='card'], main [class*='Card']");
    // Fall back to a broader locator to count headings inside cards
    const cardHeadings = page.locator("main h2, main h3").filter({
      hasText: /prompt to circuit|component-aware|validation-first|kicad export/i
    });
    await expect(cardHeadings).toHaveCount(4);

    expect(getErrors()).toEqual([]);
  });

  test("keyboard-only user can reach the primary CTA", async ({ page }, testInfo) => {
    guardConsole(page, testInfo);
    await page.goto("/");
    const focused = await keyboardWalk(page, 10);
    // The primary CTA text should appear in the first few focused elements
    const hasPrimaryCta = focused.some((name) =>
      /start a new project/i.test(name)
    );
    expect(hasPrimaryCta).toBe(true);
  });

  test("AI audit (skipped unless USE_AI_AUDIT=true): no high/critical findings", async ({ page }) => {
    await page.goto("/");
    const audit = await auditPage(page, {
      context: "Marketing landing page; user just loaded it for the first time",
      expectedState: "Pitch visible, primary CTA (Start a new project) obvious, feature cards readable"
    });
    expectNoHighFindings(audit);
  });
});
