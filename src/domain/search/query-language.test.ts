import { detectQueryLanguage } from "@/domain/search/query-language";

describe("detectQueryLanguage", () => {
  it.each([
    ["אוזניות אלחוטיות", "he"],
    ["אוזניות sony", "he"],
    ["wireless earbuds", "en"],
    ["iPhone 15 128GB", "en"],
    ["", "en"],
  ] as const)("%p → %s", (text, expected) => {
    expect(detectQueryLanguage(text)).toBe(expected);
  });
});
