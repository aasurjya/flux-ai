import { describe, it, expect, beforeEach } from "vitest";
import { splitListValue, slugify } from "./project-store";

describe("project-store utilities", () => {
  describe("splitListValue", () => {
    it("splits comma-separated values", () => {
      const result = splitListValue("a, b, c");
      expect(result).toEqual(["a", "b", "c"]);
    });

    it("trims whitespace", () => {
      const result = splitListValue("  x  ,  y  ,  z  ");
      expect(result).toEqual(["x", "y", "z"]);
    });

    it("filters empty strings", () => {
      const result = splitListValue("a,,b,,c,");
      expect(result).toEqual(["a", "b", "c"]);
    });

    it("returns empty array for empty input", () => {
      const result = splitListValue("");
      expect(result).toEqual([]);
    });
  });

  describe("slugify", () => {
    it("converts to lowercase", () => {
      const result = slugify("HELLO WORLD");
      expect(result).toBe("hello-world");
    });

    it("replaces special chars with hyphens", () => {
      const result = slugify("hello@world#test");
      expect(result).toBe("hello-world-test");
    });

    it("trims leading/trailing hyphens", () => {
      const result = slugify("-hello-world-");
      expect(result).toBe("hello-world");
    });

    it("limits to 48 chars", () => {
      const longName = "a".repeat(60);
      const result = slugify(longName);
      expect(result.length).toBe(48);
    });
  });
});
