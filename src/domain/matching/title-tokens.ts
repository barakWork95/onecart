/**
 * Turns a noisy marketplace title into comparable tokens.
 *
 * "Sony WH-CH720N Wireless Headphones (2024) - NEW!" →
 *   words {sony, whch720n, wireless, headphones}, models {whch720n}, brands {sony}
 *
 * "Instant Pot Duo 7 in 1, 6 Qt Pressure Cooker" →
 *   variants {in1: {7}, qt: {6}}, brands {instantpot}
 *
 * Tuned on recorded Amazon and eBay titles (see `fixtures/recorded-titles.json`).
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
  "for",
  "new",
  "newest",
  "latest",
  "original",
  "genuine",
  "official",
  "authentic",
  "brand",
  "sealed",
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

/** Words that make a title an accessory, spare part or add-on rather than the product itself. */
const ACCESSORY_WORDS = new Set([
  "case",
  "cases",
  "cover",
  "covers",
  "sleeve",
  "skin",
  "protector",
  "replacement",
  "replacements",
  "spare",
  "part",
  "parts",
  "accessory",
  "accessories",
  "strap",
  "band",
  "tips",
  "eartips",
  "cushion",
  "cushions",
  "earpad",
  "earpads",
  "pad",
  "pads",
  "charger",
  "cable",
  "cord",
  "adapter",
  "holder",
  "stand",
  "mount",
  "dock",
  "bracket",
  "hinge",
  "board",
  "connector",
  "socket",
  "film",
  "glass",
  "shell",
  "pouch",
  "bag",
  "sticker",
  "decal",
  "lid",
  "lids",
  "gasket",
  "guide",
  "manual",
]);

/**
 * Accessory words that leave no doubt: nobody sells the product itself as a
 * "replacement part". Weaker words ("case", "stand") also describe products
 * sold *with* one ("Sony WH-1000XM5 Hard Case … Headphones").
 */
const STRONG_ACCESSORY_WORDS = new Set([
  "replacement",
  "replacements",
  "spare",
  "part",
  "parts",
  "repair",
  "guide",
  "manual",
]);

/** Words introducing the product an accessory is made for ("for Sony …", "fits JBL Flip 6"). */
const MADE_FOR_WORDS = new Set(["for", "fits", "fit", "compatible"]);

/**
 * Words after which a title stops describing the item and starts listing what's
 * in the box ("Headphones with Charging Cable" is headphones, not a cable).
 */
const INCLUDES_WORDS = new Set(["with", "w", "includes", "including", "plus", "featuring", "and"]);

/**
 * Known brands, so two listings naming different brands never match. Multi-word
 * brands are written joined, as the tokenizer sees adjacent words. Aliases map a
 * sub-brand to its parent ("Soundcore by Anker").
 */
const BRAND_ALIASES: Readonly<Record<string, string>> = {
  soundcore: "anker",
  beats: "apple",
  airpods: "apple",
  galaxy: "samsung",
  kindle: "amazon",
  echo: "amazon",
  playstation: "sony",
  xbox: "microsoft",
};
const BRANDS = new Set([
  "apple",
  "samsung",
  "sony",
  "bose",
  "jbl",
  "anker",
  "skullcandy",
  "sennheiser",
  "audiotechnica",
  "jabra",
  "shokz",
  "razer",
  "logitech",
  "hyperx",
  "steelseries",
  "corsair",
  "lg",
  "philips",
  "panasonic",
  "xiaomi",
  "huawei",
  "oneplus",
  "google",
  "amazon",
  "microsoft",
  "nintendo",
  "instantpot",
  "ninja",
  "cosori",
  "keurig",
  "nespresso",
  "breville",
  "kitchenaid",
  "cuisinart",
  "dyson",
  "shark",
  "roborock",
  "irobot",
  "garmin",
  "fitbit",
  "lenovo",
  "asus",
  "acer",
  "dell",
  "hp",
  "canon",
  "nikon",
  "gopro",
  "dji",
  "belkin",
  "ugreen",
  "baseus",
  "spigen",
  "otterbox",
  "midea",
  "lodge",
  "pyrex",
  "oxo",
  "tefal",
  "cmf",
  "keychron",
  "dekoni",
]);

/** Unit spellings → canonical unit. Only units that define a product variant are compared. */
const VARIANT_UNITS: Readonly<Record<string, string>> = {
  qt: "qt",
  qts: "qt",
  quart: "qt",
  quarts: "qt",
  l: "l",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  ml: "ml",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  gb: "gb",
  tb: "tb",
  inch: "in",
  inches: "in",
  pc: "pc",
  pcs: "pc",
  piece: "pc",
  pieces: "pc",
  pk: "pk",
  pack: "pk",
  count: "pk",
  ct: "pk",
  in1: "in1",
  mm: "mm",
};

