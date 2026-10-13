import { createFxRates, type FxRates } from "@/domain/pricing/fx-rates";

/**
 * Last-resort exchange rates (ILS per unit), used only when the live source
 * (Frankfurter / ECB) is unreachable AND no rates were ever cached, e.g. a
 * fresh instance during an outage. They let prices render instead of the
 * whole store failing; a few percent of drift is the trade-off.
 *
 * ECB reference rates for 2026-10-12, via Frankfurter (base=ILS, inverted).
 * Refresh them every few months, or after a large move in the shekel.
 */
export const FALLBACK_FX_RATES: FxRates = createFxRates(
  {
    ILS: 1,
    USD: 3.0695, // 1 / 0.32579
    EUR: 3.4319, // 1 / 0.29138
    CNY: 0.4586, // 1 / 2.1804
    GBP: 4.0626, // 1 / 0.24615
  },
  "2026-10-12T00:00:00.000Z",
);
