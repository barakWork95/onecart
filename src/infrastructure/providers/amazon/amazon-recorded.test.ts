import { ISRAEL_IMPORT_POLICY } from "@/config/israel-import-policy";
import type { SearchQuery } from "@/domain/search/search-query";
import { createAmazonProvider } from "@/infrastructure/providers/amazon/amazon-adapter";
import {
  createRecordedSerpApiFetch,
  RECORDED_AMAZON_QUERIES,
} from "@/infrastructure/providers/amazon/amazon-recorded";
import { TEST_FX } from "@/test/fx";

const query = (text: string): SearchQuery => ({
  rawText: text,
  detectedLanguage: "en",
  normalizedText: text,
  sort: "relevance",
  filters: {},
  destination: { country: "IL" },
  page: 1,
  pageSize: 20,
});

function recordedAmazon() {
  return createAmazonProvider({
    apiKey: "recorded",
    importPolicy: ISRAEL_IMPORT_POLICY,
    getFxRates: async () => TEST_FX,
    fetch: createRecordedSerpApiFetch(),
    cacheScope: "recorded",
  });
}

describe("recorded SerpApi responses", () => {
  const signal = new AbortController().signal;
  let network: jest.SpyInstance;
  beforeEach(() => {
    network = jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network in recorded mode"));
  });
  afterEach(() => network.mockRestore());

  it("answers every recorded query with real products, without touching the network", async () => {
    const amazon = recordedAmazon();
    expect(amazon.cacheScope).toBe("recorded");
    for (const text of RECORDED_AMAZON_QUERIES) {
      const result = await amazon.search(query(text), { signal });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.products.length + (result.value.unavailable?.length ?? 0)).toBeGreaterThan(0);
    }
    expect(network).not.toHaveBeenCalled();
  });

  it("serves page 2 when recorded, matches queries however they're cased, and pages past the end as empty", async () => {
    const amazon = recordedAmazon();
    const first = await amazon.search(query("Sony  WH-1000XM5"), { signal });
    expect(first.ok && first.value.hasMore).toBe(true);
    expect(first.ok && first.value.unavailable?.some((u) => /WH-1000XM5/.test(u.title))).toBe(true);
    const deeper = await amazon.search(query("sony wh-1000xm5"), { signal, storePage: 2 });
    expect(deeper).toEqual({ ok: true, value: { products: [], hasMore: false, unavailable: [] } });
  });

  it("answers an unrecorded query as “no results”, not an outage", async () => {
    const result = await recordedAmazon().search(query("espresso machine"), { signal });
    expect(result).toEqual({ ok: true, value: { products: [], hasMore: false, unavailable: [] } });
  });
});
