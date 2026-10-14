"use client";

import { Send } from "lucide-react";
import { useState, useTransition } from "react";
import type { sendTestPushAction } from "@/app/internal/push-test/actions";

type Result = Awaited<ReturnType<typeof sendTestPushAction>>;

const MESSAGES: Record<Exclude<Result["kind"], "sent">, string> = {
  forbidden: "Not allowed.",
  not_configured: "Push isn't configured on this server.",
  no_subscription:
    "This browser has no subscription. Turn on notifications on the Alerts page in this same browser first.",
};

/** TEMPORARY: the push-test page's one button. */
export function TestPushButton({ action }: { action: typeof sendTestPushAction }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Extract<Result, { kind: "sent" }>["deliveries"]>([]);
  return (
    <div className="flex flex-col items-start gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await action();
            setDeliveries(result.kind === "sent" ? result.deliveries : []);
            setMessage(
              result.kind === "sent"
                ? `Sent to ${result.sent} browser(s)${result.expired ? `, ${result.expired} expired (removed)` : ""}${result.failed ? `, ${result.failed} failed` : ""}. It should appear within a few seconds.`
                : MESSAGES[result.kind],
            );
          })
        }
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-60"
      >
        <Send className="size-4" aria-hidden />
        {pending ? "Sending…" : "Send test notification"}
      </button>
      {message && (
        <p role="status" className="text-sm text-foreground">
          {message}
        </p>
      )}
      {deliveries.length > 0 && (
        <ul aria-label="Deliveries" className="w-full text-xs text-muted-foreground">
          {deliveries.map((d) => (
            <li key={d.endpoint} className="border-t border-border/60 py-2 font-mono break-all">
              {d.endpoint} → {d.result} (HTTP {d.statusCode ?? "none"}){d.detail ? `: ${d.detail}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
