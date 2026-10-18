import type { ImportTaxPolicy } from "@/domain/pricing/import-tax-policy";
import type { Money } from "@/domain/shared/money";
import { dict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";

const pct = (bps: number) => `${bps / 100}%`;
const amount = (m: Money, locale: Locale) =>
  m.currency === "USD"
    ? new Intl.NumberFormat(locale === "he" ? "he-IL" : "en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(m.amountMinor / 100)
    : `${m.amountMinor / 100} ${m.currency}`;

/**
 * What "landed price" means here, with the thresholds read from the import
 * policy itself (config/israel-import-policy.ts), so the text can't go stale.
 */
export function HowWePrice({ policy, locale = "en" }: { policy: ImportTaxPolicy; locale?: Locale }) {
  const t = dict(locale).category.howWePrice;
  return (
    <section
      aria-labelledby="how-we-price"
      className="flex flex-col gap-2 rounded-3xl border border-border/60 bg-card p-4 text-sm sm:p-5"
    >
      <h2 id="how-we-price" className="text-lg font-bold text-foreground">
        {t.heading}
      </h2>
      <p className="text-muted-foreground">
        {t.introStart}
        <strong className="text-foreground">{t.landedPrice}</strong>
        {t.introEnd}
      </p>
      <ul className="ms-5 list-disc text-muted-foreground">
        <li>{t.item}</li>
        <li>{t.shipping}</li>
        <li>{t.vat(pct(policy.vatRateBps), amount(policy.vatExemptionThreshold, locale))}</li>
        <li>{t.duty(amount(policy.dutyExemptionThreshold, locale), pct(policy.defaultDutyRateBps))}</li>
      </ul>
      <p className="text-muted-foreground">{t.disclaimer}</p>
    </section>
  );
}
