import { FALLBACK_FX_RATES } from "@/config/fallback-fx-rates";

describe("FALLBACK_FX_RATES", () => {
  it("covers every currency with a plausible rate into ILS", () => {
    const { toIls } = FALLBACK_FX_RATES;
    expect(toIls.ILS).toBe(1);
    // Sanity bands, wide enough for years of normal moves, narrow enough to catch an inverted rate.
    expect(toIls.USD).toBeGreaterThan(2.5);
    expect(toIls.USD).toBeLessThan(5);
    expect(toIls.EUR).toBeGreaterThan(toIls.USD * 0.9);
    expect(toIls.GBP).toBeGreaterThan(toIls.EUR);
    expect(toIls.CNY).toBeGreaterThan(0.3);
    expect(toIls.CNY).toBeLessThan(0.8);
  });
});
