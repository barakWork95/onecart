import { businessDaysBetween, businessDaysUntil, startOfUtcDay } from "@/domain/shared/business-days";

describe("business days", () => {
  const sunday = Date.UTC(2026, 9, 11);

  it("counts weekdays after the start, inclusive of the end", () => {
    expect(businessDaysBetween(sunday, Date.UTC(2026, 9, 16))).toBe(5);
    expect(businessDaysBetween(sunday, Date.UTC(2026, 9, 18))).toBe(5);
    expect(businessDaysBetween(sunday, sunday)).toBe(0);
    expect(businessDaysBetween(sunday, sunday - 86_400_000)).toBe(0);
  });

  it("compares calendar days, ignoring the time of day", () => {
    expect(startOfUtcDay(new Date("2026-10-11T23:59:00Z"))).toBe(sunday);
    expect(businessDaysUntil(new Date("2026-10-11T23:00:00Z"), new Date("2026-10-12T01:00:00Z"))).toBe(1);
  });
});
