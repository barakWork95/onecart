import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_REALM, adminAccess } from "@/app/_admin-auth";
import { adminLockout, clientIp, throttleBucket, throttleFor, type ThrottleBucket } from "@/app/_throttles";
import { CATEGORIES, DEMO_CATEGORIES } from "@/config/categories";
import { env } from "@/config/env";
import { splitLocale } from "@/i18n/locales";
import { fetchWithTimeout, SUPABASE_TIMEOUT_MS } from "@/infrastructure/db/fetch-with-timeout";

const TOO_MANY: Record<ThrottleBucket | "admin", string> = {
  search: "Too many searches in a short time. Please wait a moment and try again.",
  go: "Too many store visits in a short time. Please wait a moment and try again.",
  action: "Too many requests in a short time. Please wait a moment and try again.",
  admin: "Too many failed sign-in attempts. Try again later.",
};

/** A plain 429 for a client over a limit; noindex so crawlers drop the URL. */
function tooMany(kind: ThrottleBucket | "admin", retryAfterSeconds: number): NextResponse {
  return new NextResponse(TOO_MANY[kind], {
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
 * Wrong passwords count per IP; a locked-out IP is refused before its password is
 * even checked, so guessing can't go on behind the 429s.
 */
async function guardInternal(request: NextRequest, ip: string | null): Promise<NextResponse | null> {
  const headers = INTERNAL_HEADERS;
  const password = env().ADMIN_DASHBOARD_PASSWORD;
  if (ip && password) {
    const lock = await adminLockout().check(ip);
    if (lock.locked) {
      const refused = tooMany("admin", lock.retryAfterSeconds);
      for (const [name, value] of Object.entries(headers)) refused.headers.set(name, value);
      return refused;
    }
  }
  const authorization = request.headers.get("authorization");
  switch (adminAccess(authorization, password)) {
    case "granted":
      return null;
    case "denied":
      // The bare prompt (no credentials yet) isn't a failed attempt.
      if (ip && authorization) await adminLockout().recordFailure(ip);
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
 * 1. Throttles per IP what costs us per request: searches (store APIs), /go
 *    clicks and Server Action POSTs (see `_throttles.ts`); locks out IPs that
 *    keep guessing the /internal password.
 * 2. Keeps the Supabase session cookie fresh. Server Components can read but
 *    not write cookies, so without this an expired access token would make a
 *    returning visitor's Saved/Alerts look empty. No-op without Supabase.
 */
export async function proxy(request: NextRequest) {
  const off = hebrewOff(request);
  if (off) return off;
  const missing = unknownCategory(request);
  if (missing) return missing;
  // No client IP means a local run (Vercel always sets one): lumping every such request
  // into one shared bucket would throttle all local runs together, so they aren't counted.
  const ip = clientIp(request.headers);
  const internal = request.nextUrl.pathname.startsWith("/internal");
  if (internal) {
    const refused = await guardInternal(request, ip);
    if (refused) return refused;
  }

  const bucket = throttleBucket(request.method, request.nextUrl, request.headers);
  if (ip && bucket) {
    const decision = await throttleFor(bucket)(ip);
    if (!decision.allowed) return tooMany(bucket, decision.retryAfterSeconds);
  }
  // /go reads no session: it only redirects (and logs the click with the service key).
  if (request.nextUrl.pathname.startsWith("/go/")) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return internal ? NextResponse.next({ headers: INTERNAL_HEADERS }) : NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    global: { fetch: fetchWithTimeout(SUPABASE_TIMEOUT_MS) },
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
  // A Supabase outage must not take every page down with it: the page reads the session itself.
  await supabase.auth.getClaims().catch(() => null);
  if (internal)
    for (const [name, value] of Object.entries(INTERNAL_HEADERS)) response.headers.set(name, value);
  return response;
}

export const config = {
  // Pages that read the session, plus what's throttled; skip assets and cron.
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
    // Outbound clicks: throttled, no session work.
    "/go/:path*",
    // Server Actions POST to whichever page shows them (home and category pages too).
    { source: "/:path*", has: [{ type: "header", key: "next-action" }] },
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
