import { detectPriceDrop, PRICE_DROP_POLICY, type DailyPrice } from "@/domain/deals/price-drop";

const TODAY = "2026-10-30";
/** `days` previous daily prices (₪), oldest first, ending yesterday. */
function history(prices: readonly number[], today = TODAY): DailyPrice[] {
  const end = new Date(`${today}T12:00:00Z`);
  return prices.map((shekels, i) => {
    const day = new Date(end);
    day.setUTCDate(end.getUTCDate() - (prices.length - i));
    return { day: day.toISOString().slice(0, 10), totalMinor: shekels * 100 };
  });
}
const withToday = (prices: readonly number[], todayShekels: number) => [
  ...history(prices),
  { day: TODAY, totalMinor: todayShekels * 100 },
];
const WEEK_AT_500 = [500, 500, 500, 500, 500, 500, 500];

describe("detectPriceDrop", () => {
  it("reports a new 30-day low well below the typical price", () => {
    expect(detectPriceDrop(withToday(WEEK_AT_500, 400), TODAY)).toEqual({
      currentMinor: 400_00,
      typicalMinor: 500_00,
      lowMinor: 500_00,
      dropMinor: 100_00,
      dropShare: 0.2,
      historyDays: 7,
    });
  });

  it(`needs ${PRICE_DROP_POLICY.minHistoryDays} days of history before claiming anything`, () => {
    expect(detectPriceDrop(withToday(WEEK_AT_500.slice(1), 400), TODAY)).toBeNull();
  });

  it("drops at exactly 15% below typical, not just under it", () => {
    expect(detectPriceDrop(withToday(WEEK_AT_500, 425), TODAY)?.dropShare).toBe(0.15);
    expect(detectPriceDrop(withToday(WEEK_AT_500, 426), TODAY)).toBeNull();
  });

  it("needs at least ₪20 off, so cheap items' noise isn't a deal", () => {
    // 20% off a ₪90 item is ₪18.
    expect(detectPriceDrop(withToday([90, 90, 90, 90, 90, 90, 90], 72), TODAY)).toBeNull();
    expect(detectPriceDrop(withToday([100, 100, 100, 100, 100, 100, 100], 80), TODAY)?.dropMinor).toBe(20_00);
  });

  it("must be a new 30-day low, at or under the lowest earlier price", () => {
    // Typical ₪500, but it sold at ₪380 earlier this month: ₪400 isn't a low.
    expect(detectPriceDrop(withToday([500, 500, 380, 500, 500, 500, 500], 400), TODAY)).toBeNull();
    expect(detectPriceDrop(withToday([500, 500, 400, 500, 500, 500, 500], 400), TODAY)).not.toBeNull();
  });

  it("ignores prices older than 30 days and needs today's price", () => {
    const old = history([...WEEK_AT_500, ...Array(30).fill(900)]).slice(0, 7);
    expect(detectPriceDrop([...old, { day: TODAY, totalMinor: 400_00 }], TODAY)).toBeNull();
    expect(detectPriceDrop(history(WEEK_AT_500), TODAY)).toBeNull();
  });
});
