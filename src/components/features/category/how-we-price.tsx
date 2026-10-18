import type { ImportTaxPolicy } from "@/domain/pricing/import-tax-policy";
import type { Money } from "@/domain/shared/money";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pct = (bps: number) => `${bps / 100}%`;
const amount = (m: Money) =>
  m.currency === "USD" ? usd.format(m.amountMinor / 100) : `${m.amountMinor / 100} ${m.currency}`;

/**
 * What "landed price" means here, with the thresholds read from the import
 * policy itself (config/israel-import-policy.ts), so the text can't go stale.
 */
export function HowWePrice({ policy }: { policy: ImportTaxPolicy }) {
  return (
    <section
      aria-labelledby="how-we-price"
      className="flex flex-col gap-2 rounded-3xl border border-border/60 bg-card p-4 text-sm sm:p-5"
    >
      <h2 id="how-we-price" className="text-lg font-bold text-foreground">
        How we compare prices
      </h2>
      <p className="text-muted-foreground">
        Each price is the <strong className="text-foreground">landed price</strong>: what the item costs
        delivered to Israel, not just the sticker price. It adds up:
      </p>
      <ul className="ms-5 list-disc text-muted-foreground">
        <li>the item, converted to shekels at the day&apos;s exchange rate;</li>
        <li>shipping to Israel, when the store quotes it (otherwise the card says so);</li>
        <li>
          import VAT of {pct(policy.vatRateBps)} on orders over {amount(policy.vatExemptionThreshold)}, unless
          the store already charges it at checkout;
        </li>
        <li>
          customs duty on orders over {amount(policy.dutyExemptionThreshold)}, estimated at{" "}
          {pct(policy.defaultDutyRateBps)} (the real rate depends on the product).
        </li>
      </ul>
      <p className="text-muted-foreground">
        Taxes are estimates under the Israeli import rules as we understand them; the store&apos;s checkout
        and the Israel Tax Authority set what you actually pay. Prices are checked daily.
      </p>
    </section>
  );
}
