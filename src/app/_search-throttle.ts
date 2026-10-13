import "server-only";

import { createRateLimiter, type RateLimiter } from "@/application/security/rate-limiter";
import { env } from "@/config/env";
import { searchRateLimits } from "@/config/rate-limits";
import { createInMemoryCounterStore } from "@/infrastructure/cache/counter-stores";
import { createUpstashCounterStore } from "@/infrastructure/cache/upstash";
import { consoleLogger } from "@/infrastructure/logging/console-logger";

/**
 * Per-IP limit on searches, applied in the proxy before a search page renders
 * (and calls the stores). Shared through Upstash; per-instance without it.
 */
const THROTTLE_KEY = Symbol.for("onecart.searchThrottle");
type Holder = { [THROTTLE_KEY]?: RateLimiter };

export function searchThrottle(): RateLimiter {
  const holder = globalThis as Holder;
  if (!holder[THROTTLE_KEY]) {
    const config = env();
    holder[THROTTLE_KEY] = createRateLimiter({
      prefix: "rl:search",
      windows: searchRateLimits({
        ...(config.SEARCH_RATE_LIMIT_PER_MINUTE ? { perMinute: config.SEARCH_RATE_LIMIT_PER_MINUTE } : {}),
        ...(config.SEARCH_RATE_LIMIT_PER_DAY ? { perDay: config.SEARCH_RATE_LIMIT_PER_DAY } : {}),
      }),
      counter: createUpstashCounterStore(config) ?? createInMemoryCounterStore(),
      logger: consoleLogger,
    });
  }
  return holder[THROTTLE_KEY];
}

/**
 * The client's IP. On Vercel, `x-real-ip` and the first `x-forwarded-for`
 * entry are set by the platform's edge, not the client.
 */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  );
}

/**
 * Only requests that run a search count: a GET of /search with a query.
 * Server Actions (Save, Alerts) POST to the same path without searching.
 * Router prefetches (static shell only) never reach the proxy: Next strips
 * their headers from `request`, so the proxy matcher excludes them instead.
 */
export function isSearchRequest(method: string, url: URL): boolean {
  return method === "GET" && url.pathname === "/search" && !!url.searchParams.get("q")?.trim();
}
