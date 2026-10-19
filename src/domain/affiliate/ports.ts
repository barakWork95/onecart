import type { Locale } from "@/domain/shared/locale";
import type { ProviderId } from "@/domain/shared/provider";

/** What the shopper saw on the link they clicked: recorded with the click. */
export interface ClickContext {
  /** The product title shown (at most 80 characters in a link). */
  readonly title: string;
  /** The landed total shown, in agorot; null when the link showed no price. */
  readonly priceAgorot: number | null;
  /** The cheapest offer of its comparison. */
  readonly bestDeal: boolean;
}

/** Where an outbound click should go, before affiliate tagging. */
export interface OutboundTarget {
  /** UnifiedProduct id, e.g. "amazon:B08KW1KR5H". */
  readonly id: string;
  readonly provider: ProviderId;
  /** The product's clean URL. */
  readonly url: string;
  /** Signed with the link; absent on store-search links and links made before it existed. */
  readonly context?: ClickContext;
}

/**
 * Turns a target into a tamper-proof `/go/...` href and back. `decode`
 * returns null for anything it didn't sign itself.
 */
export interface OutboundLinkCodec {
  encode(target: OutboundTarget): string;
  decode(id: string, params: Readonly<Record<string, string | undefined>>): OutboundTarget | null;
}

export interface AffiliateLink {
  readonly url: URL;
  /** false when we have no affiliate program configured for this store (link still works). */
  readonly affiliated: boolean;
}

/**
 * Wraps a clean store URL with our affiliate tracking. Async because some
 * stores (AliExpress) issue tracking links via API. Must not throw: on any
 * failure it returns the clean URL with `affiliated: false`.
 */
export interface AffiliateLinkBuilder {
  build(provider: ProviderId, cleanUrl: URL): Promise<AffiliateLink>;
}

export interface OutboundClick {
  readonly productId: string;
  readonly provider: ProviderId;
  readonly affiliated: boolean;
  readonly at: string;
  /** From the link's signed context; null/false for links without one. */
  readonly title: string | null;
  readonly priceAgorot: number | null;
  readonly bestDeal: boolean;
  /** The page's language (the link's unsigned `l`; anything else reads as English). */
  readonly locale: Locale;
}

/** Click analytics sink. Failures are caught and logged; they never reach the redirect. */
export interface ClickRecorder {
  record(click: OutboundClick): void | Promise<void>;
}

/** Outbound clicks for one store on one day (Israel time). */
export interface DailyStoreClicks {
  /** `YYYY-MM-DD` in Asia/Jerusalem. */
  readonly day: string;
  readonly provider: ProviderId;
  readonly clicks: number;
  /** How many of `clicks` carried our affiliate tag. */
  readonly affiliated: number;
}

/** Read side of the click log, for the internal report. */
export interface ClickStatsReader {
  /** Every day from `sinceDay` (inclusive, `YYYY-MM-DD`) that had a click. */
  dailyClicks(sinceDay: string): Promise<readonly DailyStoreClicks[]>;
}

/** A product's clicks over the last 30 days. */
export interface ProductClicks {
  readonly productId: string;
  readonly provider: ProviderId;
  /** The latest title it was clicked with; null for clicks made before titles were recorded. */
  readonly title: string | null;
  readonly clicks: number;
}

/** One recorded click, as the dashboard lists it. */
export interface RecordedClick {
  readonly at: string;
  readonly provider: ProviderId;
  readonly productId: string;
  readonly title: string | null;
  readonly priceAgorot: number | null;
  readonly bestDeal: boolean;
  readonly locale: Locale;
}

/** Read side of the click log for the analytics dashboard (service role). */
export interface ClickAnalyticsReader {
  /** The most-clicked products of the last 30 days, most first. */
  topProducts(limit: number): Promise<readonly ProductClicks[]>;
  /** The latest clicks, newest first. */
  recentClicks(limit: number): Promise<readonly RecordedClick[]>;
}
