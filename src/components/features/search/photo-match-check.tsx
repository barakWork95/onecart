"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";

/**
 * Progressive grouping for a fresh generic search. The results are already on
 * screen; this asks the server to fingerprint each store's top photos and, when
 * that forms new look-alike cards, refreshes the results in place (a transition:
 * the current cards stay until the grouped ones replace them, no skeleton, no
 * reload). The refreshed page no longer asks, since its photos are all tried.
 * A failed or throttled check changes nothing.
 */
export function PhotoMatchCheck({ params }: { params: Readonly<Record<string, string>> }) {
  const router = useRouter();
  // One check per search, however often the parent re-renders.
  const key = new URLSearchParams(params).toString();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/match/fingerprint-top", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new URLSearchParams(key))),
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { regrouped?: unknown } | null) => {
        if (result?.regrouped === true) startTransition(() => router.refresh());
      })
      .catch(() => {});
    return () => controller.abort();
  }, [key, router]);

  return null;
}
