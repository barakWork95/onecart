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
  /** Amazon result pages fetched in parallel per uncached query (1–3); each costs one SerpApi credit. */
  SERPAPI_AMAZON_PAGES: z.coerce.number().int().min(1).max(3).default(2),
  /** eBay Browse API application keys (developer.ebay.com → Application Keys, Production). */
  EBAY_CLIENT_ID: optional(z.string().min(1)),
  EBAY_CLIENT_SECRET: optional(z.string().min(1)),
  SEARCHAPI_API_KEY: optional(z.string().min(1)),

  // Cache
  UPSTASH_REDIS_REST_URL: optional(z.url()),
  UPSTASH_REDIS_REST_TOKEN: optional(z.string().min(1)),
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

let cached: ServerEnv | undefined;

export function parseServerEnv(source: Readonly<Record<string, string | undefined>>): ServerEnv {
  return serverEnvSchema.parse(source);
}

export function env(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
