import "server-only";

import sharp from "sharp";
import type { ImageHash } from "@/domain/matching/image-hash";

/**
 * dHash: shrink to 9×8 greyscale, then one bit per pixel for "brighter than
 * its right-hand neighbour". Robust to resizing, recompression and brightness:
 * what differs between two sellers' copies of one supplier photo. Uniform
 * borders are trimmed first (resellers pad photos onto white squares).
 */
export async function dHash(image: Buffer): Promise<ImageHash> {
  let pipeline = sharp(image, { failOn: "error" }).flatten({ background: "#ffffff" });
  try {
    // trim() throws on a uniform image; then hash it as it is.
    const trimmed = await pipeline.clone().trim({ threshold: 12 }).toBuffer();
    pipeline = sharp(trimmed);
  } catch {
    // keep the untrimmed pipeline
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
