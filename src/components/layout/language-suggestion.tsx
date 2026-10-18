"use client";

import { Languages, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { switchedHref } from "@/components/layout/language-switcher";

const DISMISSED_KEY = "onecart-he-suggestion";

/** The browser's first choice is Hebrew ("he", "he-IL"; "iw" is its legacy code). */
export function prefersHebrew(languages: readonly string[]): boolean {
  const first = languages[0]?.toLowerCase() ?? "";
  return first === "he" || first.startsWith("he-") || first === "iw" || first.startsWith("iw-");
}

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * On English pages, a dismissible note for visitors whose browser prefers Hebrew: the
 * same page in Hebrew is one tap away. Never a redirect (crawlers must see both). Decided
 * after mounting, so the server's HTML is the same for everyone.
 */
export function LanguageSuggestion({ text, cta, dismiss }: { text: string; cta: string; dismiss: string }) {
  const href = switchedHref(usePathname(), useSearchParams().toString(), "he");
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Reads the browser's preferences, which only exist after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(prefersHebrew(navigator.languages ?? [navigator.language]) && !dismissed());
  }, []);

  if (!show) return null;
  return (
    <div
      lang="he"
      dir="rtl"
      role="region"
      aria-label={text}
      className="border-b border-border/60 bg-primary/5 px-4 py-2 text-sm text-foreground"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <p className="flex items-center gap-2">
          <Languages className="size-4 shrink-0 text-primary" aria-hidden />
          {text}
          <Link href={href} prefetch={false} hrefLang="he" className="font-semibold text-primary underline">
            {cta}
          </Link>
        </p>
        <button
          type="button"
          onClick={() => {
            setShow(false);
            try {
              localStorage.setItem(DISMISSED_KEY, "1");
            } catch {
              // Private mode: it just shows again next visit.
            }
          }}
          aria-label={dismiss}
          className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-secondary"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