/**
 * Units that describe a spec sellers word differently ("50H playtime", "35W",
 * "1200mAh"). They're kept as words for similarity but never decide identity.
 */
const SPEC_UNITS = new Set([
  "h",
  "hr",
  "hrs",
  "hour",
  "hours",
  "db",
  "w",
  "watt",
  "watts",
  "v",
  "volt",
  "volts",
  "mah",
  "hz",
  "khz",
  "cm",
  "m",
  "ft",
  "feet",
  "kg",
  "g",
  "mb",
  "k",
  "p",
  "x",
  "s",
  "min",
  "mins",
]);

/**
 * Listing qualifiers that make an offer a different deal even for the same
 * model: a refurbished unit or a bundle isn't the new, bare item.
 */
const QUALIFIERS: Readonly<Record<string, string>> = {
  renewed: "refurbished",
  refurbished: "refurbished",
  refurb: "refurbished",
  used: "used",
  preowned: "used",
  openbox: "used",
  bundle: "bundle",
  kit: "bundle",
};

/** Alphanumeric tokens that are specs, not model numbers: IP67, USB3, 5G, 4K, 2nd. */
const SPEC_CODE = /^(ipx?\d+|usb\w*|bt\d+|wifi\d+|[2-6]g|\d+(st|nd|rd|th)|tws\d*)$/;

export interface TitleTokens {
  /** All meaningful tokens, for similarity. */
  readonly words: ReadonlySet<string>;
  /** Letter-and-digit model codes: "whch720n", "p3", "1000xm5". */
  readonly models: ReadonlySet<string>;
  /** Bare numbers, usually a series or version ("Flip 6", "AirPods Pro 2"). */
  readonly numbers: ReadonlySet<string>;
  /** Variant-defining quantities per unit: qt → {6}, gb → {128}, pk → {12}, gen → {2}. */
  readonly variants: ReadonlyMap<string, ReadonlySet<string>>;
  /** Canonical brand names found in the title. */
  readonly brands: ReadonlySet<string>;
  /** Condition or packaging that changes the deal: "refurbished", "used", "bundle". */
  readonly qualifiers: ReadonlySet<string>;
  /**
   * How sure the title is about being an accessory, spare part or guide:
   * `strong` ("Earpads for Sony …", "Replacement hinge"), `weak` (an accessory
   * word such as "case" that products sold with a case share), or `none`.
   * Search results can settle `weak` by price; see `classifyOffers`.
   */
  readonly accessorySignal: AccessorySignal;
  /** Read without context: any accessory signal. */
  readonly isAccessory: boolean;
}

export type AccessorySignal = "none" | "weak" | "strong";

/** Rewrites multi-word quantity phrases into single tokens before splitting. */
function normalizePhrases(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      // "7-in-1", "7 in 1", "7in1" → "7in1"
      .replace(/\b(\d+)\s*-?\s*in\s*-?\s*(?:1|one)\b/g, " $1in1 ")
      // "2nd gen", "2nd generation", "gen 2", "generation 2" → "gen2"
      .replace(/\b(\d+)(?:st|nd|rd|th)?\s*-?\s*gen(?:eration)?\b/g, " gen$1 ")
      .replace(/\bgen(?:eration)?\s*-?\s*(\d+)\b/g, " gen$1 ")
      // "pack of 6", "set of 6" → "6pk" / "6pc"
      .replace(/\bpack\s+of\s+(\d+)\b/g, " $1pk ")
      .replace(/\bset\s+of\s+(\d+)\b/g, " $1pc ")
      .replace(/\b(pre)\s*-?\s*(owned)\b|\b(open)\s*-?\s*(box)\b/g, " $1$2$3$4 ")
      // Join hyphen/dot-separated codes: "wh-ch720n" → "whch720n", "5.7" → "57". Slashes separate
      // ("Flip 7/6/5" lists three models).
      .replace(/([a-z0-9])[-.]+(?=[a-z0-9])/g, "$1")
      // "6 qt", "128 gb", "10 pcs" → "6qt", "128gb", "10pcs"
      .replace(/\b(\d+)\s+([a-z]{1,7})\b/g, (match: string, n: string, unit: string) =>
        unit in VARIANT_UNITS || SPEC_UNITS.has(unit) ? `${n}${unit}` : match,
      )
  );
}

