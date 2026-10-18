import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_REALM, adminAccess } from "@/app/_admin-auth";
import { clientIp, isSearchRequest, searchThrottle } from "@/app/_search-throttle";
import { CATEGORIES, DEMO_CATEGORIES } from "@/config/categories";
import { env } from "@/config/env";
import { splitLocale } from "@/i18n/locales";

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
 * /c/{slug} for a category that doesn't exist: a real 404. The page itself
 * can only call notFound() after its shell has streamed with a 200 (Cache
 * Components), which search engines read as a "soft 404".
 */
function unknownCategory(request: NextRequest): NextResponse | null {
  const slug = /^\/c\/([^/]+)\/?$/.exec(splitLocale(request.nextUrl.pathname).path)?.[1];
  if (slug === undefined) return null;
  const categories = env().ONECART_DEMO_PROVIDERS ? DEMO_CATEGORIES : CATEGORIES;
  if (categories.some((c) => c.slug === slug)) return null;
  return notFound(request);
}

/** A real 404: no route matches this path, so the global not-found page renders. */
function notFound(request: NextRequest): NextResponse {
  return NextResponse.rewrite(new URL("/_not-found-page", request.url), { status: 404 });
}

/** The Hebrew interface while it's switched off (`HEBREW_UI`): it doesn't exist yet. */
export function hebrewOff(request: NextRequest): NextResponse | null {
  if (env().HEBREW_UI || splitLocale(request.nextUrl.pathname).locale !== "he") return null;
  return notFound(request);
}

const INTERNAL_HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } as const;

/**
 * /internal pages: a browser password prompt, or a 404 when no password is
 * configured. Null when access is granted: the request continues (session refresh included).
 */
function guardInternal(request: NextRequest): NextResponse | null {
  const headers = INTERNAL_HEADERS;
  switch (adminAccess(request.headers.get("authorization"), env().ADMIN_DASHBOARD_PASSWORD)) {
    case "granted":
      return null;
    case "denied":
      return new NextResponse("Authentication required.", {
        status: 401,
        headers: { ...headers, "WWW-Authenticate": ADMIN_REALM },
      });
    case "disabled":
      return new NextResponse("Not found.", { status: 404, headers });
  }
}

/**
 * 0. 404s the Hebrew interface while it's off, and unknown category slugs (/c/{slug},
 *    /he/c/{slug}); password-protects /internal.
 * 1. Throttles searches per IP: each one can call the stores' rate-limited
 *    APIs (see `_search-throttle.ts`).
 * 2. Keeps the Supabase session cookie fresh. Server Components can read but
 *    not write cookies, so without this an expired access token would make a
 *    returning visitor's Saved/Alerts look empty. No-op without Supabase.
 */
export async function proxy(request: NextRequest) {
  const off = hebrewOff(request);
  if (off) return off;
  const missing = unknownCategory(request);
  if (missing) return missing;
  const internal = request.nextUrl.pathname.startsWith("/internal");
  if (internal) {
    const refused = guardInternal(request);
    if (refused) return refused;
  }

  const ip = clientIp(request.headers);
  // No client IP means a local run (Vercel always sets one): lumping every such request
  // into one shared bucket would throttle all local runs together, so they aren't counted.
  if (ip && isSearchRequest(request.method, request.nextUrl)) {
    const decision = await searchThrottle()(ip);
    if (!decision.allowed) return tooManySearches(decision.retryAfterSeconds);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return internal ? NextResponse.next({ headers: INTERNAL_HEADERS }) : NextResponse.next();

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
  // Validates the JWT and refreshes it via setAll() when it's about to expire. /internal
  // needs it too: the push test identifies this browser's anonymous account.
  await supabase.auth.getClaims();
  if (internal)
    for (const [name, value] of Object.entries(INTERNAL_HEADERS)) response.headers.set(name, value);
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
    "/internal/:path*",
    "/c/:slug",
    // The Hebrew interface: the same pages under /he, plus the switch that hides it.
    {
      source: "/he/search",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    "/he",
    "/he/c",
    "/he/c/:slug",
    "/he/saved",
    "/he/alerts",
    "/he/privacy",
    "/he/terms",
  ],
};
