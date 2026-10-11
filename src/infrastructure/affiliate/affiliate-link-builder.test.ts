import { createAffiliateLinkBuilder } from "@/infrastructure/affiliate/affiliate-link-builder";
import { buildAmazonAffiliateUrl } from "@/infrastructure/affiliate/amazon";
import { buildEbayAffiliateUrl } from "@/infrastructure/affiliate/ebay";

describe("buildAmazonAffiliateUrl", () => {
  it("adds the Associates tag", () => {
    expect(
      buildAmazonAffiliateUrl(new URL("https://www.amazon.com/dp/B08KW1KR5H"), "onecart-20").toString(),
    ).toBe("https://www.amazon.com/dp/B08KW1KR5H?tag=onecart-20");
  });

  it("replaces an existing tag and keeps other params without double-encoding", () => {
    const url = buildAmazonAffiliateUrl(
      new URL("https://www.amazon.com/s?k=wireless%20earbuds&tag=someone-20&tag=x"),
      "onecart-20",
    );
    expect(url.searchParams.getAll("tag")).toEqual(["onecart-20"]);
    expect(url.searchParams.get("k")).toBe("wireless earbuds");
    expect(url.toString()).not.toContain("%2520");
  });

  it("does not mutate its input", () => {
    const input = new URL("https://www.amazon.com/dp/B08KW1KR5H");
    buildAmazonAffiliateUrl(input, "onecart-20");
    expect(input.search).toBe("");
  });
});

describe("buildEbayAffiliateUrl", () => {
  it("adds the EPN parameters for eBay US", () => {
    const url = buildEbayAffiliateUrl(new URL("https://www.ebay.com/itm/395012345678?var=0"), "5338000000");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      var: "0",
      mkevt: "1",
      mkcid: "1",
      mkrid: "711-53200-19255-0",
      toolid: "10001",
      campid: "5338000000",
    });
  });

  it("replaces existing EPN params instead of duplicating them", () => {
    const url = buildEbayAffiliateUrl(
      new URL("https://www.ebay.com/itm/1?campid=999&mkevt=2&customid=old"),
      "5338000000",
    );
    expect(url.searchParams.getAll("campid")).toEqual(["5338000000"]);
    expect(url.searchParams.getAll("mkevt")).toEqual(["1"]);
    expect(url.searchParams.has("customid")).toBe(false);
  });
});

describe("createAffiliateLinkBuilder", () => {
  const builder = createAffiliateLinkBuilder({ amazonTag: "onecart-20", ebayCampaignId: "5338000000" });

  it("tags Amazon and eBay when configured", async () => {
    expect((await builder.build("amazon", new URL("https://www.amazon.com/dp/B1"))).affiliated).toBe(true);
    expect(
      (await builder.build("ebay", new URL("https://www.ebay.com/itm/1"))).url.searchParams.get("campid"),
    ).toBe("5338000000");
  });

  it("passes AliExpress and Temu through untagged when no generator is configured", async () => {
    for (const [provider, url] of [
      ["aliexpress", "https://www.aliexpress.com/item/1.html"],
      ["temu", "https://www.temu.com/goods.html?goods_id=1"],
    ] as const) {
      expect(await builder.build(provider, new URL(url))).toEqual({ url: new URL(url), affiliated: false });
    }
  });

  it("uses the AliExpress promotion link when the generator returns one", async () => {
    const promotion = new URL("https://s.click.aliexpress.com/e/_DAbc123");
    const withAli = createAffiliateLinkBuilder({ aliexpress: { generate: async () => promotion } });
    expect(await withAli.build("aliexpress", new URL("https://www.aliexpress.com/item/1.html"))).toEqual({
      url: promotion,
      affiliated: true,
    });
  });

  it("falls back to the clean AliExpress URL when generation yields nothing or throws", async () => {
    const clean = new URL("https://www.aliexpress.com/item/1.html");
    for (const generate of [async () => null, () => Promise.reject(new Error("boom"))]) {
      const withAli = createAffiliateLinkBuilder({ aliexpress: { generate } });
      expect(await withAli.build("aliexpress", clean)).toEqual({ url: clean, affiliated: false });
    }
  });

  it("passes through when a store's program isn't configured", async () => {
    expect(
      await createAffiliateLinkBuilder({}).build("amazon", new URL("https://www.amazon.com/dp/B1")),
    ).toEqual({
      url: new URL("https://www.amazon.com/dp/B1"),
      affiliated: false,
    });
  });
});
