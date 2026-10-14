import type { PriceDropCard } from "@/domain/deals/ports";
import { money } from "@/domain/shared/money";
import { createInMemoryRedis } from "@/infrastructure/cache/in-memory-redis";
import {
  createRedisPriceDropBoard,
  PRICE_DROP_BOARD_KEY,
} from "@/infrastructure/cache/redis-price-drop-board";

const CARD: PriceDropCard = {
  productId: "ebay:1",
  provider: "ebay",
  title: "JBL Charge 5",
  imageUrl: null,
  productUrl: "https://www.ebay.com/itm/1",
  query: "jbl charge 5",
  current: money(400_00, "ILS"),
  typical: money(500_00, "ILS"),
  dropShare: 0.2,
  historyDays: 9,
  observedAt: "2026-10-30T07:30:00.000Z",
};

describe("createRedisPriceDropBoard", () => {
  it("round-trips today's cards", async () => {
    const board = createRedisPriceDropBoard(createInMemoryRedis());
    expect(await board.load()).toEqual([]);
    await board.save([CARD]);
    expect(await board.load()).toEqual([CARD]);
  });

  it("reads an entry it didn't write as no drops", async () => {
    const redis = createInMemoryRedis();
    await redis.set(PRICE_DROP_BOARD_KEY, [{ productId: 1 }], { ex: 60 });
    expect(await createRedisPriceDropBoard(redis).load()).toEqual([]);
  });
});
