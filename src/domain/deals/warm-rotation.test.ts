import { rotationDays, rotationFor, rotationTtlSeconds } from "@/domain/deals/warm-rotation";

const DAY = 24 * 60 * 60 * 1000;
const QUERIES = ["a", "b", "c", "d", "e"];

describe("rotationFor", () => {
  it("takes perDay items a day, advancing and wrapping", () => {
    const days = [0, 1, 2, 3, 4].map((d) => rotationFor(QUERIES, 2, d * DAY + 7.5 * 60 * 60 * 1000));
    expect(days).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e", "a"],
      ["b", "c"],
      ["d", "e"],
    ]);
  });

  it("covers every item within rotationDays", () => {
    for (const perDay of [1, 2, 3, 5]) {
      const span = rotationDays(QUERIES.length, perDay);
      for (let first = 0; first < 10; first++) {
        const seen = new Set<string>();
        for (let d = first; d < first + span; d++)
          for (const q of rotationFor(QUERIES, perDay, d * DAY)) seen.add(q);
        expect(seen.size).toBe(QUERIES.length);
      }
    }
  });

  it("is the same all day and empty when off", () => {
    expect(rotationFor(QUERIES, 2, 3 * DAY)).toEqual(rotationFor(QUERIES, 2, 4 * DAY - 1));
    expect(rotationFor(QUERIES, 0, 0)).toEqual([]);
    expect(rotationFor([], 2, 0)).toEqual([]);
    expect(rotationFor(QUERIES, 9, 0)).toEqual(QUERIES);
  });
});

describe("rotation timing", () => {
  it("refreshes each item every ceil(n / perDay) days and keeps it 12h longer", () => {
    expect(rotationDays(5, 2)).toBe(3);
    expect(rotationDays(5, 5)).toBe(1);
    expect(rotationDays(5, 9)).toBe(1);
    expect(rotationDays(5, 0)).toBe(0);
    expect(rotationDays(0, 2)).toBe(0);
    expect(rotationTtlSeconds(5, 2)).toBe(3.5 * 24 * 60 * 60);
  });
});
