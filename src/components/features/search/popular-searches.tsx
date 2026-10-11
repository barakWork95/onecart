import Link from "next/link";

/** Starting points that exercise both English and Hebrew search. */
export const POPULAR_SEARCHES: readonly { label: string; q: string; lang?: "he" }[] = [
  { label: "Wireless earbuds", q: "wireless earbuds" },
  { label: "אוזניות אלחוטיות", q: "אוזניות אלחוטיות", lang: "he" },
  { label: "Mechanical keyboard", q: "mechanical keyboard" },
  { label: "Memory foam pillow", q: "memory foam pillow" },
  { label: "Car phone mount", q: "car phone mount" },
];

export function PopularSearches({ heading }: { heading: string }) {
  return (
    <section aria-labelledby="popular-searches" className="flex flex-col gap-3">
      <h2 id="popular-searches" className="text-sm font-semibold text-muted-foreground">
        {heading}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {POPULAR_SEARCHES.map(({ label, q, lang }) => (
          <li key={q}>
            <Link
              href={`/search?${new URLSearchParams({ q }).toString()}`}
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
