import { dict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";

/** Keep the disclosure next to the promoted offers, including inside an open comparison. */
export function AffiliateDisclosure({ locale = "en" }: { locale?: Locale }) {
  return (
    <p className="text-[11px] leading-relaxed text-muted-foreground">{dict(locale).affiliateDisclosure}</p>
  );
}
