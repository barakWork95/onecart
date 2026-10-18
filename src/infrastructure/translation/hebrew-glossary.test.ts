import {
  HEBREW_PHRASES,
  HEBREW_WORDS,
  translateWithGlossary,
  protectForMachineTranslation,
} from "@/infrastructure/translation/hebrew-glossary";

const t = (text: string) => translateWithGlossary(text);

describe("translateWithGlossary", () => {
  it("translates known phrases with English word order", () => {
    expect(t("אוזניות אלחוטיות")).toEqual({ text: "wireless earbuds", untranslated: [] });
    expect(t("מכונת קפה")?.text).toBe("coffee machine");
  });

  it("prefers the longest phrase", () => {
    expect(t("שואב אבק רובוטי")?.text).toBe("robot vacuum");
    expect(t("שואב אבק")?.text).toBe("vacuum cleaner");
  });

  it("translates word by word, keeping Latin words and numbers", () => {
    expect(t("אוזניות sony 2")?.text).toBe("headphones sony 2");
    expect(t("מקלדת מכנית  שחורה")?.text).toBe("mechanical keyboard black");
  });

  it("understands every gender/number form of common adjectives", () => {
    for (const form of ["אלחוטי", "אלחוטית", "אלחוטיים", "אלחוטיות"]) {
      expect(t(`רמקול ${form}`)?.text).toBe("speaker wireless");
    }
  });

  it("strips Hebrew prefixes (ל/ב/ה/ו/ש/מ/כ and two-letter combos)", () => {
    expect(t("כיסוי לאייפון")?.text).toBe("case iphone");
    expect(t("מטען לרכב")?.text).toBe("car charger");
    expect(t("מחזיק לטלפון")?.text).toBe("holder phone");
    expect(t("והאוזניות")?.text).toBe("headphones");
    expect(t("שבתיק")?.text).toBe("bag"); // ש + ב + תיק
    expect(t("ושבתיק")).toBeNull(); // three prefix letters: too ambiguous to guess
  });

  it("drops function words like 'with' and 'for'", () => {
    expect(t("אוזניות עם מיקרופון")?.text).toBe("headphones microphone");
    expect(t("צעצועים בשביל ילדים")?.text).toBe("toys kids");
  });

  it("transliterates common brands", () => {
    expect(t("אוזניות סוני")?.text).toBe("headphones sony");
    expect(t("שעון סמסונג גלקסי")?.text).toBe("watch samsung galaxy");
    expect(t("ג'יביאל")?.text).toBe("jbl");
  });

  it("ignores niqqud and quote marks", () => {
    expect(t("רמקול בלוטות'")?.text).toBe("bluetooth speaker");
    expect(t("אוֹזְנִיּוֹת")?.text).toBe("headphones");
  });

  it("translates what it can and reports the words it couldn't", () => {
    expect(t("אוזניות מגניבות סגולות")).toEqual({ text: "headphones purple", untranslated: ["מגניבות"] });
  });

  it("returns null when no Hebrew word could be translated", () => {
    expect(t("מילים לא מוכרות")).toBeNull();
    expect(t("  ")).toBeNull();
    expect(t("של עם")).toBeNull();
  });

  it("only maps to lower-case English", () => {
    for (const en of [...Object.values(HEBREW_PHRASES), ...Object.values(HEBREW_WORDS)]) {
      expect(en).toBe(en.toLowerCase());
      expect(en).not.toMatch(/[א-ת]/);
    }
  });
});

describe("protectForMachineTranslation", () => {
  it("marks brands and model codes untranslatable, Hebrew brand spellings included", () => {
    expect(protectForMachineTranslation("מגהץ סוני sony wh-1000xm5")).toBe(
      "מגהץ <x>sony</x> <x>sony</x> <x>wh-1000xm5</x>",
    );
    // Prefixed Hebrew brand ("ל" + "סמסונג"): the brand is protected, the meaning of the prefix is DeepL's.
    expect(protectForMachineTranslation("כיסוי לסמסונג")).toBe("כיסוי <x>samsung</x>");
  });

  it("escapes markup characters and leaves plain Hebrew to the translator", () => {
    expect(protectForMachineTranslation("מגהץ & <קיטור>")).toBe("מגהץ &amp; &lt;קיטור&gt;");
  });
});
