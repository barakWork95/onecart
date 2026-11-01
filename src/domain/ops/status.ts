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
  /** Warn once this share is used (e.g. 0.8). Unset: only "none left" alerts. */
  readonly warnAtShare?: number;
  /** An error reading this quota means an outage worth alerting (Redis down), not just a blind spot. */
  readonly alertOnError?: boolean;
}

/** A quota at zero: searches against it fail until it resets. */
export const isExhausted = (q: QuotaReading): boolean => q.remaining !== null && q.remaining <= 0;

/** Past its warning share but not yet at zero (only for quotas that set `warnAtShare`). */
export const isNearlyExhausted = (q: QuotaReading): boolean =>
  q.warnAtShare !== undefined &&
  q.used !== null &&
  q.limit !== null &&
  q.limit > 0 &&
  !isExhausted(q) &&
  q.used / q.limit >= q.warnAtShare;

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
