import "server-only";

import { createHash } from "node:crypto";
import { isImageHash, type ImageHash, type ImageHashIndex } from "@/domain/matching/image-hash";
import type { RedisLike } from "@/infrastructure/cache/redis-client";

/** Image URLs are long; the key holds a digest. Bump v1 if the hash algorithm changes. */
export const imageHashKey = (url: string) =>
  `img:dhash:v1:${createHash("sha256").update(url).digest("base64url")}`;
const HASH_TTL = 30 * 24 * 60 * 60;
/** An image that couldn't be hashed is tried again tomorrow, not on every run. */
const FAILED_TTL = 24 * 60 * 60;
const FAILED = "unhashable";

export interface ImageHashIndexDeps {
  readonly redis: RedisLike;
  /** Downloads and hashes one image; null when it can't. */
  readonly hashImage: (url: string) => Promise<ImageHash | null>;
  /** Downloads at once in `ensure`. */
  readonly concurrency?: number;
}

/** Photo hashes cached in Redis per image URL (see `ImageHashIndex`). */
export function createRedisImageHashIndex(deps: ImageHashIndexDeps): ImageHashIndex {
  const concurrency = deps.concurrency ?? 6;

  async function lookup(urls: readonly string[]) {
    const unique = [...new Set(urls)];
    // One MGET, not a GET per photo: a generic search or showcase looks up dozens at once.
    const values = await deps.redis.mget<unknown>(unique.map(imageHashKey));
    return unique.map((url, i) => ({ url, value: values[i] }));
  }

  return {
    async cached(urls) {
      const found = new Map<string, ImageHash>();
      for (const { url, value } of await lookup(urls)) if (isImageHash(value)) found.set(url, value);
      return found;
    },

    async ensure(urls) {
      const missing = (await lookup(urls))
        .filter(({ value }) => value === null || value === undefined)
        .map((r) => r.url);
      let added = 0;
      let next = 0;
      const worker = async () => {
        while (next < missing.length) {
          const url = missing[next++]!;
          const hash = await deps.hashImage(url);
          await deps.redis.set(imageHashKey(url), hash ?? FAILED, { ex: hash ? HASH_TTL : FAILED_TTL });
          if (hash) added++;
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, worker));
      return added;
    },
  };
}
