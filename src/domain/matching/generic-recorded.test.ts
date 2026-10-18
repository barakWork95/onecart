import recorded from "@/domain/matching/fixtures/generic-recorded.json";
import { hammingDistance, isImageHash } from "@/domain/matching/image-hash";
import { compareMoney } from "@/domain/shared/money";
import { groupProducts } from "@/domain/search/product-group";
import { classifyOffers, searchIntent } from "@/domain/search/search-intent";
import { makeProduct } from "@/test/product-factory";

/**
 * Real eBay + AliExpress results for ten generic queries (recorded 2026-10-18),
 * photos hashed with infrastructure/images/dhash.ts: the calibration data for
 * generic (photo-based) matching. These tests pin what the data showed.
 */
const queries = Object.entries(recorded.queries);

function crossStorePairs() {
  return queries.flatMap(([query, { listings }]) => {
    const ebay = listings.filter((l) => l.store === "ebay" && l.imageHash);
    const ali = listings.filter((l) => l.store === "aliexpress" && l.imageHash);
    return ebay.flatMap((e) =>
      ali.map((a) => ({ query, ebay: e, ali: a, distance: hammingDistance(e.imageHash!, a.imageHash!) })),
    );
  });
}

/** Each query's listings grouped as a search would, with or without the cached photo hashes. */
function grouped({ withHashes }: { withHashes: boolean }) {
  return queries.map(([query, { listings }]) => {
    const products = listings.map((l, i) =>
      makeProduct({
        provider: l.store === "ebay" ? "ebay" : "aliexpress",
        sku: `${l.store}-${i}`,
        title: l.title,
        total: Math.round(l.item * 100),
        imageUrl: l.imageUrl,
        sellerName: null,
      }),
    );
    const hashes = new Map(listings.map((l) => [l.imageUrl, l.imageHash]));
    const groups = groupProducts(products, {
      classes: classifyOffers(products, searchIntent(query)),
      ...(withHashes ? { imageHashes: hashes } : {}),
    });
    return { query, hashes, groups: groups.filter((g) => g.listings.length > 1) };
  });
}

/** [query, stores, item prices cheapest first] per group of several listings. */
const summary = (rows: ReturnType<typeof grouped>) =>
  rows.flatMap(({ query, groups }) =>
    groups.map((g) => [
      query,
      g.offers.map((o) => o.provider).join("+"),
      g.listings.map((l) => l.price.item.amountMinor / 100),
    ]),
  );

describe("recorded generic results", () => {
  it("are ten generic queries, every photo hashed", () => {
    expect(queries).toHaveLength(10);
    for (const [query, { listings }] of queries) {
      expect(searchIntent(query).mode).toBe("generic");
      for (const l of listings) expect(isImageHash(l.imageHash)).toBe(true);
    }
  });

  it("share no supplier photo across stores: sellers re-render, so no pair is within 8 bits", () => {
    const pairs = crossStorePairs();
    expect(pairs.length).toBeGreaterThan(4_000);
    expect(pairs.filter((p) => p.distance <= 8)).toEqual([]);
  });

  it("put the same gadget's re-rendered photos within 10 bits, and different products from 14 up", () => {
    // Checked by eye: the same magnetic cable clips, photographed twice. eBay lands at ₪419
    // (₪12.40 item + ₪406.85 shipping to Israel); AliExpress sells it from ₪2.99.
    const near = crossStorePairs().filter((p) => p.distance <= 12);
    expect(near.map((p) => [p.query, p.distance, p.ebay.item, p.ali.item])).toEqual([
      ["cable organizer clips", 9, 12.4, 2.99],
      ["cable organizer clips", 9, 12.4, 5.09],
    ]);
    // The next-closest pairs (14, 17, 18…) are different products.
    expect(
      Math.min(
        ...crossStorePairs()
          .filter((p) => p.distance > 12)
          .map((p) => p.distance),
      ),
    ).toBe(14);
  });

  it("group across stores only the photo-verified cable clips (10 bits, gates A, C, D, E)", () => {
    const cross = grouped({ withHashes: true }).flatMap(({ query, groups }) =>
      groups.filter((g) => g.offers.length > 1).map((g) => ({ query, g })),
    );
    expect(
      cross.map(({ query, g }) => [
        query,
        g.matchedBy,
        g.listings.map((l) => l.price.item.amountMinor / 100),
      ]),
    ).toEqual([["cable organizer clips", "visual_match", [2.99, 5.09, 12.4]]]);
  });

  it("collapse a store's listings only on a near-identical photo (6 bits), cheapest seller first", () => {
    const rows = grouped({ withHashes: true });
    // Reviewed by title, photo distance and price: one item re-listed, or sold by several sellers.
    expect(summary(rows).filter(([, stores]) => !String(stores).includes("+"))).toEqual([
      ["vegetable peeler", "ebay", [7.79, 16.54]],
      ["vegetable peeler", "ebay", [14.47, 16.54]],
      ["vegetable peeler", "ebay", [16.18, 21.75]],
      ["vegetable chopper", "ebay", [24.25, 24.25]],
      ["vegetable chopper", "ebay", [41.42, 41.42]],
      ["digital kitchen scale", "ebay", [43.55, 46.63, 69.89]],
      ["silicone spatula set", "aliexpress", [12.4, 13.26]],
      ["silicone spatula set", "ebay", [38.31, 59.08]],
      ["silicone spatula set", "ebay", [124.28, 124.28, 124.28]],
      ["magnetic car phone holder", "aliexpress", [1.99, 2.59]],
      ["magnetic car phone holder", "aliexpress", [2.59, 2.85]],
      ["magnetic car phone holder", "ebay", [16.24, 25.82, 32.79]],
      ["car fm transmitter bluetooth", "aliexpress", [13.79, 22.99]],
      ["car fm transmitter bluetooth", "ebay", [69.06, 82.46, 88.32]],
      ["dual usb car charger", "ebay", [6.19, 6.19, 6.5]],
      ["dual usb car charger", "ebay", [8.05, 25.34]],
      ["cable organizer clips", "aliexpress", [2.69, 3.49]],
      ["cable organizer clips", "ebay", [42.21, 42.25]],
      ["led strip lights 5m", "aliexpress", [12.69, 13.19]],
      ["led strip lights 5m", "ebay", [34.36, 37.3, 48.9, 62.15, 70.44, 93.24]],
      ["led strip lights 5m", "ebay", [41.42, 74.5]],
    ]);
    for (const { hashes, groups } of rows) {
      for (const g of groups) {
        const [cheapest] = [...g.listings].sort((a, b) => compareMoney(a.price.total, b.price.total));
        expect(g.offers[0]?.id).toBe(cheapest?.id);
        if (g.offers.length > 1) continue;
        const photos = g.listings.map((l) => hashes.get(l.imageUrl ?? "")!);
        for (const [i, a] of photos.entries())
          for (const b of photos.slice(i + 1)) expect(hammingDistance(a, b)).toBeLessThanOrEqual(6);
      }
    }
  });

  it("never group unbranded listings without photo hashes: format codes (MP3, QC3.0) aren't models", () => {
    expect(summary(grouped({ withHashes: false }))).toEqual([]);
  });
});
