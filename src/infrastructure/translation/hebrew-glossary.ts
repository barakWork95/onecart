/**
 * Offline Hebrew → English for shopping queries, used when DeepL isn't
 * configured or fails. Phrases are matched before single words because Hebrew
 * puts adjectives after nouns ("אוזניות אלחוטיות" = "wireless earbuds").
 * Grow it from real zero-result Hebrew queries, not guesses.
 */
export const HEBREW_PHRASES: Readonly<Record<string, string>> = {
  "אוזניות אלחוטיות": "wireless earbuds",
  "אוזניות קשת": "over-ear headphones",
  "אוזניות ביטול רעשים": "noise cancelling headphones",
  "אוזניות גיימינג": "gaming headset",
  "מקלדת מכנית": "mechanical keyboard",
  "עכבר אלחוטי": "wireless mouse",
  "עכבר גיימינג": "gaming mouse",
  "כרית זיכרון": "memory foam pillow",
  "מחזיק טלפון לרכב": "car phone mount",
  "מחזיק לטלפון לרכב": "car phone mount",
  "מטען אלחוטי": "wireless charger",
  "מטען לרכב": "car charger",
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
  "מברשת שיניים": "toothbrush",
  "מייבש שיער": "hair dryer",
  "מחליק שיער": "hair straightener",
  "מכונת גילוח": "electric shaver",
  "נעלי ריצה": "running shoes",
  "נעלי ספורט": "sneakers",
  "תיק גב": "backpack",
  "מכונת קפה": "coffee machine",
  "מצלמת אבטחה": "security camera",
  "מצלמת רכב": "dash cam",
  "כונן קשיח": "hard drive",
  "כרטיס זיכרון": "memory card",
  "דיסק און קי": "usb flash drive",
  "בגד ים": "swimsuit",
};

const NOUNS: Readonly<Record<string, string>> = {
  // electronics
  אוזניות: "headphones",
  אוזנייה: "earbud",
  מקלדת: "keyboard",
  עכבר: "mouse",
  מסך: "monitor",
  מחשב: "computer",
  טאבלט: "tablet",
  טלפון: "phone",
  סמארטפון: "smartphone",
  מטען: "charger",
  כבל: "cable",
  מתאם: "adapter",
  רמקול: "speaker",
  רמקולים: "speakers",
  מיקרופון: "microphone",
  מצלמה: "camera",
  רחפן: "drone",
  מקרן: "projector",
  מדפסת: "printer",
  נתב: "router",
  שעון: "watch",
  סוללה: "battery",
  סוללות: "batteries",
  קונסולה: "console",
  שלט: "remote",
  // home & kitchen
  כרית: "pillow",
  כריות: "pillows",
  שמיכה: "blanket",
  מצעים: "bedding",
  מגבת: "towel",
  מגבות: "towels",
  שטיח: "rug",
  מנורה: "lamp",
  נורה: "bulb",
  פנס: "flashlight",
  מאוורר: "fan",
  מזגן: "air conditioner",
  מחבת: "pan",
  סיר: "pot",
  סכין: "knife",
  סכינים: "knives",
  בלנדר: "blender",
  מיקסר: "mixer",
  טוסטר: "toaster",
  קומקום: "kettle",
  בקבוק: "bottle",
  כוס: "cup",
  ספל: "mug",
  תרמוס: "thermos",
  קפה: "coffee",
  מברגה: "drill",
  מקדחה: "drill",
  כלים: "tools",
  // fashion
  נעליים: "shoes",
  נעלי: "shoes",
  סניקרס: "sneakers",
  חולצה: "shirt",
  חולצות: "shirts",
  מכנסיים: "pants",
  שמלה: "dress",
  חצאית: "skirt",
  מעיל: "jacket",
  "ז׳קט": "jacket",
  גרביים: "socks",
  כובע: "hat",
  תיק: "bag",
  ארנק: "wallet",
  משקפיים: "glasses",
  תכשיטים: "jewelry",
  שרשרת: "necklace",
  טבעת: "ring",
  // kids, sport, outdoors, pets, car
  צעצוע: "toy",
  צעצועים: "toys",
  משחק: "game",
  בובה: "doll",
  עגלה: "stroller",
  אופניים: "bicycle",
  קסדה: "helmet",
  אוהל: "tent",
  כדור: "ball",
  רכב: "car",
  כלב: "dog",
  כלבים: "dog",
  חתול: "cat",
  חתולים: "cat",
  כיסוי: "case",
  מגן: "protector",
  מחזיק: "holder",
  מעמד: "stand",
  // people
  ילדים: "kids",
  ילד: "boy",
  ילדה: "girl",
  תינוק: "baby",
  תינוקות: "baby",
  גברים: "men",
  נשים: "women",
};

