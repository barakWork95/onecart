import type { RedisLike } from "@/infrastructure/cache/redis-client";

/**
 * The only keys kept in memory: values that are written once and read many
 * times (search results, translations, photo hashes, affiliate links), where a
 * minute-old copy is as good as Redis's. Everything else (rate-limit and budget
 * counters, circuit breakers, ops state) is shared state that every instance
 * must see exactly, so it always goes to Redis, whatever this wrapper is given.
 */
export const MEMORY_CACHED_PREFIXES = ["search:", "translate:", "img:dhash:", "aff:aliexpress:"] as const;

const isMemoryCached = (key: string) => MEMORY_CACHED_PREFIXES.some((prefix) => key.startsWith(prefix));

export interface MemoryCacheOptions {
  /** How long a value is answered from memory before Redis is asked again. */
  readonly ttlMs?: number;
  /** Entries kept per instance; the least recently used goes first. */
  readonly maxEntries?: number;
  readonly now?: () => number;
}

/**
 * A per-instance memory cache in front of Redis for read-only keys (see
 * `MEMORY_CACHED_PREFIXES`): repeat reads within `ttlMs` cost no Redis command.
 * Misses are never remembered (another instance may write the key a moment
 * later), and writes go through to Redis. Values are kept as JSON and parsed on
 * every read, so callers get their own copy, exactly as from Upstash.
 */
export function withMemoryCache(inner: RedisLike, options: MemoryCacheOptions = {}): RedisLike {
  const ttlMs = options.ttlMs ?? 60_000;
  const maxEntries = options.maxEntries ?? 200;
  const now = options.now ?? Date.now;
  const entries = new Map<string, { json: string; atMs: number }>();

  function read(key: string): { value: unknown } | null {
    const entry = entries.get(key);
    if (!entry) return null;
    entries.delete(key);
    if (now() - entry.atMs >= ttlMs) return null;
    entries.set(key, entry); // most recently used last
    return { value: JSON.parse(entry.json) };
  }

  function remember(key: string, value: unknown) {
    if (value === null || value === undefined || !isMemoryCached(key)) return;
    entries.delete(key);
    entries.set(key, { json: JSON.stringify(value), atMs: now() });
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
  }

  return {
    async get<T>(key: string) {
      const held = isMemoryCached(key) ? read(key) : null;
      if (held) return held.value as T;
      const value = await inner.get<T>(key);
      remember(key, value);
      return value;
    },

    async mget<T>(keys: readonly string[]) {
      const held = keys.map((key) => (isMemoryCached(key) ? read(key) : null));
      const missing = [...new Set(keys.filter((_, i) => !held[i]))];
      const fetched = new Map<string, T | null>();
      if (missing.length > 0) {
        const values = await inner.mget<T>(missing);
        missing.forEach((key, i) => {
          fetched.set(key, values[i] ?? null);
          remember(key, values[i]);
        });
      }
      return keys.map((key, i) => (held[i] ? (held[i].value as T) : (fetched.get(key) ?? null)));
    },

    async set(key, value, opts) {
      const result = await inner.set(key, value, opts);
      remember(key, value);
      return result;
    },
  };
}
