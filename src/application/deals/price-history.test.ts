import {
  createRecordPriceHistory,
  observationsFrom,
  PRICE_HISTORY_GROUPS,
  type Observed,
} from "@/application/deals/price-history";
import { assembleResults } from "@/application/search/assemble-results";
import type { DailyPrice } from "@/domain/deals/price-drop";
import type {
  PriceDropBoard,
  PriceDropCard,
  PriceHistoryStore,
  PriceObservation,
} from "@/domain/deals/ports";
import { searchIntent } from "@/domain/search/search-intent";
import type { SearchResponse } from "@/domain/search/search-response";
import { money } from "@/domain/shared/money";
import type { ProviderId } from "@/domain/shared/provider";
import { makeProduct } from "@/test/product-factory";

const TODAY = "2026-10-30";

function response(query: string, products: ReturnType<typeof makeProduct>[]): SearchResponse {
  const intent = searchIntent(query);
  const { groups, offers } = assembleResults(
    [{ products, unavailable: [] }],
    { filters: {}, sort: "relevance" },
    intent,
  );
  return {
    query: {
      rawText: query,
      detectedLanguage: "en",
      normalizedText: query,
      sort: "relevance",
      filters: {},
      destination: { country: "IL" },
      page: 1,
      pageSize: 20,
    },
    groups,
    totalOffers: offers.length,
    providers: [],
    pagination: { page: 1, pageSize: 20, totalResults: groups.length, hasNextPage: false },
    isPartial: false,
    generatedAt: `${TODAY}T07:30:00.000Z`,
  };
}

const listing = (provider: ProviderId, sku: string, title: string, shekels: number, sellerName?: string) =>
  makeProduct({ provider, sku, title, total: shekels * 100, ...(sellerName ? { sellerName } : {}) });

describe("observationsFrom", () => {
  it("records the named product's featurable listings only", () => {
    const observed = observationsFrom(
      "jbl charge 5",
      response("jbl charge 5", [
        listing("ebay", "e1", "JBL Charge 5 Portable Bluetooth Speaker", 520),
        listing("ebay", "e2", "Case for JBL Charge 5", 40),
        listing("aliexpress", "a1", "JBL Charge 5 Speaker", 210, "Speaker World Store"),
        listing("ebay", "e3", "Sony SRS-XB100 Speaker", 200),
      ]),
      TODAY,
    );
    expect(observed.map((o) => o.observation)).toEqual([
      {
        productId: "ebay:e1",
        provider: "ebay",
        day: TODAY,
        totalMinor: 520_00,
        itemMinor: 520_00,
        query: "jbl charge 5",
        title: "JBL Charge 5 Portable Bluetooth Speaker",
      },
    ]);
  });

  it("follows only the first results page, however many groups a warm-up returns", () => {
    // Distinct JBL models never group, so each listing is its own group, in store order.
    const many = Array.from({ length: PRICE_HISTORY_GROUPS + 5 }, (_, i) =>
      listing("ebay", `m${i}`, `JBL Charge ${i + 100} Speaker`, 300 + i),
    );
    const observed = observationsFrom("jbl charge", response("jbl charge", many), TODAY);
    expect(observed.length).toBeLessThanOrEqual(PRICE_HISTORY_GROUPS);
    expect(observed.length).toBeGreaterThan(0);
  });
});

function fakeHistory(seed: (DailyPrice & { productId: string })[] = []) {
  const rows = new Map(seed.map((r) => [`${r.productId}|${r.day}`, r]));
  const recorded: PriceObservation[] = [];
  const store: PriceHistoryStore & { recorded: PriceObservation[]; pruned: string[] } = {
    recorded,
    pruned: [],
    async record(observations) {
      recorded.push(...observations);
      for (const o of observations)
        rows.set(`${o.productId}|${o.day}`, { productId: o.productId, day: o.day, totalMinor: o.totalMinor });
    },
    async history(ids, since) {
      return [...rows.values()].filter((r) => ids.includes(r.productId) && r.day >= since);
    },
    async prune(before) {
      store.pruned.push(before);
    },
  };
  return store;
}

function fakeBoard() {
  let cards: readonly PriceDropCard[] = [];
  const board: PriceDropBoard & { cards: () => readonly PriceDropCard[] } = {
    async save(next) {
      cards = next;
    },
    async load() {
      return cards;
    },
    cards: () => cards,
  };
  return board;
}

/** Seven earlier days at `shekels` for a product, ending yesterday. */
const week = (productId: string, shekels: number) =>
  [23, 24, 25, 26, 27, 28, 29].map((d) => ({ productId, day: `2026-10-${d}`, totalMinor: shekels * 100 }));

const observed = (sku: string, shekels: number, query = "jbl charge 5"): Observed => {
  const product = listing("ebay", sku, `JBL Charge 5 ${sku}`, shekels);
  return {
    product,
    observation: {
      productId: product.id,
      provider: "ebay",
      day: TODAY,
      totalMinor: shekels * 100,
      itemMinor: shekels * 100,
      query,
      title: product.title,
    },
  };
};

describe("recordPriceHistory", () => {
  it("records today's prices, prunes old days and boards only real drops", async () => {
    const history = fakeHistory([...week("ebay:drop", 500), ...week("ebay:flat", 500)]);
    const board = fakeBoard();
    const run = await createRecordPriceHistory({ history, board })(
      [observed("drop", 400), observed("flat", 495), observed("new", 300)],
      TODAY,
    );

    expect(run).toEqual({ recorded: 3, drops: 1 });
    expect(history.recorded.map((o) => o.productId)).toEqual(["ebay:drop", "ebay:flat", "ebay:new"]);
    expect(history.pruned).toEqual(["2026-07-02"]);
    expect(board.cards()).toEqual([
      expect.objectContaining({
        productId: "ebay:drop",
        current: money(400_00, "ILS"),
        typical: money(500_00, "ILS"),
        dropShare: 0.2,
        historyDays: 7,
        query: "jbl charge 5",
        productUrl: "https://ebay.example/item/drop",
      }),
    ]);
  });

  it("records a product found by two searches once, and caps the board per query", async () => {
    const history = fakeHistory([...week("ebay:a", 500), ...week("ebay:b", 500), ...week("ebay:c", 500)]);
    const board = fakeBoard();
    const run = await createRecordPriceHistory({ history, board })(
      [observed("a", 300), observed("a", 300, "other"), observed("b", 350), observed("c", 400)],
      TODAY,
    );
    expect(history.recorded).toHaveLength(3);
    expect(run.drops).toBe(2);
    expect(board.cards().map((c) => c.productId)).toEqual(["ebay:a", "ebay:b"]);
  });

  it("does nothing without observations, and survives a failed prune", async () => {
    const history = fakeHistory();
    const board = fakeBoard();
    expect(await createRecordPriceHistory({ history, board })([], TODAY)).toEqual({ recorded: 0, drops: 0 });

    const logger = { warn: jest.fn() };
    history.prune = () => Promise.reject(new Error("timeout"));
    const run = await createRecordPriceHistory({ history, board, logger })([observed("x", 100)], TODAY);
    expect(run).toEqual({ recorded: 1, drops: 0 });
    expect(logger.warn).toHaveBeenCalledWith("price-history: prune failed", { error: "timeout" });
    expect(board.cards()).toEqual([]);
  });
});
