"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/saved/actions";

/** Delete button for Saved/Alerts rows; the server re-renders the list on success. */
export function RemoveButton({
  label,
  action,
  productId,
}: {
  label: string;
  action: (input: { productId: string }) => Promise<ActionResult>;
  productId: string;
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
            const result = await action({ productId });
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
