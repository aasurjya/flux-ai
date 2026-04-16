import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Global security headers middleware.
 *
 * Applies industry-baseline security headers (OWASP Secure Headers) to
 * every response — pages AND API routes. Individual routes may add
 * additional headers on top (e.g. Content-Disposition on the download
 * route), but these four are always present.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export const config = {
  // Match all routes except Next.js internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
