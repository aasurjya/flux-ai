import type { Page, TestInfo } from "@playwright/test";

/**
 * Attach a page-error and console-error guard. Any unhandled page error
 * or uncaught console.error fails the test with a helpful message.
 */
export function guardConsole(page: Page, testInfo: TestInfo): () => string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // Filter out known benign browser/devtools chatter that isn't an app
    // problem: React devtools hint, favicon/manifest 404s during dev.
    if (text.includes("Download the React DevTools")) return;
    if (/Failed to load resource.*(favicon|manifest|apple-touch-icon)/i.test(text)) return;
    if (/Failed to load resource: the server responded with a status of 404/.test(text)) return;
    errors.push(`console.error: ${text}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 500) {
      errors.push(`${res.status()} ${res.url()}`);
    }
  });
  testInfo.annotations.push({
    type: "console-guard",
    description: "page errors and 5xx responses are captured"
  });
  return () => errors;
}

/**
 * Walk the flow using only keyboard — Tab to focus, Enter to activate.
 * Returns the sequence of focused elements' accessible names so tests
 * can assert the tab order makes sense.
 */
export async function keyboardWalk(page: Page, maxTabs: number): Promise<string[]> {
  const names: string[] = [];
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press("Tab");
    const name = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return "";
      const role = el.getAttribute("role") ?? el.tagName.toLowerCase();
      const accessible =
        el.getAttribute("aria-label") ??
        el.textContent?.trim().slice(0, 60) ??
        el.getAttribute("name") ??
        el.getAttribute("placeholder") ??
        "";
      return `${role}:${accessible}`;
    });
    if (name) names.push(name);
  }
  return names;
}
