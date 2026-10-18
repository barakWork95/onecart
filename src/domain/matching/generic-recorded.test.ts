import recorded from "@/domain/matching/fixtures/generic-recorded.json";
import { hammingDistance, isImageHash } from "@/domain/matching/image-hash";
import { searchIntent } from "@/domain/search/search-intent";

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
});
