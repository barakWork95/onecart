import {
  createDeepLTranslator,
  deeplBaseUrl,
  TranslationError,
} from "@/infrastructure/translation/deepl-translator";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("deeplBaseUrl", () => {
  it("routes free-plan keys to the free endpoint", () => {
    expect(deeplBaseUrl("abc:fx")).toBe("https://api-free.deepl.com");
    expect(deeplBaseUrl("abc")).toBe("https://api.deepl.com");
  });
});

describe("createDeepLTranslator", () => {
  it("sends a Hebrew → US English request and returns the trimmed text", async () => {
    const fetchMock = jest.fn(async () =>
      json({ translations: [{ detected_source_language: "HE", text: " wireless earbuds " }] }),
    );
    const translator = createDeepLTranslator({ apiKey: "key:fx", fetch: fetchMock });

    await expect(translator.translate("אוזניות אלחוטיות")).resolves.toBe("wireless earbuds");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api-free.deepl.com/v2/translate",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "DeepL-Auth-Key key:fx", "Content-Type": "application/json" },
        body: JSON.stringify({
          text: ["אוזניות אלחוטיות"],
          source_lang: "HE",
          target_lang: "EN-US",
          tag_handling: "xml",
          ignore_tags: ["x"],
        }),
      }),
    );
  });

  it("leaves <x> markup alone and returns plain text: brands, models and entities intact", async () => {
    const translator = createDeepLTranslator({
      apiKey: "k",
      fetch: async () =>
        json({ translations: [{ text: "Steam iron <x>sony</x>  <x>wh-1000</x> &amp; co" }] }),
    });
    await expect(translator.translate("מגהץ קיטור <x>sony</x> <x>wh-1000</x> &amp; co")).resolves.toBe(
      "Steam iron sony wh-1000 & co",
    );
  });

  it.each([403, 429, 456, 500])("throws on HTTP %i", async (status) => {
    const translator = createDeepLTranslator({
      apiKey: "k",
      fetch: async () => json({ message: "x" }, status),
    });
    await expect(translator.translate("x")).rejects.toMatchObject({ code: `HTTP_${status}` });
  });

  it("throws PARSE_ERROR for unexpected bodies", async () => {
    for (const body of [{ translations: [] }, { nope: true }, { translations: [{ text: "  " }] }]) {
      const translator = createDeepLTranslator({ apiKey: "k", fetch: async () => json(body) });
      await expect(translator.translate("x")).rejects.toMatchObject({ code: "PARSE_ERROR" });
    }
  });

  it("throws PARSE_ERROR for non-JSON bodies", async () => {
    const translator = createDeepLTranslator({ apiKey: "k", fetch: async () => new Response("<html>") });
    await expect(translator.translate("x")).rejects.toMatchObject({ code: "PARSE_ERROR" });
  });

  it("wraps network failures", async () => {
    const translator = createDeepLTranslator({
      apiKey: "k",
      fetch: () => Promise.reject(new TypeError("fetch failed")),
    });
    await expect(translator.translate("x")).rejects.toEqual(new TranslationError("NETWORK", "fetch failed"));
    const other = createDeepLTranslator({ apiKey: "k", fetch: () => Promise.reject("socket") });
    await expect(other.translate("x")).rejects.toMatchObject({ code: "NETWORK", message: "NETWORK: socket" });
  });
});
