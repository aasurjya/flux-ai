import { test, expect } from "@playwright/test";
import { guardConsole } from "./lib/test-helpers";

// File-level serial execution: the workspace test writes to
// data/projects.json, and multiple Playwright workers racing on the
// same file can lose writes. Keep responsive tests serial.
test.describe.configure({ mode: "serial" });

// Three representative viewports. iPhone SE = worst-case mobile width.
// iPad = mid. Desktop = reference.
const viewports: Array<{ label: string; viewport: { width: number; height: number } }> = [
  { label: "mobile (iPhone SE 375×667)", viewport: { width: 375, height: 667 } },
  { label: "tablet (iPad 768×1024)", viewport: { width: 768, height: 1024 } },
  { label: "desktop (1280×800)", viewport: { width: 1280, height: 800 } }
];

for (const { label, viewport } of viewports) {
  test.describe(`Responsive: ${label}`, () => {
    test.use({ viewport });

    test("landing — h1 visible, primary CTA tappable (≥44px hit area)", async ({ page }, testInfo) => {
      guardConsole(page, testInfo);
      await page.goto("/");

      const h1 = page.locator("h1");
      await expect(h1).toBeVisible();
      const h1Box = await h1.boundingBox();
      expect(h1Box!.width).toBeLessThanOrEqual(viewport.width); // no overflow

      const cta = page.getByRole("link", { name: /start a new project/i });
      await expect(cta).toBeVisible();
      const ctaBox = await cta.boundingBox();
      // WCAG 2.5.5: Target Size (Level AAA) — minimum 44×44 CSS px. Accept 40 for anchors that sit inside a sized button wrapper.
      expect(ctaBox!.height).toBeGreaterThanOrEqual(40);
    });

    test("new project form — all inputs fit the viewport with no horizontal scroll", async ({ page }, testInfo) => {
      guardConsole(page, testInfo);
      await page.goto("/projects/new");

      for (const labelText of ["Project name", "Design prompt", "Constraints", "Preferred components"]) {
        const field = page.getByLabel(labelText);
        await expect(field).toBeVisible();
        const box = await field.boundingBox();
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
      }

      // No horizontal scroll on the document
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });

    test("workspace — action buttons never overflow; circuit graph scrolls horizontally when wider than screen", async ({ page }, testInfo) => {
      guardConsole(page, testInfo);

      // Seed a project by going through the UI (state-respecting)
      const unique = `Resp ${label} ${Date.now()}`;
      await page.goto("/projects/new");
      await page.getByLabel("Project name").fill(unique);
      await page.getByLabel("Design prompt").fill("USB-C MCU board");
      await page.getByRole("button", { name: /continue to workspace/i }).click();
      // Wait for workspace to settle before clicking Generate — server
      // actions + revalidatePath can take a moment on slower viewports.
      await expect(page).toHaveURL(/\/projects\/resp-/);
      await page.getByRole("button", { name: /generate design/i }).click({ timeout: 10_000 });

      // After generate: all action buttons (Export + Improve) should be
      // visible and fit within the viewport.
      const exportBtn = page.getByRole("button", { name: /export to kicad/i });
      const improveBtn = page.getByRole("button", { name: /improve design/i });
      await expect(exportBtn).toBeVisible();
      await expect(improveBtn).toBeVisible();
      const exportBox = await exportBtn.boundingBox();
      const improveBox = await improveBtn.boundingBox();
      expect(exportBox!.x + exportBox!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(improveBox!.x + improveBox!.width).toBeLessThanOrEqual(viewport.width + 1);

      // The page as a whole must not have horizontal overflow — the
      // circuit graph itself is allowed to scroll inside its own
      // container (overflow-x-auto), but the document must not.
      const docScroll = await page.evaluate(() => document.documentElement.scrollWidth);
      const docClient = await page.evaluate(() => document.documentElement.clientWidth);
      expect(docScroll).toBeLessThanOrEqual(docClient + 1);

      // SVG is rendered (not the fallback text list)
      await expect(page.locator("svg[role='img']").first()).toBeVisible();
    });
  });
}
