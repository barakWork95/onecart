import { createFxRates } from "@/domain/pricing/fx-rates";

/** Round numbers keep expected values hand-checkable in tests. */
export const TEST_FX = createFxRates(
  { ILS: 1, USD: 3.7, EUR: 4, CNY: 0.5, GBP: 4.7 },
  "2026-10-11T00:00:00.000Z",
);
