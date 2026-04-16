import { describe, it, expect } from "vitest";
import { isTokenValid } from "./auth";

describe("isTokenValid", () => {
  it("returns true when candidate matches expected", () => {
    expect(isTokenValid("my-secret-token", "my-secret-token")).toBe(true);
  });

  it("returns false when candidate differs from expected", () => {
    expect(isTokenValid("wrong-token", "my-secret-token")).toBe(false);
  });

  it("returns false when candidate is empty", () => {
    expect(isTokenValid("", "my-secret-token")).toBe(false);
  });

  it("returns false when expected is empty", () => {
    expect(isTokenValid("any", "")).toBe(false);
  });

  it("returns false when both are empty", () => {
    expect(isTokenValid("", "")).toBe(false);
  });

  it("handles different-length strings without throwing", () => {
    // crypto.timingSafeEqual requires equal-length buffers; our wrapper
    // must handle the mismatch gracefully (not throw).
    expect(isTokenValid("short", "much-longer-token-value")).toBe(false);
    expect(isTokenValid("much-longer-candidate-value", "short")).toBe(false);
  });
});
