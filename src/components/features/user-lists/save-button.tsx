"use client";

import { Bookmark } from "lucide-react";
import { useState, useTransition } from "react";
import { setSavedAction } from "@/app/[lang]/saved/actions";
import { dict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";
import { analyticsTitle, trackEvent } from "@/lib/analytics";

export function SaveButton({
  productId,
  searchText,
  title,
  initialSaved,
  priceIls,
  overlay = false,
  locale = "en",
}: {
  locale?: Locale;
  /** The landed price shown with it, in shekels (reported with the save). */
  priceIls: number;
  productId: string;
  searchText: string;
  title: string;
  initialSaved: boolean;
  /** Styled to sit on top of a product image. */
  overlay?: boolean;
}) {
  const t = dict(locale).lists;
  const [saved, setSaved] = useState(initialSaved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !saved;
    setSaved(next); // optimistic
    setError(null);
    startTransition(async () => {
      const result = await setSavedAction({ productId, searchText, saved: next, locale });
      if (!result.ok) {
        setSaved(!next);
        setError(result.message);
      } else if (next) {
        trackEvent("save_item", { product_title: analyticsTitle(title), price_ils: priceIls, locale });
      }
    });
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={saved}
        aria-label={saved ? t.unsave(title) : t.save(title)}
        className={cn(
          "flex size-9 items-center justify-center rounded-full border transition-colors disabled:opacity-60",
          saved
            ? "border-primary bg-primary/10 text-primary"
            : "border-border bg-card text-muted-foreground hover:text-foreground",
          overlay && "border-transparent shadow-sm backdrop-blur",
          overlay && (saved ? "bg-background/95" : "bg-background/85"),
        )}
      >
        <Bookmark className={cn("size-4", saved && "fill-current")} aria-hidden />
      </button>
      {error && (
        <span
          role="alert"
          className="absolute end-0 top-10 z-10 w-56 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </span>
      )}
    </span>
  );
}
