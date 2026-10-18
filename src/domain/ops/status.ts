import type { IsoDateTime } from "@/domain/product/unified-product";

/** One quota: a store's own count, or one of our daily call budgets. */
export interface QuotaReading {
  /** e.g. "SerpApi searches this month (Amazon)". */
  readonly name: string;
  readonly used: number | null;
  readonly limit: number | null;
  readonly remaining: number | null;
  readonly resetsAt: IsoDateTime | null;
  /** Why it couldn't be read; null when it was. */
  readonly error: string | null;
}

/** A quota at zero: searches against it fail until it resets. */
export const isExhausted = (q: QuotaReading): boolean => q.remaining !== null && q.remaining <= 0;

export interface QuotaSource {
  /** Never throws: an unreadable quota is a reading with `error` set. */
  read(): Promise<readonly QuotaReading[]>;
}

export interface PushStats {
  readonly subscriptions: number;
  /** Subscriptions with at least one failed delivery in a row. */
  readonly failingSubscriptions: number;
  readonly alertsActive: number;
  readonly alertsTriggered: number;
  /** Triggered, not yet notified: should be ~0 after the daily run. */
  readonly alertsWaiting: number;
}

/** Database figures for the status page (service role). */
export interface OpsStats {
  /** Rows recorded per Israeli day, for each day given. */
  priceObservationsByDay(days: readonly string[]): Promise<readonly { day: string; count: number }[]>;
  push(): Promise<PushStats>;
}
