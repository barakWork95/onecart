import Link from "next/link";
import { localizedPath, type Locale } from "@/i18n/locales";

/** Starting points: the trending products, plus a Hebrew search to show translation works. */
export const POPULAR_SEARCHES: readonly { label: string; q: string; lang?: "he" }[] = [
  { label: "Sony WH-1000XM5", q: "sony wh-1000xm5" },
  { label: "AirPods Pro", q: "airpods pro" },
  { label: "Instant Pot Duo", q: "instant pot duo" },
  { label: "JBL Flip 6", q: "jbl flip 6" },
  { label: "Kindle Paperwhite", q: "kindle paperwhite" },
  { label: "אוזניות אלחוטיות", q: "אוזניות אלחוטיות", lang: "he" },
];

export function PopularSearches({ heading, locale = "en" }: { heading: string; locale?: Locale }) {
  return (
    <section aria-labelledby="popular-searches" className="flex flex-col gap-3">
      <h2 id="popular-searches" className="text-sm font-semibold text-muted-foreground">
        {heading}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {POPULAR_SEARCHES.map(({ label, q, lang }) => (
          <li key={q}>
            <Link
              href={localizedPath(locale, `/search?${new URLSearchParams({ q }).toString()}`)}
              lang={lang}
              dir={lang === "he" ? "rtl" : undefined}
              className="inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-secondary"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
