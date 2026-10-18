import { coreWordContainment, matchGeneric } from "@/domain/matching/generic-matcher";
import { toMatchCandidate, type MatchCandidate } from "@/domain/matching/product-matcher";
import { makeProduct, type ProductSpec } from "@/test/product-factory";

// The real pair from generic-recorded.json: the same magnetic cable clips, photographed twice.
const EBAY_TITLE = "Cable Holder Magnetic Cable Wire Clip Tidy Cord Lead Organizer USB Charger.";
const ALI_TITLE =
  "Mini Cable Organizer Holder Magnetic Cable Smooth Adjustable Cord Holder Under Desk Management Wire Keeper Car Cable Clips";
const EBAY_HASH = "e0b2b6969e9c9c9c";
/** 9 bits from EBAY_HASH. */
const ALI_HASH = "e0b2b6969fb80ed5";

function listing(spec: ProductSpec & { imageHash?: string | null }): MatchCandidate {
  const { imageHash = null, ...rest } = spec;
  return { ...toMatchCandidate(makeProduct(rest)), imageHash };
}
const ebay = (over: Partial<ProductSpec & { imageHash: string | null }> = {}) =>
  listing({ provider: "ebay", sku: "e", title: EBAY_TITLE, total: 12_40, imageHash: EBAY_HASH, ...over });
const ali = (over: Partial<ProductSpec & { imageHash: string | null }> = {}) =>
  listing({
    provider: "aliexpress",
    sku: "a",
    title: ALI_TITLE,
    total: 2_99,
    sellerName: "Shop1234 Store",
    imageHash: ALI_HASH,
    ...over,
  });

describe("matchGeneric", () => {
  it("matches the same commodity item across stores by photo, specs and words (the real cable clips)", () => {
    expect(matchGeneric(ebay(), ali())).toEqual({ basis: "visual_match", score: expect.any(Number) });
    expect(matchGeneric(ali(), ebay())).not.toBeNull();
  });

  it("needs both photos hashed, and within 10 bits across stores", () => {
    expect(matchGeneric(ebay({ imageHash: null }), ali())).toBeNull();
    // 14 bits: the closest different product in the recorded data.
    expect(matchGeneric(ebay(), ali({ imageHash: "e0b2b604d7b80ed5" }))).toBeNull();
  });

  it("is stricter within one store: 6 bits", () => {
    const other = (hash: string) => ali({ sku: "a2", imageHash: hash });
    expect(matchGeneric(ali(), other("e0b2b5969fb80ed5"))).not.toBeNull(); // 2 bits
    expect(matchGeneric(ali(), other("e0b249969fb80ed5"))).toBeNull(); // 8 bits
  });

  it("vetoes a conflicting quantity, pack size or colour (gate A)", () => {
    expect(
      matchGeneric(ebay({ title: `${EBAY_TITLE} 6 Pcs` }), ali({ title: `${ALI_TITLE} 10 Pcs` })),
    ).toBeNull();
    expect(
      matchGeneric(ebay({ title: `${EBAY_TITLE} Black` }), ali({ title: `${ALI_TITLE} White` })),
    ).toBeNull();
  });

  it("needs half the shorter title's core words in the longer (gate C)", () => {
    expect(matchGeneric(ebay(), ali({ title: "Desk Lamp LED Dimmable Reading Light" }))).toBeNull();
  });

  it("allows up to 6x between item prices, not more (gate D)", () => {
    expect(matchGeneric(ebay({ total: 17_94 }), ali())).not.toBeNull(); // 6.0x
    expect(matchGeneric(ebay({ total: 18_00 }), ali())).toBeNull();
  });

  it("never applies when either listing names a known brand (those keep the branded rules)", () => {
    expect(matchGeneric(ebay({ title: `Baseus ${EBAY_TITLE}` }), ali())).toBeNull();
  });

  it("keeps a part and a product apart (gate E), as the search classified them", () => {
    const as = (c: MatchCandidate, isAccessory: boolean) => ({ ...c, tokens: { ...c.tokens, isAccessory } });
    expect(matchGeneric(as(ebay(), true), as(ali(), false))).toBeNull();
    expect(matchGeneric(as(ebay(), false), as(ali(), false))).not.toBeNull();
  });
});

describe("coreWordContainment", () => {
  it("ignores marketplace filler and plurals", () => {
    expect(coreWordContainment("2025 New Hot Sale Cable Clips", "cable clip organizer")).toBe(1);
    expect(coreWordContainment("Cable Clips", "Desk Lamp")).toBe(0);
  });
});
