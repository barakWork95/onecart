"use client";

import { Search, X } from "lucide-react";
import Form from "next/form";
import { useEffect, useRef, useState } from "react";
import { MAX_QUERY_LENGTH } from "@/domain/search/search-query";
import { dict } from "@/i18n/dictionaries";
import { localizedPath, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";
import { analyticsTitle, trackEvent } from "@/lib/analytics";

/**
 * The full hint is wider than a phone's input (276px vs 190–245px at
 * 320–375px), where it would be cut off mid-word; phones get the short one.
 */
const FITS_FULL_PLACEHOLDER = "(min-width: 640px)";

/** Whether the full placeholder fits; the short one until mounted, so server and client agree. */
function useFullPlaceholder(): boolean {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(FITS_FULL_PLACEHOLDER);
    const update = () => setFull(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return full;
}

/** GET form to /search — works without JS, client-side navigation with it. */
export function SearchBox({
  defaultValue = "",
  autoFocus = false,
  className,
  locale = "en",
}: {
  defaultValue?: string;
  autoFocus?: boolean;
  className?: string;
  locale?: Locale;
}) {
  const t = dict(locale).search.box;
  const [value, setValue] = useState(defaultValue);
  const placeholder = useFullPlaceholder() ? t.placeholderFull : t.placeholderShort;
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Form
      action={localizedPath(locale, "/search")}
      role="search"
      className={cn("relative", className)}
      // Reported as the form submits; the navigation itself isn't touched.
      onSubmit={() => trackEvent("search_query", { query: analyticsTitle(value), locale, source: "input" })}
    >
      <Search
        className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-primary"
        aria-hidden
      />
      <input
        ref={inputRef}
        name="q"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required
        maxLength={MAX_QUERY_LENGTH}
        autoFocus={autoFocus}
        dir="auto"
        enterKeyHint="search"
        placeholder={placeholder}
        aria-label={t.label}
        className="h-14 w-full rounded-2xl border border-border bg-card ps-12 pe-12 text-base font-medium text-foreground shadow-sm outline-none placeholder:font-normal placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            inputRef.current?.focus();
          }}
          aria-label={t.clear}
          className="absolute end-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </Form>
  );
}
