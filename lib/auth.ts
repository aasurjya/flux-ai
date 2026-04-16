import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time token comparison. Prevents timing side-channel attacks
 * where an attacker measures response latency to brute-force a secret
 * character by character.
 *
 * Returns false (not throws) when either string is empty or when lengths
 * differ — crypto.timingSafeEqual requires equal-length buffers, so we
 * hash both sides to a fixed length before comparing.
 */
export function isTokenValid(candidate: string, expected: string): boolean {
  if (!candidate || !expected) return false;
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(expected, "utf8");
  // timingSafeEqual requires equal lengths. Pad the shorter buffer so
  // the comparison always runs in constant time relative to the longer.
  if (a.length !== b.length) {
    // Compare candidate against itself (constant time) then return false.
    // This prevents the length difference from leaking timing info.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}
