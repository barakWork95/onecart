describe("test guard against live APIs", () => {
  it("refuses SerpApi and the stores' APIs", async () => {
    await expect(fetch("https://serpapi.com/search.json?engine=amazon&k=x")).rejects.toThrow(
      /must not call live APIs \(serpapi\.com\)/,
    );
    await expect(fetch("https://api.ebay.com/buy/browse/v1/item_summary/search?q=x")).rejects.toThrow(
      /api\.ebay\.com/,
    );
  });
});
