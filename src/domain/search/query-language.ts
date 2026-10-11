import type { QueryLanguage } from "@/domain/search/search-query";

/** Hebrew letters (excluding niqqud/cantillation marks). */
const HEBREW_LETTER = /[א-ת]/;

/** Any Hebrew letter makes the query Hebrew — mixed queries ("אוזניות sony") still need translating. */
export function detectQueryLanguage(text: string): QueryLanguage {
  return HEBREW_LETTER.test(text) ? "he" : "en";
}
