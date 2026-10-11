"use client";

import { Bookmark } from "lucide-react";
import { useState, useTransition } from "react";
import { setSavedAction } from "@/app/saved/actions";
import { cn } from "@/lib/utils";

export function SaveButton({
  productId,
  searchText,
  title,
  initialSaved,
}: {
  productId: string;
  searchText: string;
  title: string;
  initialSaved: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !saved;
    setSaved(next); // optimistic
    setError(null);
    startTransition(async () => {
      const result = await setSavedAction({ productId, searchText, saved: next });
      if (!result.ok) {
        setSaved(!next);
        setError(result.message);
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
        aria-label={saved ? `Remove ${title} from Saved` : `Save ${title}`}
        className={cn(
          "flex size-9 items-center justify-center rounded-full border transition-colors disabled:opacity-60",
          saved
            ? "border-primary bg-primary/10 text-primary"
            : "border-border bg-card text-muted-foreground hover:text-foreground",
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
