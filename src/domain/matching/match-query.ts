/** Words that open marketplace titles without describing the item ("NEW", "1pcs", "Brand New Sealed"). */
const LEADING_FILLER =
  /^(?:(?:brand\s+)?new!?|sealed|original|genuine|authentic|official|hot|sale|\d+\s*pcs?)\s+/i;

/** Where a title stops naming the item and starts listing features, colours or box contents. */
const TAIL_START = /\s+(?:-|–|—|\|)\s+|[,|:;]|\s+(?:with|includes|including|for)\s+|\s+w\//i;

const MAX_WORDS = 8;

/**
 * A short search query that finds the same item at another store: the head of
 * the title, before the feature list, capped at eight words.
 *
 * "Sony WH-CH520 Wireless Bluetooth On-Ear Headphones with Microphone, Up to 50 Hours…"
 *   → "Sony WH-CH520 Wireless Bluetooth On-Ear Headphones"
 */
export function matchSearchText(title: string): string {
  // Brackets often hold identity ("(2nd Generation)"), so keep their words.
  let text = title
    .replace(/[()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (let previous = ""; previous !== text;) {
    previous = text;
    text = text.replace(LEADING_FILLER, "");
  }
  const head = text.split(TAIL_START)[0]?.trim() ?? "";
  const words = (head.length >= 3 ? head : text).split(" ").filter(Boolean);
  return words.slice(0, MAX_WORDS).join(" ");
}
