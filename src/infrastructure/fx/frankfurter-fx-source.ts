import { z } from "zod";
import { createFxRates, type FxRates } from "@/domain/pricing/fx-rates";
import { CURRENCY_CODES, type CurrencyCode } from "@/domain/shared/money";

/**
 * Frankfurter serves European Central Bank reference rates (free, no key,
 * updated each ECB business day). Requested with base=ILS, it returns
 * "units of X per ₪1", which we invert to "₪ per 1 X".
 */
export const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest";

const FOREIGN = CURRENCY_CODES.filter((c): c is Exclude<CurrencyCode, "ILS"> => c !== "ILS");

const responseSchema = z.object({
  base: z.literal("ILS"),
  date: z.iso.date(),
  rates: z.object({
    USD: z.number().positive(),
    EUR: z.number().positive(),
    GBP: z.number().positive(),
    CNY: z.number().positive(),
  } satisfies Record<Exclude<CurrencyCode, "ILS">, z.ZodNumber>),
});

export class FxUnavailableError extends Error {
  constructor(detail: string) {
    super(`FX rates unavailable: ${detail}`);
    this.name = "FxUnavailableError";
  }
}

export function createFrankfurterFxSource(options: { fetch?: typeof fetch; timeoutMs?: number } = {}) {
  const doFetch = options.fetch ?? fetch;

  return async function fetchRates(): Promise<FxRates> {
    const url = `${FRANKFURTER_URL}?base=ILS&symbols=${FOREIGN.join(",")}`;
    let response: Response;
    try {
      response = await doFetch(url, { signal: AbortSignal.timeout(options.timeoutMs ?? 3_000) });
    } catch (error) {
      throw new FxUnavailableError(error instanceof Error ? error.message : String(error));
    }
    if (!response.ok) throw new FxUnavailableError(`HTTP_${response.status}`);

    const parsed = responseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new FxUnavailableError("unexpected response shape");

    const { rates, date } = parsed.data;
    return createFxRates(
      { ILS: 1, USD: 1 / rates.USD, EUR: 1 / rates.EUR, GBP: 1 / rates.GBP, CNY: 1 / rates.CNY },
      `${date}T00:00:00.000Z`,
    );
  };
}
