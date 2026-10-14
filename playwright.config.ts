import { defineConfig, devices } from "@playwright/test";

/** Dedicated port so E2E never reuses some other local dev server. */
const PORT = Number(process.env.E2E_PORT ?? 3200);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // Always a production build: matches what ships, and Next allows only one `next dev` per project.
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Deterministic data: the demo catalog, fixed FX, no DeepL (glossary translation), no Redis.
    env: {
      ONECART_DEMO_PROVIDERS: "true",
      DEEPL_API_KEY: "",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      // Vercel Storage's names for the same database: E2E must never write to production Redis.
      KV_REST_API_URL: "",
      KV_REST_API_TOKEN: "",
      // Store keys from .env.local must never reach E2E: demo mode still builds the
      // AliExpress link generator from them, and /go would call the live API.
      ALIEXPRESS_APP_KEY: "",
      ALIEXPRESS_APP_SECRET: "",
      AFFILIATE_ALIEXPRESS_TRACKING_ID: "",
      OUTBOUND_LINK_SECRET: "e2e-only-outbound-link-secret-0123456789",
      AFFILIATE_AMAZON_TAG: "onecart-e2e-20",
      AFFILIATE_EBAY_CAMPAIGN_ID: "5338000000",
      CRON_SECRET: "e2e-only-cron-secret-0123456789",
      // The suite runs many searches from one IP within a minute; the throttle has its own tests.
      SEARCH_RATE_LIMIT_PER_MINUTE: "100000",
      SEARCH_RATE_LIMIT_PER_DAY: "100000",
      // Reserved example domain: proves the legal pages render a configured contact.
      CONTACT_EMAIL: "legal@example.com",
      // Demo mode keeps wishlists in memory; never point E2E at a real Supabase project.
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      // Click storage stays off too: E2E clicks must never land in the production click table.
      SUPABASE_SECRET_KEY: "",
      ADMIN_DASHBOARD_PASSWORD: "e2e-only-admin-password-0123",
    },
  },
});
