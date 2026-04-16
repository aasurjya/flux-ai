import { describe, it, expect } from "vitest";
import { middleware } from "./middleware";
import { NextRequest } from "next/server";

function req(url = "http://localhost:3000/") {
  return new NextRequest(url);
}

describe("security headers middleware", () => {
  it("sets Strict-Transport-Security header", () => {
    const res = middleware(req());
    expect(res.headers.get("Strict-Transport-Security")).toMatch(/max-age=\d+/);
  });

  it("sets X-Content-Type-Options: nosniff", () => {
    const res = middleware(req());
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets X-Frame-Options: DENY", () => {
    const res = middleware(req());
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("sets Referrer-Policy", () => {
    const res = middleware(req());
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("applies to API routes too", () => {
    const res = middleware(req("http://localhost:3000/api/projects/import"));
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
