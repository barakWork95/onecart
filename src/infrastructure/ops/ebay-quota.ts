import { z } from "zod";
import type { QuotaReading, QuotaSource } from "@/domain/ops/status";
import type { EbayTokenProvider } from "@/infrastructure/providers/ebay/ebay-oauth";

const NAME = "eBay Browse API calls today";
export const EBAY_RATE_LIMIT_URL =
  "https://api.ebay.com/developer/analytics/v1_beta/rate_limit/?api_context=buy&api_name=browse";

const rateSchema = z.object({
  count: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
  remaining: z.number().int(),
  reset: z.string().optional(),
});
const responseSchema = z.object({
  rateLimits: z.array(
    z.object({
      resources: z.array(z.object({ name: z.string(), rates: z.array(rateSchema) })),
    }),
  ),
});

const failed = (error: string): QuotaReading => ({
  name: NAME,
  used: null,
  limit: null,
  remaining: null,
  resetsAt: null,
  error,
});

/** eBay's own count of Browse API calls (Developer Analytics API, same app token). */
export function createEbayQuota(config: { tokens: EbayTokenProvider; fetch?: typeof fetch }): QuotaSource {
  const doFetch = config.fetch ?? fetch;
  return {
    async read() {
      try {
        const signal = AbortSignal.timeout(8_000);
        const token = await config.tokens.getToken(signal);
        if (!token.ok) return [failed(`token: ${token.error.code}`)];
        const response = await doFetch(EBAY_RATE_LIMIT_URL, {
          headers: { Authorization: `Bearer ${token.value}` },
          signal,
        });
        if (!response.ok) return [failed(`HTTP ${response.status}`)];
        const parsed = responseSchema.safeParse(await response.json());
        if (!parsed.success) return [failed("unexpected response")];
        const rate = parsed.data.rateLimits.flatMap((l) => l.resources).find((r) => r.name === "buy.browse")
          ?.rates[0];
        if (!rate) return [failed("no buy.browse rate in the response")];
        return [
          {
            name: NAME,
            used: rate.count,
            limit: rate.limit,
            remaining: rate.remaining,
            resetsAt: rate.reset ?? null,
            error: null,
          },
        ];
      } catch (error) {
        return [failed(error instanceof Error ? error.name : "request failed")];
      }
    },
  };
}
