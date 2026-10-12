import { matchProducts, toMatchCandidate } from "@/domain/matching/product-matcher";
import { bestOffer, groupProducts } from "@/domain/search/product-group";
import { money } from "@/domain/shared/money";
import { makeProduct } from "@/test/product-factory";

const ils = (agorot: number) => money(agorot, "ILS");

describe("groupProducts", () => {
  const ali = makeProduct({
    provider: "aliexpress",
    sku: "a1",
    title: "SoundCore Life P3 ANC Earbuds",
    total: 89_00,
    rating: { average: 4.8, count: 1420 },
  });
  const temu = makeProduct({
    provider: "temu",
    sku: "t1",
    title: "Soundcore Life P3 Wireless Earbuds",
    total: 98_00,
  });
  const amz = makeProduct({
    provider: "amazon",
    sku: "z1",
    title: "Anker Soundcore Life P3 Earbuds",
    total: 142_00,
    rating: { average: 4.5, count: 3150 },
  });
  const ebay = makeProduct({
    provider: "ebay",
    sku: "e1",
    title: "Soundcore Life P3 Earbuds Black",
    total: 153_00,
    imageUrl: null,
  });
  const sony = makeProduct({
    provider: "amazon",
    sku: "z2",
    title: "Sony WH-CH720N Headphones",
    total: 310_00,
  });

  it("groups the same product from four stores into one comparison", () => {
    const groups = groupProducts([ebay, sony, amz, temu, ali]);
    expect(groups).toHaveLength(2);

    const [earbuds, headphones] = groups;
    expect(earbuds?.offers.map((o) => o.provider)).toEqual(["aliexpress", "temu", "amazon", "ebay"]);
    expect(earbuds && bestOffer(earbuds).id).toBe("aliexpress:a1");
    expect(earbuds).toMatchObject({
      id: "grp:aliexpress:a1",
      priceRange: { min: ils(89_00), max: ils(153_00) },
      matchedBy: "model_number",
      // Most-reviewed offer supplies the display title and image.
      title: "Anker Soundcore Life P3 Earbuds",
      imageUrl: "https://img.example/z1.jpg",
    });
    // (4.8×1420 + 4.5×3150) / 4570 = 4.593…
    expect(earbuds?.rating).toEqual({ average: 4.59, count: 4570 });
    expect(headphones).toMatchObject({
      matchedBy: "single",
      rating: null,
      title: "Sony WH-CH720N Headphones",
    });
  });

  it("keeps one offer per store; the cheaper duplicate listing joins the group", () => {
    const aliDuplicate = makeProduct({
      provider: "aliexpress",
      sku: "a2",
      title: "SoundCore Life P3 ANC Earbuds",
      total: 95_00,
    });
    const groups = groupProducts([aliDuplicate, amz, ali]);
    expect(groups.map((g) => g.offers.map((o) => o.id))).toEqual([
      ["aliexpress:a1", "amazon:z1"],
      ["aliexpress:a2"],
    ]);
  });

  it("uses complete linkage so similar-but-different items don't chain together", () => {
    // B matches A and C individually, but A and C conflict (P2 vs P3).
    const a = makeProduct({ provider: "amazon", sku: "1", title: "Soundcore Life P3 Earbuds" });
    const b = makeProduct({
      provider: "temu",
      sku: "2",
      title: "Soundcore Life P2 P3 Earbuds Combo",
      total: 100_01,
    });
    const c = makeProduct({ provider: "ebay", sku: "3", title: "Soundcore Life P2 Earbuds", total: 100_02 });
    const [ca, cb, cc] = [toMatchCandidate(a), toMatchCandidate(b), toMatchCandidate(c)];
    expect(matchProducts(cb, ca)).not.toBeNull();
    expect(matchProducts(cb, cc)).not.toBeNull();
    expect(matchProducts(ca, cc)).toBeNull();

    const ids = groupProducts([a, b, c]).map((g) => g.offers.map((o) => o.providerProductId));
    // Single linkage would chain all three; complete linkage keeps C out of A's group.
    expect(ids).toEqual([["1", "2"], ["3"]]);
  });

  it("reports the weakest match basis in the group", () => {
    const a = makeProduct({ provider: "amazon", sku: "1", title: "Cervical Memory Foam Pillow" });
    const b = makeProduct({ provider: "ebay", sku: "2", title: "Memory Foam Pillow Cervical" });
    expect(groupProducts([a, b])[0]?.matchedBy).toBe("title_similarity");
  });

  it("falls back to the cheapest offer's title when no offer has reviews, and to any image", () => {
    const a = makeProduct({
      provider: "amazon",
      sku: "1",
      title: "Cervical Memory Foam Pillow",
      total: 50_00,
      imageUrl: null,
    });
    const b = makeProduct({ provider: "ebay", sku: "2", title: "Memory Foam Pillow Cervical", total: 60_00 });
    expect(groupProducts([b, a])[0]).toMatchObject({
      title: "Cervical Memory Foam Pillow",
      imageUrl: "https://img.example/2.jpg",
    });
  });

  it("is deterministic regardless of input order", () => {
    const input = [ebay, sony, amz, temu, ali];
    expect(groupProducts(input)).toEqual(groupProducts([...input].reverse()));
  });

  it("returns no groups for no products", () => {
    expect(groupProducts([])).toEqual([]);
  });
});

describe("groupProducts — stores that won't ship", () => {
  const amazonListing = (sku: string, title: string) => ({
    id: `amazon:${sku}`,
    provider: "amazon" as const,
    providerProductId: sku,
    title,
    productUrl: `https://www.amazon.com/dp/${sku}`,
    imageUrl: null,
    reason: "no_offer_to_destination" as const,
  });
  const ebayXm5 = makeProduct({
    provider: "ebay",
    sku: "e",
    title: "Sony WH-1000XM5 Noise Canceling Wireless Headphones Black",
    total: 1000_00,
  });

  it("attaches the matching listing from a store missing in the group", () => {
    const black = amazonListing("B1", "WH-1000XM5 Premium Noise Cancelling Wireless Headphones, Black");
    const xm6 = amazonListing("B2", "WH-1000XM6 The Best Noise Cancelling Wireless Headphones, Black");
    const [group] = groupProducts([ebayXm5], { unavailable: [xm6, black] });
    expect(group?.unavailable).toEqual([black]);
  });

  it("never attaches to accessories, from accessory listings, or for a store already in the group", () => {
    const pads = makeProduct({
      provider: "ebay",
      sku: "p",
      title: "Earpads for Sony WH-1000XM5",
      total: 50_00,
    });
    const listingForPads = amazonListing("B3", "Earpads for Sony WH-1000XM5 Black");
    const amazonOffer = makeProduct({
      provider: "amazon",
      sku: "z",
      title: "Sony WH-1000XM5 Wireless Headphones Black",
      total: 1100_00,
    });
    const groups = groupProducts([pads, ebayXm5, amazonOffer], {
      unavailable: [listingForPads, amazonListing("B1", "WH-1000XM5 Wireless Headphones Black")],
    });
    expect(groups.every((g) => g.unavailable.length === 0)).toBe(true);
  });

  it("uses the search's accessory decisions for grouping and the group flags", () => {
    const [group] = groupProducts([ebayXm5], {
      classes: new Map([[ebayXm5.id, { onIntent: false, isAccessory: true }]]),
    });
    expect(group).toMatchObject({ onIntent: false, isAccessory: true });
  });
});
