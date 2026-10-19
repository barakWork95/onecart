import { buildSearchQuery, parseSearchParams, PAGE_SIZE } from "@/application/search/build-search-query";
import type { QueryTranslator } from "@/domain/search/ports";
import { money } from "@/domain/shared/money";

describe("parseSearchParams", () => {
  it("sanitizes the query before anything uses it, and refuses one with nothing left", () => {
    const parsed = parseSearchParams({ q: "<b>jbl</b>\u0000 flip 6" });
    expect(parsed.ok && parsed.value.text).toBe("jbl flip 6");
    expect(parseSearchParams({ q: "<script></script>" })).toEqual({ ok: false, error: "missing_query" });
    const long = parseSearchParams({ q: "a".repeat(500) });
    expect(long.ok && long.value.text).toHaveLength(100);
  });

  it("parses a full, valid URL", () => {
    expect(
      parseSearchParams({ q: "  earbuds ", sort: "delivery_fastest", page: "3", max: "250", free: "1" }),
    ).toEqual({
      ok: true,
      value: {
        text: "earbuds",
        sort: "delivery_fastest",
        page: 3,
        maxTotalShekels: 250,
        freeShippingOnly: true,
      },
    });
  });

  it("applies defaults for missing optional params", () => {
    expect(parseSearchParams({ q: "earbuds" })).toEqual({
      ok: true,
      value: { text: "earbuds", sort: "relevance", page: 1, freeShippingOnly: false },
    });
  });

  it("falls back to defaults for invalid optional params instead of failing", () => {
    const result = parseSearchParams({ q: "earbuds", sort: "cheapest", page: "-2", max: "abc", free: "yes" });
    expect(result).toEqual({
      ok: true,
      value: { text: "earbuds", sort: "relevance", page: 1, freeShippingOnly: false },
    });
  });

  it("accepts an explicit relevance sort", () => {
    const result = parseSearchParams({ q: "earbuds", sort: "relevance" });
    expect(result.ok && result.value.sort).toBe("relevance");
  });

  it("takes the first value of repeated params", () => {
    const result = parseSearchParams({ q: ["first", "second"] });
    expect(result.ok && result.value.text).toBe("first");
  });

  it.each([{}, { q: "" }, { q: "   " }, { q: "<br/>\u200b" }])(
    "rejects a missing or invalid query %#",
    (params) => {
      expect(parseSearchParams(params)).toEqual({ ok: false, error: "missing_query" });
    },
  );
});

const translator = (impl: QueryTranslator["translateToEnglish"]): QueryTranslator => ({
  translateToEnglish: impl,
});

describe("buildSearchQuery", () => {
  const base = { sort: "landed_price_asc" as const, page: 1, freeShippingOnly: false };

  it("passes English queries through without translating", async () => {
    const translate = jest.fn();
    const built = await buildSearchQuery({ ...base, text: "Wireless  Earbuds" }, translator(translate));
    expect(translate).not.toHaveBeenCalled();
    expect(built).toEqual({
      query: {
        rawText: "Wireless  Earbuds",
        detectedLanguage: "en",
        normalizedText: "wireless earbuds",
        sort: "landed_price_asc",
        filters: {},
        destination: { country: "IL" },
        page: 1,
        pageSize: PAGE_SIZE,
      },
      translation: null,
    });
  });

  it("translates Hebrew queries and keeps the original text for display", async () => {
    const built = await buildSearchQuery(
      { ...base, text: "אוזניות אלחוטיות" },
      translator(async () => ({ text: "Wireless Earbuds", source: "deepl" })),
    );
    expect(built.query).toMatchObject({
      rawText: "אוזניות אלחוטיות",
      detectedLanguage: "he",
      normalizedText: "wireless earbuds",
    });
    expect(built.translation).toEqual({ from: "he", source: "deepl", partial: false });
  });

  it("passes through a partial glossary translation", async () => {
    const built = await buildSearchQuery(
      { ...base, text: "אוזניות סוני מגניבות" },
      translator(async () => ({ text: "headphones sony", source: "glossary", partial: true })),
    );
    expect(built.query.normalizedText).toBe("headphones sony");
    expect(built.translation).toEqual({ from: "he", source: "glossary", partial: true });
  });

  it("falls back to the original text and flags it when translation fails", async () => {
    const logger = { warn: jest.fn() };
    const built = await buildSearchQuery(
      { ...base, text: "משהו נדיר" },
      translator(() => Promise.reject(new Error("UNTRANSLATABLE"))),
      logger,
    );
    expect(built.query.normalizedText).toBe("משהו נדיר");
    expect(built.translation).toEqual({ from: "he", source: null, partial: false });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("translation failed"), {
      error: "UNTRANSLATABLE",
    });
  });

  it("logs non-Error translation failures", async () => {
    const logger = { warn: jest.fn() };
    await buildSearchQuery(
      { ...base, text: "משהו" },
      translator(() => Promise.reject("down")),
      logger,
    );
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), { error: "down" });
  });

  it("maps URL filters to domain filters in agorot", async () => {
    const built = await buildSearchQuery(
      { ...base, text: "earbuds", maxTotalShekels: 150, freeShippingOnly: true },
      translator(jest.fn()),
    );
    expect(built.query.filters).toEqual({ maxTotal: money(150_00, "ILS"), freeShippingOnly: true });
  });
});
