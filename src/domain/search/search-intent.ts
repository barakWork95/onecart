import { sharesModel, tokenizeTitle, type TitleTokens } from "@/domain/matching/title-tokens";
import type { UnifiedProduct } from "@/domain/product/unified-product";

/** What the shopper typed, read the same way as listing titles. */
export interface SearchIntent {
  readonly tokens: TitleTokens;
  /**
   * The query names one product (a model code, or a brand with a series
   * number: "sony wh-1000xm5", "jbl flip 6") rather than a category
   * ("wireless headphones"). Only then do results split into the product,
   * related products and accessories.
   */
  readonly specific: boolean;
  /** The shopper is after an accessory ("wh-1000xm5 case"), so accessories aren't demoted. */
  readonly wantsAccessory: boolean;
}

export function searchIntent(normalizedText: string): SearchIntent {
  const tokens = tokenizeTitle(normalizedText);
  const lineWords = [...tokens.words].filter((w) => !tokens.brandWords.has(w));
  // A model code, or a brand plus what names the line ("airpods pro", "instant pot duo",
  // "jbl flip 6"). A brand plus a category word ("sony headphones") counts too: the
  // shopper still asked for Sony headphones before Sony accessories.
  const specific = tokens.models.size > 0 || (tokens.brands.size > 0 && lineWords.length > 0);
  return { tokens, specific, wantsAccessory: tokens.isAccessory };
}

/** A query word found in a listing; "gen2" also matches a bare "2" ("AirPods Pro 2"). */
function hasWord(tokens: TitleTokens, word: string): boolean {
  if (tokens.words.has(word)) return true;
  const gen = /^gen(\d+)$/.exec(word)?.[1];
  return !!gen && tokens.numbers.has(gen);
}

/** Does a listing name the product the query names? */
export function matchesIntent(intent: SearchIntent, tokens: TitleTokens): boolean {
  if (!intent.specific) return true;
  const q = intent.tokens;
  if (q.models.size > 0) return sharesModel(q.models, tokens.models);
  // Every word naming the line, and no other brand. The brand word itself may be
  // missing: Amazon often drops it ("Duo 6 Qt 7-in-1 …" for an Instant Pot Duo).
  const brandOk = tokens.brands.size === 0 || [...q.brands].some((b) => tokens.brands.has(b));
  const lineWords = [...q.words].filter((w) => !q.brandWords.has(w));
  return brandOk && lineWords.every((w) => hasWord(tokens, w));
}

export interface OfferClass {
  /** Names the product the query names. */
  readonly onIntent: boolean;
  /** An accessory or part, decided with the result set's prices. */
  readonly isAccessory: boolean;
}

/**
 * Below these shares of the product's typical price, a listing naming the
 * product is a part or accessory: "Sony WH-1000XM5 Hinge Swivel Bracket"
 * (₪101) next to the headphones (~₪1,000).
 */
export const ACCESSORY_PRICE_SHARE = { weak: 0.5, none: 0.3 } as const;

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] ?? null) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/**
 * Decides, for one search, which offers are the product the shopper named and
 * which are accessories. Titles alone mislead both ways: "Sony WH-1000XM5 Hard
 * Case … Headphones" is the headphones (sold with a case), while "SONY
 * WH-1000XM5 Type C Charging Port … Flex Ribbon" names no accessory word. The
 * typical price of clean listings of the product settles it: a "case" title
 * at headphone prices is the headphones; anything far cheaper is a part.
 */
export function classifyOffers(
  products: readonly UnifiedProduct[],
  intent: SearchIntent,
  tokensOf: (product: UnifiedProduct) => TitleTokens = (p) => tokenizeTitle(p.title),
): Map<string, OfferClass> {
  const rows = products.map((product) => {
    const tokens = tokensOf(product);
    return { product, tokens, onIntent: matchesIntent(intent, tokens) };
  });

  const typical =
    intent.specific && !intent.wantsAccessory
      ? median(
          rows
            .filter((r) => r.onIntent && r.tokens.accessorySignal === "none")
            .map((r) => r.product.price.item.amountMinor),
        )
      : null;

  const classes = new Map<string, OfferClass>();
  for (const { product, tokens, onIntent } of rows) {
    const signal = tokens.accessorySignal;
    let isAccessory = signal !== "none";
    if (typical !== null && onIntent && signal !== "strong") {
      const share = product.price.item.amountMinor / typical;
      isAccessory = share < ACCESSORY_PRICE_SHARE[signal];
    }
    classes.set(product.id, { onIntent, isAccessory });
  }
  return classes;
}
