import {
  HEBREW_PHRASES,
  HEBREW_WORDS,
  translateWithGlossary,
} from "@/infrastructure/translation/hebrew-glossary";

describe("translateWithGlossary", () => {
  it("translates known phrases with English word order", () => {
    expect(translateWithGlossary("אוזניות אלחוטיות")).toBe("wireless earbuds");
  });

  it("prefers the longest phrase", () => {
    expect(translateWithGlossary("שואב אבק רובוטי")).toBe("robot vacuum");
    expect(translateWithGlossary("שואב אבק")).toBe("vacuum cleaner");
  });

  it("falls back to word-by-word and passes Latin words and numbers through", () => {
    expect(translateWithGlossary("אוזניות sony 2")).toBe("earbuds sony 2");
    expect(translateWithGlossary("מקלדת מכנית  שחורה")).toBe("mechanical keyboard black");
  });

  it("ignores niqqud and geresh", () => {
    expect(translateWithGlossary("רמקול בלוטות'")).toBe("bluetooth speaker");
    expect(translateWithGlossary("אוֹזְנִיּוֹת")).toBe("earbuds");
  });

  it("returns null when any Hebrew word is unknown (no half translations)", () => {
    expect(translateWithGlossary("אוזניות סגולות")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(translateWithGlossary("  ")).toBeNull();
  });

  it("only maps to lower-case English", () => {
    for (const en of [...Object.values(HEBREW_PHRASES), ...Object.values(HEBREW_WORDS)]) {
      expect(en).toBe(en.toLowerCase());
      expect(en).not.toMatch(/[א-ת]/);
    }
  });
});
