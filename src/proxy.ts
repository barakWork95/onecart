import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { clientIp, isSearchRequest, searchThrottle } from "@/app/_search-throttle";

/** A plain 429 for a client over its search limit; noindex so crawlers drop the URL. */
function tooManySearches(retryAfterSeconds: number): NextResponse {
  return new NextResponse("Too many searches in a short time. Please wait a moment and try again.", {
    status: 429,
    headers: {
      "Retry-After": String(retryAfterSeconds),
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

/**
 * 1. Throttles searches per IP: each one can call the stores' rate-limited
 *    APIs (see `_search-throttle.ts`).
 * 2. Keeps the Supabase session cookie fresh. Server Components can read but
 *    not write cookies, so without this an expired access token would make a
 *    returning visitor's Saved/Alerts look empty. No-op without Supabase.
 */
export async function proxy(request: NextRequest) {
  if (isSearchRequest(request.method, request.nextUrl)) {
    const decision = await searchThrottle()(clientIp(request.headers));
    if (!decision.allowed) return tooManySearches(decision.retryAfterSeconds);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(toSet) {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });
  // Validates the JWT and refreshes it via setAll() when it's about to expire.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  // Pages that read the session; skip assets, the redirect route, and cron.
  matcher: [
    // Router prefetches of /search render only the static shell: no store calls, so no
    // throttle. Next strips their headers from `request`, so they're excluded here.
    {
      source: "/search",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    "/saved",
    "/alerts",
  ],
};
