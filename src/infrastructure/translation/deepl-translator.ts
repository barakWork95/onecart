import { z } from "zod";

const responseSchema = z.object({
  translations: z.array(z.object({ text: z.string() })).min(1),
});

export class TranslationError extends Error {
  constructor(
    readonly code: string,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "TranslationError";
  }
}

export interface DeepLConfig {
  readonly apiKey: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

/** DeepL free-plan keys end in ":fx" and must use the free endpoint. */
export function deeplBaseUrl(apiKey: string): string {
  return apiKey.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
}

/** Hebrew → US English via DeepL `/v2/translate`. Throws `TranslationError` on any failure. */
export function createDeepLTranslator(config: DeepLConfig): { translate(text: string): Promise<string> } {
  const doFetch = config.fetch ?? fetch;
  return {
    async translate(text) {
      let response: Response;
      try {
        response = await doFetch(`${deeplBaseUrl(config.apiKey)}/v2/translate`, {
          method: "POST",
          headers: { Authorization: `DeepL-Auth-Key ${config.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text: [text], source_lang: "HE", target_lang: "EN-US" }),
          signal: AbortSignal.timeout(config.timeoutMs ?? 2_000),
        });
      } catch (error) {
        throw new TranslationError("NETWORK", error instanceof Error ? error.message : String(error));
      }
      // 403 bad key, 429 rate limit, 456 quota exhausted — all mean "fall back".
      if (!response.ok) throw new TranslationError(`HTTP_${response.status}`);

      const parsed = responseSchema.safeParse(await response.json().catch(() => null));
      const translated = parsed.success ? parsed.data.translations[0]?.text.trim() : undefined;
      if (!translated) throw new TranslationError("PARSE_ERROR");
      return translated;
    },
  };
}
