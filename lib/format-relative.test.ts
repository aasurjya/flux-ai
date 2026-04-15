import { describe, it, expect } from "vitest";
import { formatRelative } from "./format-relative";

describe("formatRelative", () => {
  const NOW = new Date("2026-04-15T12:00:00Z");

  it("returns 'just now' for <60s ago", () => {
    expect(formatRelative("2026-04-15T11:59:30Z", NOW)).toBe("just now");
  });

  it("minutes", () => {
    expect(formatRelative("2026-04-15T11:45:00Z", NOW)).toBe("15m ago");
  });

  it("hours", () => {
    expect(formatRelative("2026-04-15T09:00:00Z", NOW)).toBe("3h ago");
  });

  it("days under a week", () => {
    expect(formatRelative("2026-04-13T12:00:00Z", NOW)).toBe("2d ago");
  });

  it("falls back to short date for older items", () => {
    const older = formatRelative("2026-03-01T12:00:00Z", NOW);
    expect(older).toMatch(/Mar\s*1/);
  });

  it("passes through legacy non-ISO strings unchanged", () => {
    expect(formatRelative("Updated just now", NOW)).toBe("Updated just now");
  });
});
