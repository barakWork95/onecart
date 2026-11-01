import { assembleResults } from "@/application/search/assemble-results";
import {
  createSearchPhotoHashing,
  lookAlikePairs,
  photoHashesFor,
  SEARCH_PHOTOS_PER_STORE,
} from "@/application/search/photo-hashes";
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
    const photos = createSearchPhotoHashing({ index, allow, perStore: 2, logger });
    return { photos, index, downloaded, allow, logger };
  }

  it("hashes each store's top photos for a generic search across stores, spending one allowance", async () => {
    const { photos, downloaded, allow } = setup();
    const results = response("monitor stand riser", twoStores);
    expect(await photos.pending(results)).toBe(true);
    expect(await photos.hash(results)).toBe(3);
    expect(allow).toHaveBeenCalledTimes(1);
    // eBay's top two and AliExpress's one; eBay's third is past `perStore`.
    expect(downloaded.sort()).toEqual([
      "https://img.example/aliexpress-1.jpg",
      "https://img.example/ebay-1.jpg",
      "https://img.example/ebay-2.jpg",
    ]);
    // Nothing left to check: the page stops asking.
    expect(await photos.pending(results)).toBe(false);
  });

  it("checks the top six per store by default", async () => {
    const { index, downloaded } = fakeImageHashIndex(() => "00ff00ff00ff00ff");
    const many = [...Array.from({ length: 9 }, (_, i) => listing("ebay", i)), listing("aliexpress", 1)];
    await createSearchPhotoHashing({ index, allow: async () => true }).hash(
      response("monitor stand riser", many),
    );
    expect(downloaded.filter((u) => u.includes("ebay"))).toHaveLength(SEARCH_PHOTOS_PER_STORE);
    expect(SEARCH_PHOTOS_PER_STORE).toBe(6);
  });

  it("spends nothing when there's nothing to hash", async () => {
    const { photos, index, allow, downloaded } = setup();
    // A branded search never uses photos.
    expect(await photos.pending(response("anker 737", twoStores))).toBe(false);
    expect(await photos.hash(response("anker 737", twoStores))).toBe("not_needed");
    // One store alone has no cross-store look-alike to find.
    const oneStore = response("monitor stand riser", [listing("ebay", 1), listing("ebay", 2)]);
    expect(await photos.pending(oneStore)).toBe(false);
    expect(await photos.hash(oneStore)).toBe("not_needed");
    // Every photo already tried (hashed or remembered as unhashable).
    await index.ensure(twoStores.map((p) => p.imageUrl!));
    downloaded.length = 0;
    expect(await photos.hash(response("monitor stand riser", twoStores))).toBe("not_needed");
    expect(allow).not.toHaveBeenCalled();
    expect(downloaded).toEqual([]);
  });

  it("downloads nothing once the day's allowance is spent", async () => {
    const { photos, downloaded, logger } = setup(false);
    expect(await photos.hash(response("monitor stand riser", twoStores))).toBe("over_budget");
    expect(downloaded).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith("search photos: over the daily allowance, not hashing", {
      query: "monitor stand riser",
    });
  });

  it("never throws: a failure is logged and reported", async () => {
    const logger = { warn: jest.fn() };
    const index = { missing: () => Promise.reject(new Error("redis down")), ensure: jest.fn() };
    const photos = createSearchPhotoHashing({ index, allow: async () => true, logger });
    const results = response("monitor stand riser", twoStores);
    expect(await photos.hash(results)).toBe("error");
    expect(await photos.pending(results)).toBe(false);
    expect(index.ensure).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("search photos: hashing failed", { error: "redis down" });
    expect(logger.warn).toHaveBeenCalledWith("search photos: check failed", { error: "redis down" });
  });
});

describe("lookAlikePairs", () => {
  it("lists the photo-matched groups that span stores, with their listings and stores", () => {
    const ebay = makeProduct({
      provider: "ebay",
      sku: "e1",
      title: "Magnetic Cable Holder Clip Organizer",
      total: 12_40,
    });
    const ali = makeProduct({
      provider: "aliexpress",
      sku: "a1",
      title: "Magnetic Cable Organizer Clip",
      total: 2_99,
    });
    const lone = makeProduct({
      provider: "ebay",
      sku: "e2",
      title: "Desk Lamp",
      imageUrl: "https://img.example/lamp.jpg",
    });
    const { groups } = assembleResults(
      [{ products: [ebay, ali, lone], unavailable: [] }],
      { filters: {}, sort: "relevance" },
      searchIntent("cable clips"),
      new Map([
        [ebay.imageUrl!, "e0b2b6969e9c9c9c"],
        [ali.imageUrl!, "e0b2b6969fb80ed5"],
      ]),
    );
    expect(lookAlikePairs(groups)).toEqual([
      { listingIds: expect.arrayContaining([ebay.id, ali.id]), stores: ["aliexpress", "ebay"] },
    ]);
    expect(lookAlikePairs(groups.filter((g) => g.listings.length === 1))).toEqual([]);
  });
});
