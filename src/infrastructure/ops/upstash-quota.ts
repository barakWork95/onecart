import { z } from "zod";
import type { QuotaReading, QuotaSource } from "@/domain/ops/status";

const NAME = "Upstash Redis commands this month";
/** Warn here: early enough to act (cut usage or switch plans) before the month runs out. */
const WARN_AT_SHARE = 0.8;
/** Upstash's answer once the plan's monthly commands are used up. */
const QUOTA_ERROR = /max (daily |monthly )?requests? limit exceeded/i;

const statsSchema = z.object({ total_monthly_requests: z.number().nonnegative() });

export interface UpstashManagement {
  /** The Upstash account's email and a Management API key (console → Account → Management API). */
  readonly email: string;
  readonly apiKey: string;
  readonly databaseId: string;
}

/** The first of next month, UTC: when Upstash's monthly count starts over. */
function nextMonthUtc(nowMs: number): string {
  const now = new Date(nowMs);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

/**
 * Upstash's monthly commands, for the status page and ops alerts. A probe (a
 * GET of a missing key, through the plain client, never the failover) tells
 * whether Redis answers at all; the Management API says how much of the month
 * is used. Unreachable or out of quota alerts; a usage figure we can't read
 * doesn't (Redis itself is fine).
 */
export function createUpstashQuota(config: {
  readonly probe: () => Promise<unknown>;
  readonly management: UpstashManagement | null;
  readonly monthlyLimit: number;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
}): QuotaSource {
  const doFetch = config.fetch ?? fetch;
  const now = config.now ?? Date.now;
  const limit = config.monthlyLimit;

  async function monthlyCommands(management: UpstashManagement): Promise<number | string> {
    try {
      const response = await doFetch(
        `https://api.upstash.com/v2/redis/stats/${encodeURIComponent(management.databaseId)}`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${management.email}:${management.apiKey}`).toString("base64")}`,
          },
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (!response.ok) return `usage unavailable (HTTP ${response.status})`;
      const parsed = statsSchema.safeParse(await response.json());
      return parsed.success ? parsed.data.total_monthly_requests : "usage unavailable (unexpected response)";
    } catch (error) {
      return `usage unavailable (${error instanceof Error ? error.message : "request failed"})`;
    }
  }

  return {
    async read() {
      const base = { name: NAME, limit, resetsAt: nextMonthUtc(now()), warnAtShare: WARN_AT_SHARE };
      try {
        await config.probe();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (QUOTA_ERROR.test(message))
          return [{ ...base, used: limit, remaining: 0, error: null, alertOnError: true }];
        return [
          {
            ...base,
            used: null,
            remaining: null,
            error: `Redis unreachable (${message})`,
            alertOnError: true,
          },
        ];
      }
      if (!config.management) {
        const reading: QuotaReading = {
          ...base,
          used: null,
          remaining: null,
          error:
            "usage unknown: set UPSTASH_MANAGEMENT_EMAIL, UPSTASH_MANAGEMENT_API_KEY and UPSTASH_DATABASE_ID",
          alertOnError: false,
        };
        return [reading];
      }
      const used = await monthlyCommands(config.management);
      if (typeof used === "string")
        return [{ ...base, used: null, remaining: null, error: used, alertOnError: false }];
      return [{ ...base, used, remaining: Math.max(0, limit - used), error: null, alertOnError: true }];
    },
  };
}
