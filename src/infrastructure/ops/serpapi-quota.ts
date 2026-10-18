import { z } from "zod";
import type { QuotaReading, QuotaSource } from "@/domain/ops/status";

const NAME = "SerpApi searches this month (Amazon)";
const accountSchema = z.object({
  searches_per_month: z.number().int().nonnegative(),
  this_month_usage: z.number().int().nonnegative(),
  total_searches_left: z.number().int(),
});

const failed = (error: string): QuotaReading => ({
  name: NAME,
  used: null,
  limit: null,
  remaining: null,
  resetsAt: null,
  error,
});

/**
 * SerpApi's account endpoint: free (it spends no searches). The key travels in
 * the query string, so the URL is never logged or reported.
 */
export function createSerpApiQuota(config: { apiKey: string; fetch?: typeof fetch }): QuotaSource {
  const doFetch = config.fetch ?? fetch;
  return {
    async read() {
      try {
        const response = await doFetch(
          `https://serpapi.com/account.json?${new URLSearchParams({ api_key: config.apiKey })}`,
          { signal: AbortSignal.timeout(8_000) },
        );
        if (!response.ok) return [failed(`HTTP ${response.status}`)];
        const parsed = accountSchema.safeParse(await response.json());
        if (!parsed.success) return [failed("unexpected response")];
        const a = parsed.data;
        return [
          {
            name: NAME,
            used: a.this_month_usage,
            limit: a.searches_per_month,
            remaining: a.total_searches_left,
            resetsAt: null,
            error: null,
          },
        ];
      } catch (error) {
        return [failed(error instanceof Error ? error.name : "request failed")];
      }
    },
  };
}