/** Adjectives in all four forms (m., f., m. pl., f. pl.) map to one English word. */
const ADJECTIVES: ReadonlyArray<readonly [forms: readonly string[], english: string]> = [
  [["אלחוטי", "אלחוטית", "אלחוטיים", "אלחוטיות"], "wireless"],
  [["חשמלי", "חשמלית", "חשמליים", "חשמליות"], "electric"],
  [["חכם", "חכמה", "חכמים", "חכמות"], "smart"],
  [["נייד", "ניידת", "ניידים", "ניידות"], "portable"],
  [["מקצועי", "מקצועית", "מקצועיים", "מקצועיות"], "professional"],
  [["מכני", "מכנית", "מכניים", "מכניות"], "mechanical"],
  [["עמיד", "עמידה", "עמידים", "עמידות"], "durable"],
  [["קטן", "קטנה", "קטנים", "קטנות"], "small"],
  [["גדול", "גדולה", "גדולים", "גדולות"], "large"],
  [["שחור", "שחורה", "שחורים", "שחורות"], "black"],
  [["לבן", "לבנה", "לבנים", "לבנות"], "white"],
  [["אדום", "אדומה", "אדומים", "אדומות"], "red"],
  [["כחול", "כחולה", "כחולים", "כחולות"], "blue"],
  [["ירוק", "ירוקה", "ירוקים", "ירוקות"], "green"],
  [["צהוב", "צהובה", "צהובים", "צהובות"], "yellow"],
  [["סגול", "סגולה", "סגולים", "סגולות"], "purple"],
  [["אפור", "אפורה", "אפורים", "אפורות"], "gray"],
  [["ורוד", "ורודה", "ורודים", "ורודות"], "pink"],
];

/** Brand names Israelis type in Hebrew. */
const BRANDS: Readonly<Record<string, string>> = {
  אפל: "apple",
  אייפון: "iphone",
  איירפודס: "airpods",
  אייפד: "ipad",
  מקבוק: "macbook",
  סמסונג: "samsung",
  גלקסי: "galaxy",
  שיאומי: "xiaomi",
  סוני: "sony",
  בוז: "bose",
  "ג׳יביאל": "jbl",
  אנקר: "anker",
  "לוג׳יטק": "logitech",
  דייסון: "dyson",
  פיליפס: "philips",
  נייקי: "nike",
  אדידס: "adidas",
  לגו: "lego",
  נינטנדו: "nintendo",
  פלייסטיישן: "playstation",
};

export const HEBREW_WORDS: Readonly<Record<string, string>> = {
  ...NOUNS,
  ...Object.fromEntries(ADJECTIVES.flatMap(([forms, english]) => forms.map((form) => [form, english]))),
  ...BRANDS,
};

/** Function words that carry no product meaning in a search ("of", "with", "for", …). */
const STOPWORDS = new Set([
  "של",
  "עם",
  "עבור",
  "בשביל",
  "את",
  "על",
  "או",
  "גם",
  "הכי",
  "ל",
  "ב",
  "ו",
  "זול",
  "זולה",
  "זולים",
  "חדש",
  "חדשה",
  "מקורי",
]);

/** One- and two-letter prefixes (ו/ה/ב/כ/ל/מ/ש and combos like "וה", "של"). */
const PREFIX_LETTERS = "והבכלמש";

/** Strips niqqud and Hebrew/ASCII quote marks; normalizes geresh to ׳ so "ג'קט" matches "ג׳קט". */
function normalizeHebrew(text: string): string {
  return text
    .replace(/[֑-ׇ]/g, "")
    .replace(/(?<=[א-ת])['`’](?=[א-ת])/g, "׳")
    .replace(/[״"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const PHRASES_LONGEST_FIRST = Object.entries(HEBREW_PHRASES)
  .map(([he, en]) => [normalizeHebrew(he).split(" "), en] as const)
  .sort((a, b) => b[0].length - a[0].length);

const HEBREW = /[א-ת]/;

type WordResult = { kind: "word"; english: string } | { kind: "stopword" } | { kind: "unknown" };

/** Exact word, else the word without up to two prefix letters ("לטלפון" → "טלפון"). */
function lookup(word: string): WordResult {
  for (let strip = 0; strip <= 2 && word.length - strip >= 2; strip++) {
    if (strip > 0 && !PREFIX_LETTERS.includes(word[strip - 1] ?? "")) break;
    const stem = word.slice(strip);
    const english = HEBREW_WORDS[stem];
    if (english) return { kind: "word", english };
    if (STOPWORDS.has(stem)) return { kind: "stopword" };
  }
  return STOPWORDS.has(word) ? { kind: "stopword" } : { kind: "unknown" };
}

export interface GlossaryTranslation {
  readonly text: string;
  /** Hebrew words we couldn't translate (dropped from `text`). Empty when complete. */
  readonly untranslated: readonly string[];
}

/**
 * Translates what it can. Latin words and numbers pass through
 * ("אוזניות sony" → "headphones sony"); unknown Hebrew words are dropped and
 * reported, so the caller can tell the shopper. Returns null when nothing
 * Hebrew could be translated — an empty or all-Hebrew query helps no store.
 */
export function translateWithGlossary(text: string): GlossaryTranslation | null {
  const words = normalizeHebrew(text).split(" ").filter(Boolean);
  const out: string[] = [];
  const untranslated: string[] = [];
  let translatedHebrew = 0;

  for (let i = 0; i < words.length;) {
    const phrase = PHRASES_LONGEST_FIRST.find(([parts]) => parts.every((part, j) => words[i + j] === part));
    if (phrase) {
      out.push(phrase[1]);
      translatedHebrew++;
      i += phrase[0].length;
      continue;
    }
    const word = words[i] ?? "";
    i++;
    if (!HEBREW.test(word)) {
      out.push(word);
      continue;
    }
    const result = lookup(word);
    if (result.kind === "word") {
      out.push(result.english);
      translatedHebrew++;
    } else if (result.kind === "unknown") {
      untranslated.push(word);
    }
  }

  if (translatedHebrew === 0) return null;
  return { text: out.join(" "), untranslated };
}
