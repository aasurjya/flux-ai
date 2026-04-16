import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import * as React from "react";

// We test the toast module's exports and the Toaster rendering.
// Since ToastProvider uses useState/useEffect (client hooks), we test
// the Toaster's static rendering and the provider's context contract.

describe("Toast module", () => {
  it("exports ToastProvider, Toaster, and useToast", async () => {
    const mod = await import("./toast");
    expect(mod.ToastProvider).toBeDefined();
    expect(mod.Toaster).toBeDefined();
    expect(mod.useToast).toBeDefined();
  });

  it("Toaster renders an aria-live region", async () => {
    // Import dynamically so vitest resolves the module fresh
    const { Toaster, ToastProvider } = await import("./toast");

    // Wrap in provider — initial state has no toasts, so the region
    // should exist but be empty
    const html = renderToStaticMarkup(
      <ToastProvider>
        <Toaster />
      </ToastProvider>
    );
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="status"');
  });
});
