import type { QueryTranslator, Translation } from "@/domain/search/ports";
import { normalizeQueryText } from "@/domain/search/search-query";
import { noopLogger, type Logger } from "@/domain/shared/logger";
import type { RedisLike } from "@/infrastructure/cache/redis-client";
import { TranslationError } from "@/infrastructure/translation/deepl-translator";
import {
  protectForMachineTranslation,
  translateWithGlossary,
} from "@/infrastructure/translation/hebrew-glossary";

/** Translations of the same phrase don't change; keep them a month. */
const TRANSLATION_TTL_SECONDS = 60 * 60 * 24 * 30;

export const translationKey = (text: string) => `translate:v1:he-en:${normalizeQueryText(text)}`;

export interface QueryTranslatorDeps {
  readonly cache: RedisLike;
  /** null when DEEPL_API_KEY isn't configured. */
  readonly deepl: { translate(text: string): Promise<string> } | null;
  readonly logger?: Logger;
}

/**
 * Chain: cache → glossary (when it knows every word: free, instant, predictable) →
 * DeepL (brand names and model codes protected, see `protectForMachineTranslation`;
 * cached) → the glossary's partial translation (`partial`), which still beats sending
 * Hebrew to English-language stores.
 */
export function createQueryTranslator(deps: QueryTranslatorDeps): QueryTranslator {
  const logger = deps.logger ?? noopLogger;

  async function fromCache(key: string): Promise<string | null> {
    try {
      const value = await deps.cache.get<unknown>(key);
      return typeof value === "string" && value.length > 0 ? value : null;
    } catch (error) {
      logger.warn("translate: cache read failed", { error: String(error) });
      return null;
    }
  }

  async function remember(key: string, text: string): Promise<void> {
    try {
      await deps.cache.set(key, text, { ex: TRANSLATION_TTL_SECONDS });
    } catch (error) {
      logger.warn("translate: cache write failed", { error: String(error) });
    }
  }

  return {
    async translateToEnglish(text): Promise<Translation> {
      const key = translationKey(text);
      const cached = await fromCache(key);
      if (cached) return { text: cached, source: "cache" };

      const glossary = translateWithGlossary(text);
      if (glossary && glossary.untranslated.length === 0) {
        return { text: glossary.text, source: "glossary", partial: false };
      }

      if (deps.deepl) {
        try {
          const translated = await deps.deepl.translate(protectForMachineTranslation(text));
          await remember(key, translated);
          return { text: translated, source: "deepl" };
        } catch (error) {
          logger.warn("translate: DeepL failed, using the glossary", {
            code: error instanceof TranslationError ? error.code : "UNKNOWN",
          });
        }
      }

      if (glossary) {
        if (glossary.untranslated.length > 0) {
          // Grow the glossary from these (or configure DEEPL_API_KEY).
          logger.warn("translate: glossary left words untranslated", { words: glossary.untranslated });
        }
        return { text: glossary.text, source: "glossary", partial: glossary.untranslated.length > 0 };
      }
      throw new TranslationError("UNTRANSLATABLE");
    },
  };
}
