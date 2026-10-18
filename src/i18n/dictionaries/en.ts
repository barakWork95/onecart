/**
 * Interface text in English: the source of truth for the dictionary's shape. Every
 * other language must provide the same keys (`Dictionary`), so a missing translation
 * is a type error. Store titles are never translated: they're the stores' own words.
 */
export const en = {
  language: {
    /** The switcher names the other language in that language. */
    switchTo: "עברית",
    switchLabel: "View this page in Hebrew",
  },
} as const;

type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Dictionary = Widen<typeof en>;
