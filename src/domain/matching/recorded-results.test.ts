import recorded from "@/domain/matching/fixtures/recorded-results.json";
import { groupProducts } from "@/domain/search/product-group";
import { PROVIDER_IDS, type ProviderId } from "@/domain/shared/provider";
import { makeProduct } from "@/test/product-factory";

function isProviderId(value: string): value is ProviderId {
  return PROVIDER_IDS.some((id) => id === value);
}

type Listing = (typeof recorded.queries)[keyof typeof recorded.queries][number];

function toProducts(listings: readonly Listing[]) {
  return listings.map((listing, index) => {
    if (!isProviderId(listing.store)) throw new Error(`Unknown store in fixture: ${listing.store}`);
    return makeProduct({
      provider: listing.store,
      sku: String(index),
      title: listing.title,
      total: Math.round(listing.item * 100),
    });
  });
}

/** Titles of every multi-store group, cheapest offer first. */
function crossStoreGroups(query: keyof typeof recorded.queries) {
  return groupProducts(toProducts(recorded.queries[query]))
    .filter((group) => group.offers.length > 1)
    .map((group) => ({ matchedBy: group.matchedBy, titles: group.offers.map((o) => o.title) }));
}

/**
 * Real Amazon + eBay results for seven queries (see fixtures/README.md). The
 * previous matcher formed 22 cross-store groups here and ~20 were wrong
 * (shared "100%" in towel titles, cases grouped with charging-port boards).
 * Any new group in this file must be checked by hand before it's accepted.
 */
describe("grouping on recorded real results", () => {
  it.each([
    "wireless headphones",
    "kitchen",
    "airpods pro",
    "sony wh-1000xm5",
    "jbl flip 6",
    "kindle paperwhite",
  ] as const)("forms no false cross-store groups for %p", (query) => {
    expect(crossStoreGroups(query)).toEqual([]);
  });

  it("groups the one real Amazon/eBay match for “instant pot” as a similar item", () => {
    expect(crossStoreGroups("instant pot")).toEqual([
      {
        matchedBy: "title_similarity",
        titles: [
          "Duo 6 Qt 7-in-1 Electric Pressure Cooker, Stainless Steel",
          "Instant Pot Duo 7 in 1 6 Qt Electric Pressure Cooker Stainless Steel Slow Cooker",
        ],
      },
    ]);
  });

  it("keeps every listing: groups partition the input", () => {
    for (const listings of Object.values(recorded.queries)) {
      const offers = groupProducts(toProducts(listings)).flatMap((g) => g.offers.map((o) => o.id));
      expect(new Set(offers).size).toBe(listings.length);
    }
  });
});
