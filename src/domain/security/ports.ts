/**
 * Shared hit counters for rate limiting. `increment` adds one and returns the
 * new count; the key expires after `ttlSeconds`. May throw on infrastructure
 * failure; limiters fail open (allow) rather than block shoppers.
 */
export interface CounterStore {
  increment(key: string, ttlSeconds: number): Promise<number>;
}
