"use client";

import { Search, X } from "lucide-react";
import Form from "next/form";
import { useEffect, useRef, useState } from "react";
import { MAX_QUERY_LENGTH } from "@/domain/search/search-query";
import { cn } from "@/lib/utils";

/**
 * The full hint is wider than a phone's input (276px vs 190–245px at
 * 320–375px), where it would be cut off mid-word; phones get the short one.
 */
const PLACEHOLDER = { short: "Search products…", full: "Search products, brands or models…" } as const;
const FITS_FULL_PLACEHOLDER = "(min-width: 640px)";

/** The placeholder that fits this screen; the short one until mounted, so server and client agree. */
function usePlaceholder(): string {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(FITS_FULL_PLACEHOLDER);
    const update = () => setFull(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return full ? PLACEHOLDER.full : PLACEHOLDER.short;
}

/** GET form to /search — works without JS, client-side navigation with it. */
export function SearchBox({
  defaultValue = "",
  autoFocus = false,
  className,
}: {
  defaultValue?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const placeholder = usePlaceholder();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Form action="/search" role="search" className={cn("relative", className)}>
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
        aria-label="Search products"
        className="h-14 w-full rounded-2xl border border-border bg-card ps-12 pe-12 text-base font-medium text-foreground shadow-sm outline-none placeholder:font-normal placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute end-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </Form>
  );
}
