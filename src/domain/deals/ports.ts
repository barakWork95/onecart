import type { DailyPrice } from "@/domain/deals/price-drop";
import type { IsoDateTime } from "@/domain/product/unified-product";
import type { Money } from "@/domain/shared/money";
import type { ProviderId } from "@/domain/shared/provider";

/** A product's landed price as the daily warm-up saw it. */
export interface PriceObservation {
  readonly productId: string;
  readonly provider: ProviderId;
  /** Israeli day, `YYYY-MM-DD`. */
  readonly day: string;
  readonly totalMinor: number;
  readonly itemMinor: number;
  /** The warmed search that found it. */
  readonly query: string;
  readonly title: string;
}

/** Our own price history: written by the cron only, one row per product per day. */
export interface PriceHistoryStore {
  /** Upserts: a second observation of a product on the same day replaces the first. */
  record(observations: readonly PriceObservation[]): Promise<void>;
  /** Every recorded day from `sinceDay` (inclusive) for these products. */
  history(
    productIds: readonly string[],
    sinceDay: string,
  ): Promise<readonly (DailyPrice & { readonly productId: string })[]>;
  /** Deletes days before `beforeDay`. */
  prune(beforeDay: string): Promise<void>;
}

/** A homepage "Price drops" card, ready to render (prices in ILS). */
export interface PriceDropCard {
  readonly productId: string;
  readonly provider: ProviderId;
  readonly title: string;
  readonly imageUrl: string | null;
  /** The clean store URL; the page signs a /go link for it. */
  readonly productUrl: string;
  /** The warmed search that found it: the card's "compare" link. */
  readonly query: string;
  readonly current: Money;
  readonly typical: Money;
  readonly dropShare: number;
  readonly historyDays: number;
  readonly observedAt: IsoDateTime;
}

/** Where the cron leaves today's drops for the homepage to read (cache only). */
export interface PriceDropBoard {
  save(cards: readonly PriceDropCard[]): Promise<void>;
  load(): Promise<readonly PriceDropCard[]>;
}
