import { createCheckPriceAlerts, type FetchOffers } from "@/application/user-lists/check-price-alerts";
import { money } from "@/domain/shared/money";
import type { AlertCheckRepository } from "@/domain/user-lists/ports";
import type { PriceAlert } from "@/domain/user-lists/price-alert";
import { makeProduct } from "@/test/product-factory";

const ils = (agorot: number) => money(agorot, "ILS");
const NOW = new Date("2026-10-11T05:00:00.000Z");

const alert = (productId: string, searchText: string, target: number): PriceAlert => ({
  id: `a-${productId}`,
  productId,
  provider: "aliexpress",
  title: productId,
  imageUrl: null,
  productUrl: "https://www.aliexpress.com/item/1.html",
  searchText,
  target: ils(target),
  baseline: ils(100_00),
  lastSeen: ils(100_00),
  lastCheckedAt: null,
  status: "active",
  triggeredAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
});

function setup(alerts: PriceAlert[], fetchOffers: FetchOffers) {
  const saved: PriceAlert[] = [];
  const repo: AlertCheckRepository = {
    listActiveAlerts: jest.fn(async (limit: number) => alerts.slice(0, limit)),
    saveObservations: jest.fn(async (updated) => {
      saved.push(...updated);
    }),
  };
  const logger = { warn: jest.fn() };
  const check = createCheckPriceAlerts({ alerts: repo, fetchOffers, now: () => NOW, logger, batchSize: 10 });
  return { check, repo, saved, logger };
}

describe("checkPriceAlerts", () => {
  it("runs one search per distinct query and triggers alerts at or below target", async () => {
    const fetchOffers = jest.fn(async (q: string) =>
      q === "earbuds"
        ? [makeProduct({ sku: "drop", total: 79_00 }), makeProduct({ sku: "same", total: 100_00 })]
        : [makeProduct({ sku: "kb", total: 150_00 })],
    );
    const { check, saved } = setup(
      [
        alert("aliexpress:drop", "earbuds", 80_00),
        alert("aliexpress:same", "earbuds", 90_00),
        alert("aliexpress:kb", "keyboard", 120_00),
      ],
      fetchOffers,
    );

    expect(await check()).toEqual({ checked: 3, triggered: 1, missing: 0, failedSearches: 0 });
    expect(fetchOffers).toHaveBeenCalledTimes(2);
    expect(saved.find((a) => a.productId === "aliexpress:drop")).toMatchObject({
      status: "triggered",
      triggeredAt: NOW.toISOString(),
      lastSeen: ils(79_00),
    });
    expect(saved.find((a) => a.productId === "aliexpress:kb")).toMatchObject({
      status: "active",
      lastSeen: ils(150_00),
    });
  });

  it("counts products missing from today's results and keeps their last price", async () => {
    const { check, saved } = setup([alert("aliexpress:gone", "earbuds", 80_00)], async () => []);
    expect(await check()).toMatchObject({ checked: 1, missing: 1, triggered: 0 });
    expect(saved[0]).toMatchObject({ lastSeen: ils(100_00), lastCheckedAt: NOW.toISOString() });
  });

  it("leaves alerts untouched when their search fails, and retries next run", async () => {
    const { check, repo, logger } = setup(
      [alert("aliexpress:1", "down", 80_00), alert("aliexpress:2", "throws", 80_00)],
      async (q) => {
        if (q === "throws") throw new Error("boom");
        return null;
      },
    );
    expect(await check()).toEqual({ checked: 0, triggered: 0, missing: 0, failedSearches: 2 });
    expect(repo.saveObservations).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("price-alerts: search threw", { error: "boom" });
  });

  it("respects the batch size and handles non-Error throws", async () => {
    const many = Array.from({ length: 15 }, (_, i) => alert(`aliexpress:${i}`, `q${i}`, 50_00));
    const { check, repo, logger } = setup(many, () => Promise.reject("nope"));
    await check();
    expect(repo.listActiveAlerts).toHaveBeenCalledWith(10);
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), { error: "nope" });
  });

  it("works with the default clock, logger and batch size", async () => {
    const repo: AlertCheckRepository = {
      listActiveAlerts: jest.fn(async () => []),
      saveObservations: jest.fn(),
    };
    expect(await createCheckPriceAlerts({ alerts: repo, fetchOffers: async () => [] })()).toEqual({
      checked: 0,
      triggered: 0,
      missing: 0,
      failedSearches: 0,
    });
    expect(repo.listActiveAlerts).toHaveBeenCalledWith(500);
  });
});
