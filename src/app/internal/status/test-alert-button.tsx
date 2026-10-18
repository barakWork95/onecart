"use client";

import { Send } from "lucide-react";
import { useState, useTransition } from "react";
import type { sendTestOpsAlertAction } from "@/app/internal/status/actions";

/** Sends a test ops alert to every listed browser. */
export function TestAlertButton({ action }: { action: typeof sendTestOpsAlertAction }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await action();
            setMessage(
              !result.ok
                ? result.message
                : result.value.targets === 0
                  ? "No browser is listed yet: turn ops alerts on above."
                  : `Sent to ${result.value.delivered} of ${result.value.targets} listed browser(s).`,
            );
          })
        }
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold disabled:opacity-60"
      >
        <Send className="size-4" aria-hidden />
        {pending ? "Sending…" : "Send a test alert"}
      </button>
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
