import { track } from "@vercel/analytics";
import type { Locale } from "@/domain/shared/locale";
import type { Money } from "@/domain/shared/money";
import type { ProviderId } from "@/domain/shared/provider";

/**
 * Custom Vercel Web Analytics events and their properties. Nothing here identifies a
 * person: product titles, prices, stores, the page's language, and the search text.
 */
export interface AnalyticsEvents {
  /** A click through to a store (via /go): the conversion we're paid for. */
  readonly outbound_click: {
    readonly store: ProviderId;
    readonly product_title: string;
    /** The landed total shown on the link, in shekels. */
    readonly price_ils: number;
    /** The cheapest offer of its comparison (the "Best price" one). */
    readonly is_best_deal: boolean;
    readonly locale: Locale;
  };
  readonly search_query: {
    readonly query: string;
    readonly locale: Locale;
    readonly source: "input" | "trending_pill";
  };
  readonly view_comparison: {
    readonly product_title: string;
    readonly store_count: number;
    readonly locale: Locale;
  };
  readonly save_item: { readonly product_title: string; readonly price_ils: number; readonly locale: Locale };
  readonly set_price_alert: {
    readonly product_title: string;
    readonly target_price: number;
    readonly locale: Locale;
  };
}

/**
 * Records an event in the browser. Fire-and-forget (the script queues and sends it in
 * the background) and never throws; a no-op wherever the analytics script isn't loaded
 * (local runs, E2E, blockers). Call it from event handlers only.
 */
export function trackEvent<Name extends keyof AnalyticsEvents>(
  name: Name,
  props: AnalyticsEvents[Name],
): void {
  try {
    track(name, { ...props });
  } catch {
    // Analytics must never break a click, a search or a save.
  }
}

/** Longest product title or query sent: dashboards group by it, so keep it a short line. */
const MAX_TEXT = 80;

/** A store title or search text as one short line: spaces collapsed, cut at 80 characters. */
export function analyticsTitle(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > MAX_TEXT ? `${line.slice(0, MAX_TEXT - 1)}…` : line;
}

/** A price in shekels, to the agora (89.99). */
export function priceIls(amount: Money): number {
  return Math.round(amount.amountMinor) / 100;
}
