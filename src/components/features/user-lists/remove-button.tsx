"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/[lang]/saved/actions";
import type { Locale } from "@/i18n/locales";

/** Delete button for Saved/Alerts rows; the server re-renders the list on success. */
export function RemoveButton({
  label,
  action,
  productId,
  locale = "en",
}: {
  label: string;
  /** Answers in `locale` (Server Actions can't read the page's language). */
  action: (input: { productId: string; locale: Locale }) => Promise<ActionResult>;
  productId: string;
  locale?: Locale;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        aria-label={label}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await action({ productId, locale });
            setError(result.ok ? null : result.message);
          })
        }
        className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-destructive disabled:opacity-50"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
