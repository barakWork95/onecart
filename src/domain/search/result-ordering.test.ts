import { groupProducts } from "@/domain/search/product-group";
import { filterOffers, paginate, sortGroups } from "@/domain/search/result-ordering";
import { money } from "@/domain/shared/money";
import { makeProduct } from "@/test/product-factory";

const ils = (agorot: number) => money(agorot, "ILS");

describe("filterOffers", () => {
  const cheap = makeProduct({
    sku: "cheap",
    total: 50_00,
    rating: { average: 3.9, count: 10 },
    freeShipping: true,
  });
  const mid = makeProduct({
    sku: "mid",
    total: 150_00,
    rating: { average: 4.6, count: 10 },
    freeShipping: false,
  });
  const pricey = makeProduct({ sku: "pricey", total: 400_00, rating: null, freeShipping: null });
  const all = [cheap, mid, pricey];
  const ids = (list: readonly { providerProductId: string }[]) => list.map((p) => p.providerProductId);

  it("returns everything with no filters", () => {
    expect(filterOffers(all, {})).toHaveLength(3);
  });

  it("filters by landed total range (inclusive)", () => {
    expect(ids(filterOffers(all, { minTotal: ils(50_00), maxTotal: ils(150_00) }))).toEqual(["cheap", "mid"]);
  });

  it("excludes unrated offers when a minimum rating is set", () => {
    expect(ids(filterOffers(all, { minRating: 4 }))).toEqual(["mid"]);
  });

  it("treats unknown shipping as not free", () => {
    expect(ids(filterOffers(all, { freeShippingOnly: true }))).toEqual(["cheap"]);
  });
});

describe("sortGroups", () => {
  const groups = groupProducts([
    makeProduct({
      provider: "amazon",
      sku: "fast",
      title: "Alpha X1",
      total: 300_00,
      rating: { average: 4.2, count: 50 },
      deliveryDays: [2, 4],
    }),
    makeProduct({
      provider: "aliexpress",
      sku: "cheap",
      title: "Beta Y2",
      total: 90_00,
      rating: null,
      deliveryDays: [10, 15],
    }),
    makeProduct({
      provider: "temu",
      sku: "rated",
      title: "Gamma Z3",
      total: 150_00,
      rating: { average: 4.9, count: 5 },
      deliveryDays: [null, null],
    }),
    makeProduct({
      provider: "ebay",
      sku: "rated2",
      title: "Delta W4",
      total: 160_00,
      rating: { average: 4.9, count: 80 },
      deliveryDays: [7, null],
    }),
  ]);
  const order = (sort: Parameters<typeof sortGroups>[1]) =>
    sortGroups(groups, sort).map((g) => g.offers[0].providerProductId);

  it("sorts by cheapest landed total", () => {
    expect(order("landed_price_asc")).toEqual(["cheap", "rated", "rated2", "fast"]);
  });

  it("sorts by rating, then review count, unrated last", () => {
    expect(order("rating_desc")).toEqual(["rated2", "rated", "fast", "cheap"]);
  });

  it("sorts by fastest delivery, unknown last", () => {
    expect(order("delivery_fastest")).toEqual(["fast", "rated2", "cheap", "rated"]);
  });

  it("prefers groups with more stores on a price tie, then id", () => {
    const tied = groupProducts([
      makeProduct({ provider: "amazon", sku: "solo", title: "Solo Item Q9", total: 100_00 }),
      makeProduct({ provider: "amazon", sku: "pair-a", title: "Pair Item K7", total: 100_00 }),
      makeProduct({ provider: "ebay", sku: "pair-b", title: "Pair Item K7", total: 100_00 }),
      makeProduct({ provider: "temu", sku: "alone", title: "Another Thing M5", total: 100_00 }),
    ]);
    expect(sortGroups(tied, "landed_price_asc").map((g) => g.id)).toEqual([
      "grp:amazon:pair-a",
      "grp:amazon:solo",
      "grp:temu:alone",
    ]);
  });

  it("sorts by relevance by interleaving each store's own ranking", () => {
    // Store positions: each group's best (lowest) position decides its place.
    const ranks = new Map([
      ["amazon:fast", 3],
      ["aliexpress:cheap", 0],
      ["temu:rated", 1],
      ["ebay:rated2", 1],
    ]);
    // rated vs rated2 tie on rank 1 and store count, so the cheaper one (rated, ₪150) wins.
    expect(
      sortGroups(groups, "relevance", (id) => ranks.get(id)).map((g) => g.offers[0].providerProductId),
    ).toEqual(["cheap", "rated", "rated2", "fast"]);
  });

  it("puts groups found in more stores first on a relevance tie, and unranked groups last", () => {
    const tied = groupProducts([
      makeProduct({ provider: "amazon", sku: "solo", title: "Solo Item Q9", total: 10_00 }),
      makeProduct({ provider: "amazon", sku: "pair-a", title: "Pair Item K7", total: 100_00 }),
      makeProduct({ provider: "ebay", sku: "pair-b", title: "Pair Item K7", total: 100_00 }),
      makeProduct({ provider: "temu", sku: "unranked", title: "Another Thing M5", total: 1_00 }),
    ]);
    const ranks = new Map([
      ["amazon:solo", 0],
      ["ebay:pair-b", 0],
    ]);
    expect(sortGroups(tied, "relevance", (id) => ranks.get(id)).map((g) => g.id)).toEqual([
      "grp:amazon:pair-a",
      "grp:amazon:solo",
      "grp:temu:unranked",
    ]);
  });

  it("falls back to price order for relevance when no ranks are known", () => {
    expect(sortGroups(groups, "relevance").map((g) => g.offers[0].providerProductId)).toEqual(
      sortGroups(groups, "landed_price_asc").map((g) => g.offers[0].providerProductId),
    );
  });

  it("does not mutate its input", () => {
    const before = groups.map((g) => g.id);
    sortGroups(groups, "rating_desc");
    expect(groups.map((g) => g.id)).toEqual(before);
  });
});

describe("paginate", () => {
  const items = ["a", "b", "c", "d", "e"];

  it("returns the requested page with metadata", () => {
    expect(paginate(items, 2, 2)).toEqual({
      items: ["c", "d"],
      pagination: { page: 2, pageSize: 2, totalResults: 5, hasNextPage: true },
    });
  });

  it("reports no next page on the last page", () => {
    expect(paginate(items, 3, 2).pagination.hasNextPage).toBe(false);
  });

  it("clamps nonsense page and size values", () => {
    expect(paginate(items, 0, 0)).toEqual({
      items: ["a"],
      pagination: { page: 1, pageSize: 1, totalResults: 5, hasNextPage: true },
    });
  });

  it("returns an empty page past the end", () => {
    expect(paginate(items, 9, 2).items).toEqual([]);
  });
});
