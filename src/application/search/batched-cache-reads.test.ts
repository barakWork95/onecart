import { batchCacheReads } from "@/application/search/batched-cache-reads";
import { fakeSearchCache } from "@/test/fakes";

describe("batchCacheReads", () => {
  const entry = { products: [], hasMore: false, cachedAt: "2026-10-24T00:00:00.000Z" };

  it("sends reads from the same tick as one getMany, each caller getting its own key's value", async () => {
    const cache = fakeSearchCache(() => 0);
    await cache.set("a", entry, 60);
    const getMany = jest.spyOn(cache, "getMany");
    const read = batchCacheReads(cache);
    expect(await Promise.all([read("a"), read("missing")])).toEqual([entry, null]);
    expect(getMany).toHaveBeenCalledTimes(1);
    expect(getMany).toHaveBeenCalledWith(["a", "missing"]);

    await read("a");
    expect(getMany).toHaveBeenCalledTimes(2); // a later tick is a new batch
  });

  it("fails every read of a failed batch", async () => {
    const cache = fakeSearchCache(() => 0);
    jest.spyOn(cache, "getMany").mockRejectedValue(new Error("down"));
    const read = batchCacheReads(cache);
    const results = await Promise.allSettled([read("a"), read("b")]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
  });
});
