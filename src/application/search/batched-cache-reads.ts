import type { CachedProviderResult, SearchResultCache } from "@/domain/search/ports";

/**
 * Reads issued in the same tick go out as one `getMany` (one MGET on Redis):
 * a search reads every store's page at once, so its reads cost one command,
 * not one per store. A failed batch fails each of its reads.
 */
export function batchCacheReads(
  cache: SearchResultCache,
): (key: string) => Promise<CachedProviderResult | null> {
  type Pending = {
    readonly key: string;
    readonly resolve: (value: CachedProviderResult | null) => void;
    readonly reject: (error: unknown) => void;
  };
  let pending: Pending[] = [];

  async function flush() {
    const batch = pending;
    pending = [];
    try {
      const values = await cache.getMany(batch.map((p) => p.key));
      batch.forEach((p, i) => p.resolve(values[i] ?? null));
    } catch (error) {
      for (const p of batch) p.reject(error);
    }
  }

  return (key) =>
    new Promise((resolve, reject) => {
      if (pending.length === 0) queueMicrotask(() => void flush());
      pending.push({ key, resolve, reject });
    });
}
