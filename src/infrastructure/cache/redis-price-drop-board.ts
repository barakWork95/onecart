import { z } from "zod";
import type { PriceDropBoard, PriceDropCard } from "@/domain/deals/ports";
import { PROVIDER_IDS } from "@/domain/shared/provider";
import type { RedisLike } from "@/infrastructure/cache/redis-client";

/** Bump the version when `PriceDropCard` changes shape. */
export const PRICE_DROP_BOARD_KEY = "deals:price-drops:v1";
/** Two days: a missed cron run leaves yesterday's drops up, not stale ones for a week. */
const TTL_SECONDS = 2 * 24 * 60 * 60;

const ils = z.object({ amountMinor: z.number().int(), currency: z.literal("ILS") });
const cardSchema = z.object({
  productId: z.string(),
  provider: z.enum(PROVIDER_IDS),
  title: z.string(),
  imageUrl: z.string().nullable(),
  productUrl: z.string(),
  query: z.string(),
  current: ils,
  typical: ils,
  dropShare: z.number(),
  historyDays: z.number().int(),
  observedAt: z.string(),
});

/** Today's price-drop cards in Redis: the cron writes, the homepage reads (cache only). */
export function createRedisPriceDropBoard(redis: RedisLike): PriceDropBoard {
  return {
    async save(cards) {
      await redis.set(PRICE_DROP_BOARD_KEY, cards, { ex: TTL_SECONDS });
    },
    async load() {
      const parsed = cardSchema.array().safeParse(await redis.get<unknown>(PRICE_DROP_BOARD_KEY));
      // Validated by the schema above; an entry we didn't write reads as "no drops".
      return parsed.success ? (parsed.data satisfies readonly PriceDropCard[]) : [];
    },
  };
}
