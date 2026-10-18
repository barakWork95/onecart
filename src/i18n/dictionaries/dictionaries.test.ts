import { DICTIONARIES } from "@/i18n/dictionaries";

/** Every leaf string, by dotted key. */
function leaves(value: unknown, prefix = ""): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    leaves(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("dictionaries", () => {
  it("give Hebrew every English key, and translate it (no English left behind)", () => {
    const en = new Map(leaves(DICTIONARIES.en));
    const he = new Map(leaves(DICTIONARIES.he));
    expect([...he.keys()].sort()).toEqual([...en.keys()].sort());
    for (const [key, text] of he) {
      expect([key, text.trim().length > 0]).toEqual([key, true]);
      if (key !== "language.switchTo") expect([key, text]).not.toEqual([key, en.get(key)]);
    }
  });
});
