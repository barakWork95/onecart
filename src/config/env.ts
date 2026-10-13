import "server-only";
import { z } from "zod";

/**
 * Server-side environment, validated once on first access. Import `env` only
 * from server code (Server Components, Server Actions, route handlers,
 * infrastructure). Public values live in `NEXT_PUBLIC_*` and are read directly.
 */
/**
 * `KEY=` in a .env file (as in .env.example) arrives as "". Treat that as
 * "not set" so an unfilled template disables a feature instead of crashing.
 */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /**
   * Serve the hand-written demo catalog instead of live stores (local dev, E2E).
   * The UI labels results as demo data whenever this is on.
   */
  ONECART_DEMO_PROVIDERS: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Search data providers
  ALIEXPRESS_APP_KEY: optional(z.string().min(1)),
  ALIEXPRESS_APP_SECRET: optional(z.string().min(1)),
  SERPAPI_API_KEY: optional(z.string().min(1)),
  /**
   * Where Amazon results come from: `live` (SerpApi, spends the monthly
   * quota) or `recorded` (saved SerpApi responses for a few queries, no
   * network). Unset: live only on Vercel production, recorded everywhere else.
   */
  SERPAPI_MODE: optional(z.enum(["live", "recorded"])),
  /** Searches one IP may run (defaults in config/rate-limits.ts; E2E raises them). */
  SEARCH_RATE_LIMIT_PER_MINUTE: optional(z.coerce.number().int().positive()),
  SEARCH_RATE_LIMIT_PER_DAY: optional(z.coerce.number().int().positive()),
  /** Live store API calls allowed per day across all shoppers; see config/rate-limits.ts. */
  EBAY_DAILY_CALL_BUDGET: optional(z.coerce.number().int().positive()),
  AMAZON_DAILY_CALL_BUDGET: optional(z.coerce.number().int().positive()),
  /** Set by Vercel: "production", "preview" or "development". */
  VERCEL_ENV: optional(z.enum(["production", "preview", "development"])),
  /** Amazon result pages fetched in parallel per uncached query (1–3); each costs one SerpApi credit. */
  SERPAPI_AMAZON_PAGES: z.coerce.number().int().min(1).max(3).default(2),
  /** eBay Browse API application keys (developer.ebay.com → Application Keys, Production). */
  EBAY_CLIENT_ID: optional(z.string().min(1)),
  EBAY_CLIENT_SECRET: optional(z.string().min(1)),
  /**
   * eBay's developer-portal names for the same credentials: App ID = OAuth
   * client id, Cert ID = client secret. Either naming works. Dev ID is not
   * used by the client-credentials flow; accepted so a pasted set validates.
   */
  EBAY_APP_ID: optional(z.string().min(1)),
  EBAY_CERT_ID: optional(z.string().min(1)),
  EBAY_DEV_ID: optional(z.string().min(1)),
  SEARCHAPI_API_KEY: optional(z.string().min(1)),

  // Cache
  UPSTASH_REDIS_REST_URL: optional(z.url()),
  UPSTASH_REDIS_REST_TOKEN: optional(z.string().min(1)),
  /**
   * The same Upstash database under the names Vercel Storage injects when it's
   * connected to the project (KV_REST_API_URL / KV_REST_API_TOKEN). Used when
   * the UPSTASH_REDIS_REST_* pair isn't set. Never the read-only token: the
   * cache and rate-limit counters write.
   */
  KV_REST_API_URL: optional(z.url()),
  KV_REST_API_TOKEN: optional(z.string().min(1)),
  SEARCH_CACHE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24),

  // Database
  NEXT_PUBLIC_SUPABASE_URL: optional(z.url()),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optional(z.string().min(1)),
  SUPABASE_SECRET_KEY: optional(z.string().min(1)),

  // Translation (Hebrew → English query parsing)
  DEEPL_API_KEY: optional(z.string().min(1)),

  /** HMAC key for /go/ links (≥32 chars). Required in production; all instances must share it. */
  OUTBOUND_LINK_SECRET: optional(z.string().min(32)),

  /** Bearer token Vercel Cron sends to /api/cron/* (≥16 chars). */
  CRON_SECRET: optional(z.string().min(16)),

  // Affiliate tags
  AFFILIATE_AMAZON_TAG: optional(z.string().min(1)),
  AFFILIATE_ALIEXPRESS_TRACKING_ID: optional(z.string().min(1)),
  AFFILIATE_TEMU_CODE: optional(z.string().min(1)),
  AFFILIATE_EBAY_CAMPAIGN_ID: optional(z.string().min(1)),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Amazon's data source. Local runs (dev, tests, a local production build) and
 * preview deployments use recorded responses unless SERPAPI_MODE says
 * otherwise, so development never spends the 250-a-month SerpApi quota.
 */
export function amazonSource(config: ServerEnv): "live" | "recorded" | "off" {
  const mode = config.SERPAPI_MODE ?? (config.VERCEL_ENV === "production" ? "live" : "recorded");
  if (mode === "recorded") return "recorded";
  return config.SERPAPI_API_KEY ? "live" : "off";
}

/** eBay OAuth client credentials under either naming, or null when not configured. */
export function ebayCredentials(config: ServerEnv): { clientId: string; clientSecret: string } | null {
  const clientId = config.EBAY_CLIENT_ID ?? config.EBAY_APP_ID;
  const clientSecret = config.EBAY_CLIENT_SECRET ?? config.EBAY_CERT_ID;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

let cached: ServerEnv | undefined;

export function parseServerEnv(source: Readonly<Record<string, string | undefined>>): ServerEnv {
  return withRedisFromVercelStorage(serverEnvSchema.parse(source));
}

/**
 * Fills UPSTASH_REDIS_REST_* from Vercel Storage's KV_REST_API_* names, so
 * every Redis user (search cache, circuit breaker, FX cache, rate limits)
 * finds the database whichever way it was connected. Each pair is taken
 * whole: a URL from one naming with a token from the other would point a
 * token at the wrong database.
 */
function withRedisFromVercelStorage(config: ServerEnv): ServerEnv {
  if (config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN) return config;
  if (!config.KV_REST_API_URL || !config.KV_REST_API_TOKEN) return config;
  return {
    ...config,
    UPSTASH_REDIS_REST_URL: config.KV_REST_API_URL,
    UPSTASH_REDIS_REST_TOKEN: config.KV_REST_API_TOKEN,
  };
}

export function env(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
