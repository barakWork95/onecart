/**
 * Shared hit counters for rate limiting. `increment` adds one and returns the
 * new count; the key expires after `ttlSeconds`. `count` reads without adding
 * (0 for a missing or expired key). May throw on infrastructure failure;
 * limiters fail open (allow) rather than block shoppers.
 */
export interface CounterStore {
  increment(key: string, ttlSeconds: number): Promise<number>;
  count(key: string): Promise<number>;
}
