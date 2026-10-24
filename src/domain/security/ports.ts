/** One counter key and the expiry it starts with on its first hit. */
export interface CounterSlot {
  readonly key: string;
  readonly ttlSeconds: number;
}

/**
 * Shared hit counters for rate limiting. `increment` adds one and returns the
 * new count; the key expires after `ttlSeconds`. `count` reads without adding
 * (0 for a missing or expired key). May throw on infrastructure failure;
 * limiters fail open (allow) rather than block shoppers.
 */
export interface CounterStore {
  increment(key: string, ttlSeconds: number): Promise<number>;
  /** Several keys in one round trip (one billed command on Upstash): new counts in order. */
  incrementMany(slots: readonly CounterSlot[]): Promise<number[]>;
  count(key: string): Promise<number>;
}
