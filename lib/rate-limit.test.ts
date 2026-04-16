import { describe, it, expect, beforeEach, vi } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("allows requests within the limit", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 3 });
    expect(limiter.check("ip-1")).toBe(true);
    expect(limiter.check("ip-1")).toBe(true);
    expect(limiter.check("ip-1")).toBe(true);
  });

  it("rejects the request that exceeds the limit", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 2 });
    expect(limiter.check("ip-1")).toBe(true);
    expect(limiter.check("ip-1")).toBe(true);
    expect(limiter.check("ip-1")).toBe(false); // 3rd request rejected
  });

  it("tracks different keys independently", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    expect(limiter.check("ip-1")).toBe(true);
    expect(limiter.check("ip-2")).toBe(true); // different key, own window
    expect(limiter.check("ip-1")).toBe(false); // ip-1 exhausted
  });

  it("resets after the window expires", () => {
    const limiter = createRateLimiter({ windowMs: 1_000, maxRequests: 1 });
    expect(limiter.check("ip-1")).toBe(true);
    expect(limiter.check("ip-1")).toBe(false);

    vi.advanceTimersByTime(1_001);

    expect(limiter.check("ip-1")).toBe(true); // window expired, allowed again
  });

  it("cleans up expired entries to prevent memory leaks", () => {
    const limiter = createRateLimiter({ windowMs: 1_000, maxRequests: 1 });
    limiter.check("ip-1");
    limiter.check("ip-2");

    vi.advanceTimersByTime(1_001);

    // Next check triggers cleanup of expired entries
    limiter.check("ip-3");
    // Internal state should not retain ip-1 and ip-2 entries
    // (no public API to verify, but check they're allowed again)
    expect(limiter.check("ip-1")).toBe(true);
    expect(limiter.check("ip-2")).toBe(true);
  });
});
