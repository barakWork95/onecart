"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import type { Locale } from "@/i18n/locales";
import { analyticsTitle, trackEvent } from "@/lib/analytics";

/** A suggested search's link, reporting the pick (`search_query` from a pill). */
export function SearchPill({
  query,
  locale,
  ...props
}: ComponentProps<typeof Link> & { query: string; locale: Locale }) {
  return (
    <Link
      {...props}
      onClick={(event) => {
        trackEvent("search_query", { query: analyticsTitle(query), locale, source: "trending_pill" });
        props.onClick?.(event);
      }}
    />
  );
}
