import { beforeValue, DICTIONARIES } from "@/i18n/dictionaries";

/** Every leaf as text: strings as they are, functions called with sample arguments. */
function leaves(value: unknown, prefix = ""): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  if (typeof value === "function") {
    // "3" serves as every argument: interpolated, compared and lower-cased alike.
    const sample = Array.from({ length: value.length }, () => "3");
    return [[prefix, String((value as (...args: unknown[]) => unknown)(...sample))]];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    leaves(v, prefix ? `${prefix}.${k}` : k),
  );
}

/** Text that's the same in every language by design: brand names, or Hebrew shown on English pages. */
const SAME_IN_BOTH = new Set([
  "language.suggestion",
  "language.suggestionCta",
  "language.suggestionDismiss",
  "group.comparison.storePrice",
]);

describe("dictionaries", () => {
  it("give Hebrew every English key, and translate it (no English left behind)", () => {
    const en = new Map(leaves(DICTIONARIES.en));
    const he = new Map(leaves(DICTIONARIES.he));
    expect([...he.keys()].sort()).toEqual([...en.keys()].sort());
    for (const [key, text] of he) {
      expect([key, text.trim().length > 0]).toEqual([key, true]);
      if (key === "language.switchTo" || SAME_IN_BOTH.has(key)) continue;
      expect([key, text]).not.toEqual([key, en.get(key)]);
    }
  });

  it("count in Hebrew with its own singular", () => {
    expect(DICTIONARIES.he.card.stores(1)).toBe("חנות אחת");
    expect(DICTIONARIES.he.card.stores(3)).toBe("3 חנויות");
    expect(DICTIONARIES.en.card.stores(1)).toBe("1 store");
    // Listings are offers ("הצעה"); two of them read "שתי ההצעות".
    expect(DICTIONARIES.he.compare.trayAll(2, "eBay")).toBe("שתי ההצעות ב-eBay");
    expect(DICTIONARIES.he.compare.trayAll(5, "eBay")).toBe("כל 5 ההצעות ב-eBay");
    expect(DICTIONARIES.he.group.listings(1)).toBe("הצעה אחת");
  });
});

describe("beforeValue", () => {
  it("joins a Hebrew prefix to its value, and spaces an English label", () => {
    expect(beforeValue(DICTIONARIES.he.card.pricesAsOf) + "13 באוק׳").toBe("המחירים נכונים ל-13 באוק׳");
    expect(beforeValue(DICTIONARIES.en.card.pricesAsOf) + "13 Oct").toBe("Prices as of 13 Oct");
  });
});
