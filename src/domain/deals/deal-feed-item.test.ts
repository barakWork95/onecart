import { DEAL_CATEGORIES } from "@/domain/deals/deal-feed-item";

describe("DEAL_CATEGORIES", () => {
  it("covers the homepage filter chips and has a catch-all", () => {
    expect(DEAL_CATEGORIES).toEqual(expect.arrayContaining(["tech", "home", "fashion", "other"]));
    expect(new Set(DEAL_CATEGORIES).size).toBe(DEAL_CATEGORIES.length);
  });
});
