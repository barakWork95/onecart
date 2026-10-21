import { createFxRates, type FxRates } from "@/domain/pricing/fx-rates";
import { createInMemoryRedis } from "@/infrastructure/cache/in-memory-redis";
import type { RedisLike } from "@/infrastructure/cache/redis-client";
import { createCachedFxRates, FALLBACK_RETRY_MS, FX_KEY } from "@/infrastructure/fx/cached-fx-rates";
import { FxUnavailableError } from "@/infrastructure/fx/frankfurter-fx-source";

const rates = (usd: number): FxRates =>
  createFxRates({ ILS: 1, USD: usd, EUR: 4, GBP: 4.7, CNY: 0.5 }, "2026-10-09T00:00:00.000Z");

const HOUR = 60 * 60 * 1000;

function setup(source: () => Promise<FxRates>, store: RedisLike = createInMemoryRedis(() => clock.ms)) {
  const logger = { warn: jest.fn() };
  const getFxRates = createCachedFxRates({ source, store, now: () => clock.ms, logger });
  return { getFxRates, logger, store };
}

const clock = { ms: 1_760_000_000_000 };
beforeEach(() => {
  clock.ms = 1_760_000_000_000;
});

describe("createCachedFxRates", () => {
  it("fetches once and memoizes while fresh", async () => {
    const source = jest.fn(async () => rates(3.7));
    const { getFxRates } = setup(source);
    expect((await getFxRates()).toIls.USD).toBe(3.7);
    clock.ms += 5 * HOUR;
    await getFxRates();
    expect(source).toHaveBeenCalledTimes(1);
  });

  it("collapses concurrent refreshes into one source call", async () => {
    const source = jest.fn(async () => rates(3.7));
    const { getFxRates } = setup(source);
    await Promise.all([getFxRates(), getFxRates(), getFxRates()]);
    expect(source).toHaveBeenCalledTimes(1);
  });

  it("refreshes after 6 hours", async () => {
    const source = jest.fn().mockResolvedValueOnce(rates(3.7)).mockResolvedValueOnce(rates(3.8));
    const { getFxRates } = setup(source);
    await getFxRates();
    clock.ms += 6 * HOUR;
    expect((await getFxRates()).toIls.USD).toBe(3.8);
  });

  it("shares fresh rates across instances via the store", async () => {
    const store = createInMemoryRedis(() => clock.ms);
    await setup(async () => rates(3.7), store).getFxRates();
    const otherSource = jest.fn(async () => rates(9));
    expect((await setup(otherSource, store).getFxRates()).toIls.USD).toBe(3.7);
    expect(otherSource).not.toHaveBeenCalled();
  });

  it("serves last-known-good rates when the source fails", async () => {
    const source = jest
      .fn()
      .mockResolvedValueOnce(rates(3.7))
      .mockRejectedValueOnce(new FxUnavailableError("down"));
    const { getFxRates, logger } = setup(source);
    await getFxRates();
    clock.ms += 7 * HOUR;
    expect((await getFxRates()).toIls.USD).toBe(3.7);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("last-known-good"),
      expect.objectContaining({ asOf: "2026-10-09T00:00:00.000Z" }),
    );
  });

  it("throws when there are no rates at all", async () => {
    const { getFxRates } = setup(() => Promise.reject(new FxUnavailableError("down")));
    await expect(getFxRates()).rejects.toThrow(FxUnavailableError);
  });

  it("wraps unexpected source errors", async () => {
    const { getFxRates } = setup(() => Promise.reject(new Error("weird")));
    await expect(getFxRates()).rejects.toThrow(/weird/);
    await expect(getFxRates()).rejects.toBeInstanceOf(FxUnavailableError);
  });

  it("keeps working when the store is down", async () => {
    const broken: RedisLike = {
      get: () => Promise.reject(new Error("x")),
      mget: () => Promise.reject(new Error("x")),
      set: () => Promise.reject(new Error("x")),
    };
    const { getFxRates, logger } = setup(async () => rates(3.7), broken);
    expect((await getFxRates()).toIls.USD).toBe(3.7);
    expect(logger.warn).toHaveBeenCalledWith("fx: cache read failed", expect.anything());
    expect(logger.warn).toHaveBeenCalledWith("fx: cache write failed", expect.anything());
  });

  it.each([
    ["garbage", "nope"],
    ["missing fields", { asOf: "x" }],
    ["invalid rates", { toIls: { ILS: 1, USD: -1, EUR: 4, GBP: 4, CNY: 1 }, asOf: "x", fetchedAtMs: 0 }],
  ])("ignores a corrupt stored value (%s)", async (_label, value) => {
    const store = createInMemoryRedis(() => clock.ms);
    await store.set(FX_KEY, value, { ex: 60 });
    const source = jest.fn(async () => rates(3.7));
    await setup(source, store).getFxRates();
    expect(source).toHaveBeenCalled();
  });
});

describe("createCachedFxRates — static fallback", () => {
  const fallback = rates(3.07);
  const down = (): Promise<FxRates> => Promise.reject(new Error("The operation was aborted due to timeout"));

  it("serves the fallback table when the source fails on a fresh instance, instead of throwing", async () => {
    const logger = { warn: jest.fn() };
    const source = jest.fn(down);
    const getFxRates = createCachedFxRates({
      source,
      store: createInMemoryRedis(() => clock.ms),
      fallback,
      now: () => clock.ms,
      logger,
    });
    await expect(getFxRates()).resolves.toBe(fallback);
    expect(logger.warn).toHaveBeenCalledWith(
      "fx: source failed and nothing cached, serving the static fallback table",
      expect.objectContaining({ asOf: fallback.asOf }),
    );
  });

  it("doesn't make every search wait on a down source: retries it after 5 minutes", async () => {
    const source = jest.fn(down);
    const getFxRates = createCachedFxRates({
      source,
      store: createInMemoryRedis(() => clock.ms),
      fallback,
      now: () => clock.ms,
    });
    await getFxRates();
    await getFxRates();
    expect(source).toHaveBeenCalledTimes(1);
    clock.ms += FALLBACK_RETRY_MS + 1;
    source.mockResolvedValueOnce(rates(3.1));
    await expect(getFxRates()).resolves.toMatchObject({ toIls: { USD: 3.1 } });
    expect(source).toHaveBeenCalledTimes(2);
  });

  it("still prefers last-known-good rates over the static table", async () => {
    const store = createInMemoryRedis(() => clock.ms);
    const warm = createCachedFxRates({ source: async () => rates(3.2), store, now: () => clock.ms });
    await warm();
    clock.ms += 7 * HOUR;
    const cold = createCachedFxRates({ source: down, store, fallback, now: () => clock.ms });
    await expect(cold()).resolves.toMatchObject({ toIls: { USD: 3.2 } });
  });
});
