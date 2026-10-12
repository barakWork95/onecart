import { z } from "zod";
import type { QueryTranslator, TranslationSource } from "@/domain/search/ports";
import { detectQueryLanguage } from "@/domain/search/query-language";
import {
  DEFAULT_SORT,
  MAX_QUERY_LENGTH,
  normalizeQueryText,
  SEARCH_SORTS,
  type SearchQuery,
} from "@/domain/search/search-query";
import { noopLogger, type Logger } from "@/domain/shared/logger";
import { money } from "@/domain/shared/money";
import { err, ok, type Result } from "@/domain/shared/result";

export const PAGE_SIZE = 20;

/** Next.js `searchParams` shape. */
export type RawSearchParams = Readonly<Record<string, string | string[] | undefined>>;

const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/**
 * URL contract for /search. Bad optional params fall back to defaults
 * (`.catch`) instead of erroring: a hand-edited URL should still search.
 */
const searchParamsSchema = z.object({
  q: z.preprocess(first, z.string().trim().min(1).max(MAX_QUERY_LENGTH)),
  sort: z.preprocess(first, z.enum(SEARCH_SORTS)).catch(DEFAULT_SORT),
  page: z.preprocess(first, z.coerce.number().int().min(1).max(50)).catch(1),
  /** Max landed total in whole shekels. */
  max: z.preprocess(first, z.coerce.number().int().positive().max(1_000_000).optional()).catch(undefined),
  free: z.preprocess(first, z.literal("1").optional()).catch(undefined),
});

export interface SearchRequest {
  readonly text: string;
  readonly sort: SearchQuery["sort"];
  readonly page: number;
  readonly maxTotalShekels?: number;
  readonly freeShippingOnly: boolean;
}

export function parseSearchParams(params: RawSearchParams): Result<SearchRequest, "missing_query"> {
  const parsed = searchParamsSchema.safeParse(params);
  if (!parsed.success) return err("missing_query");
  const { q, sort, page, max, free } = parsed.data;
  return ok({
    text: q,
    sort,
    page,
    freeShippingOnly: free === "1",
    ...(max !== undefined ? { maxTotalShekels: max } : {}),
  });
}

export interface QueryTranslationInfo {
  readonly from: "he";
  /** null when translation failed and we searched with the original text. */
  readonly source: TranslationSource | null;
  /** Some words couldn't be translated and were left out of the search. */
  readonly partial: boolean;
}

export interface BuiltSearchQuery {
  readonly query: SearchQuery;
  /** null for English queries. */
  readonly translation: QueryTranslationInfo | null;
}

/** Detects Hebrew, translates it for the stores, and assembles the domain query. */
export async function buildSearchQuery(
  request: SearchRequest,
  translator: QueryTranslator,
  logger: Logger = noopLogger,
): Promise<BuiltSearchQuery> {
  const language = detectQueryLanguage(request.text);
  let englishText = request.text;
  let translation: QueryTranslationInfo | null = null;

  if (language === "he") {
    try {
      const result = await translator.translateToEnglish(request.text);
      englishText = result.text;
      translation = { from: "he", source: result.source, partial: result.partial ?? false };
    } catch (error) {
      logger.warn("search: translation failed, searching with original text", {
        error: error instanceof Error ? error.message : String(error),
      });
      translation = { from: "he", source: null, partial: false };
    }
  }

  return {
    query: {
      rawText: request.text,
      detectedLanguage: language,
      normalizedText: normalizeQueryText(englishText),
      sort: request.sort,
      filters: {
        ...(request.maxTotalShekels !== undefined
          ? { maxTotal: money(request.maxTotalShekels * 100, "ILS") }
          : {}),
        ...(request.freeShippingOnly ? { freeShippingOnly: true } : {}),
      },
      destination: { country: "IL" },
      page: request.page,
      pageSize: PAGE_SIZE,
    },
    translation,
  };
}
