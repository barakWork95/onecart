/**
 * The slice of `@upstash/redis`'s `Redis` we use. Depending on this instead of
 * the SDK class keeps adapters testable with a plain fake. Upstash serializes
 * values to JSON on `set` and parses them on `get`.
 */
export interface RedisLike {
  get<T>(key: string): Promise<T | null>;
  /** Many keys in one round trip (Upstash bills one command per MGET): values in key order. */
  mget<T>(keys: readonly string[]): Promise<(T | null)[]>;
  set(key: string, value: unknown, options: { ex: number }): Promise<unknown>;
}