function addTo(map: Map<string, Set<string>>, key: string, value: string): void {
  const set = map.get(key) ?? new Set<string>();
  set.add(value);
  map.set(key, set);
}

function brandOf(token: string): string | null {
  const brand = BRAND_ALIASES[token] ?? token;
  return BRANDS.has(brand) ? brand : null;
}

export function tokenizeTitle(title: string): TitleTokens {
  const raw = normalizePhrases(title)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    // "Flip6" → "flip", "6" (a word glued to a series number), but not "p3" or "xm5".
    .flatMap((t) => (t.startsWith("gen") ? null : /^([a-z]{3,})(\d{1,2})$/.exec(t)?.slice(1)) ?? [t]);

  const words = new Set<string>();
  const models = new Set<string>();
  const numbers = new Set<string>();
  const variants = new Map<string, Set<string>>();
  const brands = new Set<string>();
  const qualifiers = new Set<string>();
  let weak = false;
  let strong = false;
  let inHead = true;
  const isModelLike = (t: string | undefined) => !!t && /\d/.test(t) && /[a-z]/.test(t);

  raw.forEach((token, i) => {
    const pair = i + 1 < raw.length ? brandOf(`${token}${raw[i + 1]}`) : null;
    const brand = pair ?? brandOf(token);
    if (brand) brands.add(brand);

    // An accessory word only counts in the item's own description, before "with …".
    if (INCLUDES_WORDS.has(token) && i > 0) inHead = false;
    if (inHead && STRONG_ACCESSORY_WORDS.has(token)) strong = true;
    else if (inHead && ACCESSORY_WORDS.has(token)) weak = true;
    // "Earpads for Sony WH-1000XM5", "fits JBL Flip 6", "For WH-1000XM5": made for another product.
    if (MADE_FOR_WORDS.has(token)) {
      const next = raw[i + 1];
      if ((next && brandOf(next)) || isModelLike(next)) strong = true;
    }

    const qualifier = QUALIFIERS[token];
    if (qualifier) qualifiers.add(qualifier);

    if (STOPWORDS.has(token) || YEAR.test(token)) return;
    words.add(token);

    const gen = /^gen(\d+)$/.exec(token);
    const quantity = /^(\d+)([a-z]+\d?)$/.exec(token);
    if (gen?.[1]) addTo(variants, "gen", gen[1]);
    else if (/^\d+$/.test(token)) numbers.add(token);
    else if (quantity?.[1] && quantity[2] && quantity[2] in VARIANT_UNITS)
      addTo(variants, VARIANT_UNITS[quantity[2]] ?? quantity[2], quantity[1]);
    else if (quantity?.[2] && SPEC_UNITS.has(quantity[2])) return;
    // "2tier", "3speed", "4slice": a count of something, not a model code.
    else if (quantity?.[1] && quantity[2] && /^[a-z]{3,}$/.test(quantity[2]))
      addTo(variants, quantity[2], quantity[1]);
    else if (/\d/.test(token) && /[a-z]/.test(token) && !SPEC_CODE.test(token)) models.add(token);
  });

  const accessorySignal: AccessorySignal = strong ? "strong" : weak ? "weak" : "none";
  return {
    words,
    models,
    numbers,
    variants,
    brands,
    qualifiers,
    accessorySignal,
    isAccessory: accessorySignal !== "none",
  };
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

/**
 * Share of the shorter title's words found in the longer one, in [0, 1].
 * Amazon titles run three times longer than eBay's for the same item, which
 * drags Dice down; containment asks "is the short title inside the long one?".
 */
export function containment(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  const smaller = Math.min(a.size, b.size);
  return smaller === 0 ? 0 : intersectionSize(a, b) / smaller;
}

export function sharesAny(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return intersectionSize(a, b) > 0;
}

/**
 * Model codes agree when they're equal, when one ends with the other
 * ("wh1000xm5" and "1000xm5"; the shorter needs four characters so "m5" can't
 * ride on it), or when the longer adds a colour suffix of up to three letters
 * ("wh1000xm5sa", "wh1000xm5bnt": Sony's silver and midnight blue).
 */
function sameModel(x: string, y: string): boolean {
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short === long) return true;
  if (short.length >= 4 && long.endsWith(short)) return true;
  return short.length >= 6 && long.startsWith(short) && /^[a-z]{1,3}$/.test(long.slice(short.length));
}

export function sharesModel(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const x of a) for (const y of b) if (sameModel(x, y)) return true;
  return false;
}
