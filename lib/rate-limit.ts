/**
 * In-memory sliding-window rate limiter. No external deps.
 *
 * Each key (typically a client IP) tracks a list of request timestamps.
 * A request is allowed if the number of timestamps within the current
 * window is below the limit. Expired entries are pruned lazily on every
 * check to prevent unbounded memory growth.
 *
 * This is a single-process limiter — it does NOT share state across
 * Next.js workers or replicas. For the pre-launch phase this is
 * acceptable; move to Redis-backed counting when horizontal scaling
 * becomes real.
 */

interface RateLimiterOptions {
  /** Window size in milliseconds. */
  windowMs: number;
  /** Maximum requests allowed per key within the window. */
  maxRequests: number;
}

interface RateLimiter {
  /**
   * Check whether a request from `key` should be allowed.
   * Returns true if allowed, false if rate-limited.
   * Automatically records the attempt when allowed.
   */
  check(key: string): boolean;
}

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const store = new Map<string, number[]>();
  let lastCleanup = Date.now();

  function cleanup(now: number) {
    const cutoff = now - opts.windowMs;
    for (const [key, timestamps] of store) {
      const valid = timestamps.filter((t) => t > cutoff);
      if (valid.length === 0) {
        store.delete(key);
      } else {
        store.set(key, valid);
      }
    }
    lastCleanup = now;
  }

  return {
    check(key: string): boolean {
      const now = Date.now();

      // Lazy cleanup: prune expired entries every window period
      if (now - lastCleanup > opts.windowMs) {
        cleanup(now);
      }

      const cutoff = now - opts.windowMs;
      const timestamps = (store.get(key) ?? []).filter((t) => t > cutoff);

      if (timestamps.length >= opts.maxRequests) {
        store.set(key, timestamps);
        return false;
      }

      timestamps.push(now);
      store.set(key, timestamps);
      return true;
    }
  };
}
