import { assembleResults } from "@/application/search/assemble-results";
import { createSearchPhotoHashing, photoHashesFor } from "@/application/search/photo-hashes";
import { searchIntent } from "@/domain/search/search-intent";
import type { SearchResponse } from "@/domain/search/search-response";
import { fakeImageHashIndex } from "@/test/fakes";
import { makeProduct } from "@/test/product-factory";

const GENERIC = searchIntent("cable clips");
const withPhoto = makeProduct({ sku: "1", title: "Cable Clip" });
const noPhoto = makeProduct({ sku: "2", title: "Cable Clip", imageUrl: null });

describe("photoHashesFor", () => {
  it("reads the cached hashes of a generic search's photos", async () => {
    const found = new Map([[withPhoto.imageUrl!, "e0b2b6969e9c9c9c"]]);
    const cached = jest.fn(() => Promise.resolve(found));
    expect(await photoHashesFor({ cached }, [withPhoto, noPhoto], GENERIC)).toBe(found);
    expect(cached).toHaveBeenCalledWith([withPhoto.imageUrl]);
  });

  it("skips the lookup with no reader, a branded search, or no photos", async () => {
    const cached = jest.fn(() => Promise.resolve(new Map<string, string>()));
    expect(await photoHashesFor(undefined, [withPhoto], GENERIC)).toBeUndefined();
    expect(await photoHashesFor({ cached }, [withPhoto], searchIntent("anker 737"))).toBeUndefined();
    expect(await photoHashesFor({ cached }, [noPhoto], GENERIC)).toBeUndefined();
    expect(cached).not.toHaveBeenCalled();
  });

  it("treats a failed lookup as no hashes, logging why", async () => {
    const logger = { warn: jest.fn() };
    expect(
      await photoHashesFor({ cached: () => Promise.reject("nope") }, [withPhoto], GENERIC, logger),
    ).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("photo hash lookup failed"), {
      error: "nope",
    });
    // The default logger is silent.
    expect(
      await photoHashesFor({ cached: () => Promise.reject(new Error("x")) }, [withPhoto], GENERIC),
    ).toBeUndefined();
  });
});

function response(query: string, products: ReturnType<typeof makeProduct>[]): SearchResponse {
  const { groups } = assembleResults(
    [{ products, unavailable: [] }],
    { filters: {}, sort: "relevance" },
    searchIntent(query),
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
    totalOffers: products.length,
    providers: [],
    pagination: { page: 1, pageSize: 20, totalResults: groups.length, hasNextPage: false },
    isPartial: false,
    generatedAt: "2026-11-01T09:00:00.000Z",
  };
}

describe("createSearchPhotoHashing", () => {
  const listing = (provider: "ebay" | "aliexpress", n: number, title = "Monitor Stand Riser") =>
    makeProduct({
      provider,
      sku: `${provider}-${n}`,
      title: `${title} ${n}`,
      imageUrl: `https://img.example/${provider}-${n}.jpg`,
    });
  const twoStores = [listing("ebay", 1), listing("ebay", 2), listing("ebay", 3), listing("aliexpress", 1)];

  function setup(allowed = true) {
    const { index, downloaded } = fakeImageHashIndex(() => "00ff00ff00ff00ff");
    const allow = jest.fn(async () => allowed);
    const logger = { warn: jest.fn() };
    const hash = createSearchPhotoHashing({ index, allow, perStore: 2, logger });
    return { hash, index, downloaded, allow, logger };
  }

  it("hashes each store's top photos for a generic search across stores, spending one allowance", async () => {
    const { hash, downloaded, allow } = setup();
    expect(await hash(response("monitor stand riser", twoStores))).toBe(3);
    expect(allow).toHaveBeenCalledTimes(1);
    // eBay's top two and AliExpress's one; eBay's third is past `perStore`.
    expect(downloaded.sort()).toEqual([
      "https://img.example/aliexpress-1.jpg",
      "https://img.example/ebay-1.jpg",
      "https://img.example/ebay-2.jpg",
    ]);
  });

  it("spends nothing when there's nothing to hash", async () => {
    const { hash, index, allow, downloaded } = setup();
    // A branded search never uses photos.
    expect(await hash(response("anker 737", twoStores))).toBe("not_needed");
    // One store alone has no cross-store look-alike to find.
    expect(await hash(response("monitor stand riser", [listing("ebay", 1), listing("ebay", 2)]))).toBe(
      "not_needed",
    );
    // Every photo already tried (hashed or remembered as unhashable).
    await index.ensure(twoStores.map((p) => p.imageUrl!));
    downloaded.length = 0;
    expect(await hash(response("monitor stand riser", twoStores))).toBe("not_needed");
    expect(allow).not.toHaveBeenCalled();
    expect(downloaded).toEqual([]);
  });

  it("downloads nothing once the day's allowance is spent", async () => {
    const { hash, downloaded, logger } = setup(false);
    expect(await hash(response("monitor stand riser", twoStores))).toBe("over_budget");
    expect(downloaded).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith("search photos: over the daily allowance, not hashing", {
      query: "monitor stand riser",
    });
  });

  it("never throws: a failure is logged and reported", async () => {
    const logger = { warn: jest.fn() };
    const index = { missing: () => Promise.reject(new Error("redis down")), ensure: jest.fn() };
    const hash = createSearchPhotoHashing({ index, allow: async () => true, logger });
    expect(await hash(response("monitor stand riser", twoStores))).toBe("error");
    expect(index.ensure).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("search photos: hashing failed", { error: "redis down" });
  });
});
