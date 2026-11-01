import "server-only";

import sharp, { type OutputInfo } from "sharp";
import type { ImageHash } from "@/domain/matching/image-hash";

/** Photos are shrunk to fit this first: nearly all the cost of hashing is decoding the full image. */
const SHRINK_TO_PX = 128;
const trimmed = { threshold: 12 } as const;

/**
 * dHash (v2 of `imageHashKey`): shrink to 9×8 greyscale, then one bit per pixel for
 * "brighter than its right-hand neighbour". Robust to resizing, recompression
 * and brightness: what differs between two sellers' copies of one supplier
 * photo. Uniform borders are trimmed first (resellers pad photos onto white
 * squares), after a first shrink that makes this about 7× cheaper: on a serverless
 * CPU, 12 photos at once took seconds. Changing any step changes the hashes:
 * bump the key's version and recalibrate (`generic-recorded.test.ts`).
 */
export async function dHash(image: Buffer): Promise<ImageHash> {
  const shrunk = await sharp(image, { failOn: "error" })
    .flatten({ background: "#ffffff" })
    .resize(SHRINK_TO_PX, SHRINK_TO_PX, { fit: "inside", withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raw = (pixels: { data: Buffer; info: OutputInfo }) =>
    sharp(pixels.data, {
      raw: { width: pixels.info.width, height: pixels.info.height, channels: pixels.info.channels },
    });
  let pipeline = raw(shrunk);
  try {
    // trim() throws on a uniform image; then hash it as it is.
    pipeline = raw(await raw(shrunk).trim(trimmed).raw().toBuffer({ resolveWithObject: true }));
  } catch {
    // keep the untrimmed pixels
  }
  const { data } = await pipeline
    .greyscale()
    .resize(9, 8, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let hex = "";
  for (let y = 0; y < 8; y++) {
    let row = 0n;
    for (let x = 0; x < 8; x++) {
      const bit = (data[y * 9 + x] ?? 0) < (data[y * 9 + x + 1] ?? 0) ? 1n : 0n;
      row = (row << 1n) | bit;
    }
    hex += row.toString(16).padStart(2, "0");
  }
  return hex;
}
