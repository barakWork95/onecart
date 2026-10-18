/**
 * A perceptual hash of a product photo: 64 bits as 16 lower-case hex digits.
 * Copies of one supplier photo (resized, recompressed, padded) hash within a
 * few bits; unrelated photos differ in about half of them.
 */
export type ImageHash = string;

export function isImageHash(value: unknown): value is ImageHash {
  return typeof value === "string" && /^[0-9a-f]{16}$/.test(value);
}

const POPCOUNT = Array.from(
  { length: 16 },
  (_, n) => (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1) + ((n >> 3) & 1),
);

/** Bits that differ between two hashes, 0–64. */
export function hammingDistance(a: ImageHash, b: ImageHash): number {
  let distance = 0;
  for (let i = 0; i < 16; i++) distance += POPCOUNT[parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16)] ?? 0;
  return distance;
}

/** Hashes for image URLs: read the cache during searches, compute only in the warm-up. */
export interface ImageHashIndex {
  /** Cached hashes only, never a download (safe on a shopper's search). */
  cached(urls: readonly string[]): Promise<ReadonlyMap<string, ImageHash>>;
  /** Downloads and hashes what isn't cached yet (warm-up only); how many were added. */
  ensure(urls: readonly string[]): Promise<number>;
}
