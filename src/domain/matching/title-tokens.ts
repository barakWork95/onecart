/**
 * Turns a noisy marketplace title into comparable tokens.
 *
 * "Sony WH-CH720N Wireless Headphones (2024) - NEW!" →
 *   words: {sony, whch720n, wireless, headphones}, identifiers: {whch720n}
 */

/** Words that carry no product identity (marketing filler, connectors). */
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "of",
  "in",
  "on",
  "to",
  "with",
  "w",
  "by",
  "from",
  "at",
  "or",
  "is",
  "new",
  "newest",
  "latest",
  "original",
  "genuine",
  "official",
  "authentic",
  "brand",
  "hot",
  "sale",
  "deal",
  "best",
  "top",
  "quality",
  "high",
  "premium",
  "upgraded",
  "version",
  "free",
  "shipping",
  "fast",
  "delivery",
  "global",
  "edition",
  "model",
  "style",
]);

/** Model years are noise for matching ("Life P3 2024" is the same earbuds as "Life P3"). */
const YEAR = /^(19|20)\d{2}$/;

/** Words signalling an accessory *for* a product rather than the product itself. */
const ACCESSORY_WORDS = new Set([
  "case",
  "cover",
  "sleeve",
  "skin",
  "protector",
  "replacement",
  "strap",
  "band",
  "tips",
  "eartips",
  "cushion",
  "cushions",
  "earpads",
  "pads",
  "charger",
  "cable",
  "adapter",
  "holder",
  "stand",
  "mount",
  "dock",
  "film",
  "glass",
  "shell",
  "pouch",
  "bag",
  "sticker",
  "decal",
]);

export interface TitleTokens {
  /** All meaningful tokens. */
  readonly words: ReadonlySet<string>;
  /** Tokens containing a digit — model numbers, capacities, sizes ("p3", "128gb", "15"). */
  readonly identifiers: ReadonlySet<string>;
  /** Accessory words present in the title. */
  readonly accessoryWords: ReadonlySet<string>;
}

export function tokenizeTitle(title: string): TitleTokens {
  const normalized = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Join hyphen/dot/slash-separated model numbers: "wh-ch720n" → "whch720n", "1.0" stays "10".
    .replace(/([a-z0-9])[-./]+(?=[a-z0-9])/g, "$1");

  const words = new Set<string>();
  const identifiers = new Set<string>();
  const accessoryWords = new Set<string>();

  for (const token of normalized.split(/[^a-z0-9]+/)) {
    if (!token || STOPWORDS.has(token) || YEAR.test(token)) continue;
    words.add(token);
    if (/\d/.test(token)) identifiers.add(token);
    if (ACCESSORY_WORDS.has(token)) accessoryWords.add(token);
  }
  return { words, identifiers, accessoryWords };
}

function intersectionSize(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let count = 0;
  for (const item of a) if (b.has(item)) count++;
  return count;
}

/** Sørensen–Dice coefficient in [0, 1]. */
export function diceSimilarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  return (2 * intersectionSize(a, b)) / (a.size + b.size);
}

export function sharesAny(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return intersectionSize(a, b) > 0;
}
