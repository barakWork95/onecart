import "server-only";

import { createFailureLockout, type FailureLockout } from "@/application/security/failure-lockout";
import { createRateLimiter, type RateLimiter } from "@/application/security/rate-limiter";
import { env } from "@/config/env";
import { ACTION_RATE_LIMITS, ADMIN_LOCKOUT, GO_RATE_LIMITS, searchRateLimits } from "@/config/rate-limits";
import type { CounterStore } from "@/domain/security/ports";
import type { RateLimitWindow } from "@/domain/security/rate-limit";
import { createInMemoryCounterStore } from "@/infrastructure/cache/counter-stores";
import { createFailoverCounterStore } from "@/infrastructure/cache/failover-redis";
import { createUpstashCounterStore } from "@/infrastructure/cache/upstash";
import { consoleLogger } from "@/infrastructure/logging/console-logger";
import { splitLocale } from "@/i18n/locales";

/**
 * Per-IP limits applied in the proxy, before anything costly runs: searches
 * (store calls), /go clicks (a click row, AliExpress link calls), Server Actions
 * (Supabase writes), and wrong /internal passwords. Shared through Upstash;
 * per-instance without it.
 */
const HOLDER_KEY = Symbol.for("onecart.throttles");
type Holder = { [HOLDER_KEY]?: Map<string, unknown> };

/** One instance per name per process, and one counter store for all of them. */
function once<T>(name: string, make: (counter: CounterStore) => T): T {
  const holder = globalThis as Holder;
  const made = (holder[HOLDER_KEY] ??= new Map());
  if (!made.has("counter")) {
    const upstash = createUpstashCounterStore(env());
    made.set(
      "counter",
      upstash
        ? createFailoverCounterStore({ primary: upstash, logger: consoleLogger })
        : createInMemoryCounterStore(),
    );
  }
  if (!made.has(name)) made.set(name, make(made.get("counter") as CounterStore));
  return made.get(name) as T;
}

const limiter = (prefix: string, windows: readonly RateLimitWindow[]) =>
  once<RateLimiter>(prefix, (counter) =>
    createRateLimiter({ prefix, windows, counter, logger: consoleLogger }),
  );

export function searchThrottle(): RateLimiter {
  const config = env();
  return limiter(
    "rl:search",
    searchRateLimits({
      ...(config.SEARCH_RATE_LIMIT_PER_MINUTE ? { perMinute: config.SEARCH_RATE_LIMIT_PER_MINUTE } : {}),
      ...(config.SEARCH_RATE_LIMIT_PER_DAY ? { perDay: config.SEARCH_RATE_LIMIT_PER_DAY } : {}),
    }),
  );
}

export type ThrottleBucket = "search" | "go" | "action";

export function throttleFor(bucket: ThrottleBucket): RateLimiter {
  switch (bucket) {
    case "search":
      return searchThrottle();
    case "go":
      return limiter("rl:go", GO_RATE_LIMITS);
    case "action":
      return limiter("rl:action", ACTION_RATE_LIMITS);
  }
}

export function adminLockout(): FailureLockout {
  return once("lock:admin", (counter) =>
    createFailureLockout({ prefix: "lock:admin", ...ADMIN_LOCKOUT, counter, logger: consoleLogger }),
  );
}

/** This machine: `next start` forwards the loopback address on local runs and E2E. */
const LOOPBACK = /^(::1|(::ffff:)?127\.\d+\.\d+\.\d+)$/;

/**
 * The client's IP, or null when no proxy in front of us set one. On Vercel,
 * `x-real-ip` and the first `x-forwarded-for` entry are set by the platform's
 * edge, not the client, so null only happens on local runs (no header, or loopback).
 */
export function clientIp(headers: Headers): string | null {
  const ip =
    headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  return ip && !LOOPBACK.test(ip) ? ip : null;
}

/**
 * Only requests that run a search count: a GET of /search with a query.
 * Server Actions (Save, Alerts) POST to the same path without searching.
 * Router prefetches (static shell only) never reach the proxy: Next strips
 * their headers from `request`, so the proxy matcher excludes them instead.
 */
export function isSearchRequest(method: string, url: URL): boolean {
  return (
    method === "GET" && splitLocale(url.pathname).path === "/search" && !!url.searchParams.get("q")?.trim()
  );
}

/** Which per-IP limit a request counts against, or null for a plain page view. */
export function throttleBucket(method: string, url: URL, headers: Headers): ThrottleBucket | null {
  if (isSearchRequest(method, url)) return "search";
  if (url.pathname.startsWith("/go/")) return "go";
  if (method === "POST" && headers.has("next-action")) return "action";
  return null;
}
