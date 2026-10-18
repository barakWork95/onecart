/**
 * Quantities and colours a listing states, normalized so different phrasings
 * agree ("5M", "500cm", "16.4ft" are all 5,000 mm). For commodity items with
 * no brand or model code, these are the hard evidence two listings differ:
 * a 5 m and a 10 m LED strip are different products however alike they look.
 */
export const ATTRIBUTE_KINDS = [
  "length_mm",
  "capacity_mah",
  "volume_ml",
  "power_w",
  "voltage_v",
  "current_a",
  "weight_g",
  "pack",
  "color",
] as const;
export type AttributeKind = (typeof ATTRIBUTE_KINDS)[number];
export type ItemAttributes = ReadonlyMap<AttributeKind, ReadonlySet<string>>;

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const LENGTH_TO_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  meter: 1000,
  meters: 1000,
  metre: 1000,
  metres: 1000,
  ft: 304.8,
  feet: 304.8,
  inch: 25.4,
  inches: 25.4,
};
/** Imperial units only approximate a metric size ("16.4ft" is sold as 5 m). */
const IMPERIAL = new Set(["ft", "feet", "inch", "inches"]);
const COLORS: Readonly<Record<string, string>> = {
  black: "black",
  white: "white",
  red: "red",
  blue: "blue",
  green: "green",
  pink: "pink",
  gray: "gray",
  grey: "gray",
  silver: "silver",
  gold: "gold",
  purple: "purple",
  yellow: "yellow",
  orange: "orange",
  brown: "brown",
  beige: "beige",
};

/** "22.5", "5000", "0.1": no trailing zeros, no float noise. */
const format = (n: number) => String(Math.round(n * 1000) / 1000);
/** Two significant figures: what an imperial size rounds to in metric. */
const twoSignificant = (n: number) => {
  if (n === 0) return 0;
  const scale = 10 ** (Math.floor(Math.log10(Math.abs(n))) - 1);
  return Math.round(n / scale) * scale;
};

function lengthMm(value: number, unit: string): number {
  const mm = value * (LENGTH_TO_MM[unit] ?? 1);
  return IMPERIAL.has(unit) ? twoSignificant(mm) : mm;
}

export function extractAttributes(title: string): ItemAttributes {
  const text = title.toLowerCase().replace(/×/g, "x");
  const out = new Map<AttributeKind, Set<string>>();
  const add = (kind: AttributeKind, value: string) => out.set(kind, (out.get(kind) ?? new Set()).add(value));
  const each = (pattern: string, onMatch: (m: RegExpExecArray) => void) => {
    for (const m of text.matchAll(new RegExp(pattern, "g"))) onMatch(m);
  };
  const LEN_UNITS = "mm|cm|m|meters?|metres?|ft|feet|inch(?:es)?";

  // "80 x 30 cm", "80x30cm": both sides in the stated unit.
  each(String.raw`${NUM}\s*x\s*${NUM}\s*(${LEN_UNITS})(?![a-z])`, (m) => {
    add("length_mm", format(lengthMm(Number(m[1]), m[3]!)));
    add("length_mm", format(lengthMm(Number(m[2]), m[3]!)));
  });
  each(String.raw`(?<![\w.])${NUM}\s*(${LEN_UNITS})(?![a-z])`, (m) =>
    add("length_mm", format(lengthMm(Number(m[1]), m[2]!))),
  );
  each(String.raw`(?<![\w.])(\d{3,6})\s*mah\b`, (m) => add("capacity_mah", format(Number(m[1]))));
  each(String.raw`(?<![\w.])${NUM}\s*(ml|l|liters?|litres?)(?![a-z])`, (m) =>
    add("volume_ml", format(Number(m[1]) * (m[2] === "ml" ? 1 : 1000))),
  );
  each(String.raw`(?<![\w.])${NUM}\s*w(?![a-z])`, (m) => add("power_w", format(Number(m[1]))));
  each(String.raw`(?<![\w.])${NUM}\s*v(?![a-z])`, (m) => add("voltage_v", format(Number(m[1]))));
  // "3A" only when glued: "3 a" is usually prose.
  each(String.raw`(?<![\w.])${NUM}a(?![a-z])`, (m) => add("current_a", format(Number(m[1]))));
  each(String.raw`(?<![\w.])${NUM}\s*(kg|g)(?![a-z])`, (m) => {
    const grams = Number(m[1]) * (m[2] === "kg" ? 1000 : 1);
    // "5G" is a network, not five grams: whole grams under 10 are left out.
    if (m[2] === "g" && Number.isInteger(grams) && grams < 10) return;
    add("weight_g", format(grams));
  });
  each(String.raw`(?<![\w.])(\d+)\s*-?\s*(pcs|pc|pieces?|pack|pk)(?![a-z])`, (m) => add("pack", m[1]!));
  each(String.raw`\b(?:set|pack) of (\d+)\b`, (m) => add("pack", m[1]!));
  for (const word of text.split(/[^a-z]+/)) {
    const color = COLORS[word];
    if (color) add("color", color);
  }
  return out;
}

/**
 * The first attribute both listings state with no value in common: proof
 * they're different items. One side silent is no conflict; a listing offering
 * several colours conflicts only if none matches.
 */
export function attributeConflict(a: ItemAttributes, b: ItemAttributes): AttributeKind | null {
  for (const kind of ATTRIBUTE_KINDS) {
    const x = a.get(kind);
    const y = b.get(kind);
    if (x && y && ![...x].some((v) => y.has(v))) return kind;
  }
  return null;
}
