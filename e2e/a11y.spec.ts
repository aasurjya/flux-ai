import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Accessibility (WCAG 2.1 AA)", () => {
  const pages = [
    { path: "/", label: "landing" },
    { path: "/projects", label: "projects list" },
    { path: "/projects/new", label: "new project form" },
    { path: "/projects/esp32-sensor-node", label: "workspace (mock)" }
  ];

  for (const { path, label } of pages) {
    test(`${label} passes axe with no serious/critical violations`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const severe = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical"
      );
      if (severe.length > 0) {
        const summary = severe
          .map((v) => `- [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`)
          .join("\n");
        throw new Error(`axe found ${severe.length} serious/critical violations on ${path}:\n${summary}`);
      }
      expect(severe).toHaveLength(0);
    });
  }
});
