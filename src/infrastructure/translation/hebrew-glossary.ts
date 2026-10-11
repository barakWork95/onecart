/**
 * Offline fallback for common shopping queries, used when DeepL is not
 * configured or unavailable. Phrases are matched before single words because
 * Hebrew puts adjectives after nouns ("אוזניות אלחוטיות" = "wireless earbuds").
 * Extend it from real zero-result Hebrew queries, not guesses.
 */
export const HEBREW_PHRASES: Readonly<Record<string, string>> = {
  "אוזניות אלחוטיות": "wireless earbuds",
  "אוזניות קשת": "over-ear headphones",
  "אוזניות ביטול רעשים": "noise cancelling headphones",
  "מקלדת מכנית": "mechanical keyboard",
  "עכבר אלחוטי": "wireless mouse",
  "כרית זיכרון": "memory foam pillow",
  "מחזיק טלפון לרכב": "car phone mount",
  "מחזיק לטלפון לרכב": "car phone mount",
  "מטען אלחוטי": "wireless charger",
  "סוללה ניידת": "power bank",
  "מגן מסך": "screen protector",
  "כיסוי לטלפון": "phone case",
  "שעון חכם": "smartwatch",
  "רמקול בלוטות": "bluetooth speaker",
  "שואב אבק רובוטי": "robot vacuum",
  "שואב אבק": "vacuum cleaner",
  "מחשב נייד": "laptop",
  "משקפי שמש": "sunglasses",
  "בקבוק מים": "water bottle",
  "מברשת שיניים חשמלית": "electric toothbrush",
  "מייבש שיער": "hair dryer",
  "נעלי ריצה": "running shoes",
  "תיק גב": "backpack",
};

export const HEBREW_WORDS: Readonly<Record<string, string>> = {
  אוזניות: "earbuds",
  מקלדת: "keyboard",
  עכבר: "mouse",
  כרית: "pillow",
  מטען: "charger",
  כבל: "cable",
  רמקול: "speaker",
  מצלמה: "camera",
  טאבלט: "tablet",
  מסך: "monitor",
  מנורה: "lamp",
  פנס: "flashlight",
  שעון: "watch",
  נעליים: "shoes",
  צעצוע: "toy",
  צעצועים: "toys",
  אלחוטי: "wireless",
  אלחוטית: "wireless",
  אלחוטיות: "wireless",
  חכם: "smart",
  חכמה: "smart",
  ילדים: "kids",
  גברים: "men",
  נשים: "women",
  שחור: "black",
  שחורה: "black",
  לבן: "white",
  לבנה: "white",
};

/** Strips niqqud and Hebrew/ASCII apostrophes and quotes so "בלוטות'" matches "בלוטות". */
function normalizeHebrew(text: string): string {
  return text
    .replace(/[֑-ׇ]/g, "")
    .replace(/[׳״'"`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const PHRASES_LONGEST_FIRST = Object.entries(HEBREW_PHRASES)
  .map(([he, en]) => [normalizeHebrew(he).split(" "), en] as const)
  .sort((a, b) => b[0].length - a[0].length);

/**
 * Returns the English translation, or null if any Hebrew word is unknown —
 * a half-translated query would return misleading results. Latin words and
 * numbers pass through ("אוזניות sony" → "earbuds sony").
 */
export function translateWithGlossary(text: string): string | null {
  const words = normalizeHebrew(text).split(" ").filter(Boolean);
  const out: string[] = [];

  for (let i = 0; i < words.length;) {
    const phrase = PHRASES_LONGEST_FIRST.find(([parts]) => parts.every((part, j) => words[i + j] === part));
    if (phrase) {
      out.push(phrase[1]);
      i += phrase[0].length;
      continue;
    }
    const word = words[i] ?? "";
    if (/[א-ת]/.test(word)) {
      const translated = HEBREW_WORDS[word];
      if (!translated) return null;
      out.push(translated);
    } else {
      out.push(word);
    }
    i++;
  }
  return out.length > 0 ? out.join(" ") : null;
}
