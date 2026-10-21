import { createInMemoryRedis } from "@/infrastructure/cache/in-memory-redis";
import type { RedisLike } from "@/infrastructure/cache/redis-client";
import { TranslationError } from "@/infrastructure/translation/deepl-translator";
import { createQueryTranslator, translationKey } from "@/infrastructure/translation/query-translator";

const brokenRedis: RedisLike = {
  get: () => Promise.reject(new Error("redis down")),
  mget: () => Promise.reject(new Error("redis down")),
  set: () => Promise.reject(new Error("redis down")),
};

describe("createQueryTranslator", () => {
  it("uses the glossary alone when it knows every word: no DeepL call", async () => {
    const deepl = { translate: jest.fn(async () => "never") };
    const translator = createQueryTranslator({ cache: createInMemoryRedis(), deepl });
    await expect(translator.translateToEnglish("אוזניות אלחוטיות")).resolves.toEqual({
      text: "wireless earbuds",
      source: "glossary",
      partial: false,
    });
    expect(deepl.translate).not.toHaveBeenCalled();
  });

  it("asks DeepL when the glossary falls short, protecting brands and models, and caches 30 days", async () => {
    const cache = createInMemoryRedis();
    const set = jest.spyOn(cache, "set");
    const deepl = { translate: jest.fn(async () => "Steam iron sony wh-1000") };
    const translator = createQueryTranslator({ cache, deepl });

    await expect(translator.translateToEnglish("מגהץ קיטור סוני wh-1000")).resolves.toEqual({
      text: "Steam iron sony wh-1000",
      source: "deepl",
    });
    // The Hebrew brand spelling and the Latin model code reach DeepL as untranslatable markup.
    expect(deepl.translate).toHaveBeenCalledWith("מגהץ קיטור <x>sony</x> <x>wh-1000</x>");
    expect(set).toHaveBeenCalledWith(translationKey("מגהץ קיטור סוני wh-1000"), "Steam iron sony wh-1000", {
      ex: 2_592_000,
    });
    await expect(translator.translateToEnglish("מגהץ קיטור סוני wh-1000")).resolves.toMatchObject({
      source: "cache",
    });
    expect(deepl.translate).toHaveBeenCalledTimes(1);
  });

  it("falls back to the glossary's partial translation when DeepL fails", async () => {
    const logger = { warn: jest.fn() };
    const deepl = { translate: () => Promise.reject(new TranslationError("HTTP_456")) };
    const translator = createQueryTranslator({ cache: createInMemoryRedis(), deepl, logger });

    await expect(translator.translateToEnglish("אוזניות מגניבות")).resolves.toEqual({
      text: "headphones",
      source: "glossary",
      partial: true,
    });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("DeepL failed"), { code: "HTTP_456" });
  });

  it("labels unexpected DeepL errors as UNKNOWN", async () => {
    const logger = { warn: jest.fn() };
    const translator = createQueryTranslator({
      cache: createInMemoryRedis(),
      deepl: { translate: () => Promise.reject(new Error("x")) },
      logger,
    });
    await expect(translator.translateToEnglish("מגהץ")).rejects.toMatchObject({ code: "UNTRANSLATABLE" });
    expect(logger.warn).toHaveBeenCalledWith(expect.any(String), { code: "UNKNOWN" });
  });

  it("uses the glossary when DeepL isn't configured, without caching it", async () => {
    const cache = createInMemoryRedis();
    const set = jest.spyOn(cache, "set");
    const translator = createQueryTranslator({ cache, deepl: null });
    await expect(translator.translateToEnglish("מקלדת מכנית")).resolves.toEqual({
      text: "mechanical keyboard",
      source: "glossary",
      partial: false,
    });
    expect(set).not.toHaveBeenCalled();
  });

  it("returns partial glossary translations and logs the missing words", async () => {
    const logger = { warn: jest.fn() };
    const translator = createQueryTranslator({ cache: createInMemoryRedis(), deepl: null, logger });
    await expect(translator.translateToEnglish("אוזניות מגניבות")).resolves.toEqual({
      text: "headphones",
      source: "glossary",
      partial: true,
    });
    expect(logger.warn).toHaveBeenCalledWith("translate: glossary left words untranslated", {
      words: ["מגניבות"],
    });
  });

  it("rejects when nothing can translate the query", async () => {
    const translator = createQueryTranslator({ cache: createInMemoryRedis(), deepl: null });
    await expect(translator.translateToEnglish("משהו נדיר מאוד")).rejects.toMatchObject({
      code: "UNTRANSLATABLE",
    });
  });

  it("keeps translating when the cache is down", async () => {
    const logger = { warn: jest.fn() };
    const translator = createQueryTranslator({
      cache: brokenRedis,
      deepl: { translate: async () => "iron" },
      logger,
    });
    await expect(translator.translateToEnglish("מגהץ")).resolves.toEqual({ text: "iron", source: "deepl" });
    expect(logger.warn).toHaveBeenCalledWith("translate: cache read failed", expect.anything());
    expect(logger.warn).toHaveBeenCalledWith("translate: cache write failed", expect.anything());
  });

  it("ignores non-string cache entries", async () => {
    const cache = createInMemoryRedis();
    await cache.set(translationKey("אוזניות"), { not: "a string" }, { ex: 60 });
    const translator = createQueryTranslator({ cache, deepl: null });
    await expect(translator.translateToEnglish("אוזניות")).resolves.toMatchObject({ source: "glossary" });
  });

  it("normalizes the cache key", () => {
    expect(translationKey("  אוזניות   אלחוטיות ")).toBe(translationKey("אוזניות אלחוטיות"));
  });
});
