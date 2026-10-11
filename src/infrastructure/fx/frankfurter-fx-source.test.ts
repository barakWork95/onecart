import {
  createFrankfurterFxSource,
  FRANKFURTER_URL,
  FxUnavailableError,
} from "@/infrastructure/fx/frankfurter-fx-source";

/** Recorded from api.frankfurter.dev on 2026-10-11. */
const RECORDED = {
  amount: 1.0,
  base: "ILS",
  date: "2026-10-09",
  rates: { CNY: 2.1889, EUR: 0.29189, GBP: 0.24741, USD: 0.32709 },
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("createFrankfurterFxSource", () => {
  it("requests ILS-based rates and inverts them to ₪ per unit", async () => {
    const fetchMock = jest.fn(async (_url: string | URL | Request) => json(RECORDED));
    const rates = await createFrankfurterFxSource({ fetch: fetchMock })();

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${FRANKFURTER_URL}?base=ILS&symbols=USD,EUR,CNY,GBP`);
    expect(rates.asOf).toBe("2026-10-09T00:00:00.000Z");
    expect(rates.toIls.ILS).toBe(1);
    expect(rates.toIls.USD).toBeCloseTo(3.0573, 4);
    expect(rates.toIls.EUR).toBeCloseTo(3.4259, 4);
    expect(rates.toIls.CNY).toBeCloseTo(0.45685, 5);
  });

  it.each([
    ["HTTP error", async () => json({}, 503), /HTTP_503/],
    ["wrong base", async () => json({ ...RECORDED, base: "EUR" }), /unexpected response/],
    ["missing currency", async () => json({ ...RECORDED, rates: { USD: 0.3 } }), /unexpected response/],
    [
      "zero rate",
      async () => json({ ...RECORDED, rates: { ...RECORDED.rates, GBP: 0 } }),
      /unexpected response/,
    ],
    ["non-JSON", async () => new Response("<html>"), /unexpected response/],
    ["network failure", () => Promise.reject(new TypeError("fetch failed")), /fetch failed/],
    ["non-Error failure", () => Promise.reject("offline"), /offline/],
  ])("throws FxUnavailableError on %s", async (_label, fetchImpl, message) => {
    const fetchRates = createFrankfurterFxSource({ fetch: fetchImpl as typeof fetch });
    await expect(fetchRates()).rejects.toThrow(FxUnavailableError);
    await expect(fetchRates()).rejects.toThrow(message);
  });
});
