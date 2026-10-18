import sharp from "sharp";
import { hammingDistance } from "@/domain/matching/image-hash";
import { dHash } from "@/infrastructure/images/dhash";

/** A synthetic "product photo": coloured shapes on white, drawn with SVG. */
async function photo(shapes: string, size = 500): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 500 500">
    <rect width="500" height="500" fill="white"/>${shapes}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const PEELER =
  '<rect x="60" y="200" width="380" height="60" rx="30" fill="#3355aa"/><circle cx="120" cy="230" r="70" fill="#dd8833"/><rect x="300" y="120" width="40" height="220" fill="#222"/>';
const CHOPPER =
  '<rect x="150" y="80" width="200" height="340" rx="20" fill="#11aa55"/><circle cx="250" cy="160" r="40" fill="#aa1133"/><rect x="60" y="380" width="380" height="40" fill="#555"/>';

describe("dHash", () => {
  it("gives copies of one photo nearly the same hash, and a different photo a far one", async () => {
    const original = await dHash(await photo(PEELER));
    expect(original).toMatch(/^[0-9a-f]{16}$/);
    // Same supplier photo, re-uploaded smaller.
    expect(hammingDistance(original, await dHash(await photo(PEELER, 220)))).toBeLessThanOrEqual(4);
    // Recompressed as a lossy JPEG.
    const jpeg = await sharp(await photo(PEELER))
      .jpeg({ quality: 40 })
      .toBuffer();
    expect(hammingDistance(original, await dHash(jpeg))).toBeLessThanOrEqual(6);
    // Padded onto a bigger white square (trimmed away before hashing).
    const padded = await sharp(await photo(PEELER))
      .extend({ top: 150, bottom: 150, left: 150, right: 150, background: "#ffffff" })
      .png()
      .toBuffer();
    expect(hammingDistance(original, await dHash(padded))).toBeLessThanOrEqual(6);
    // A different product.
    expect(hammingDistance(original, await dHash(await photo(CHOPPER)))).toBeGreaterThanOrEqual(16);
  });

  it("hashes a uniform image instead of failing on the trim", async () => {
    const blank = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#ffffff" } })
      .png()
      .toBuffer();
    expect(await dHash(blank)).toBe("0000000000000000");
  });

  it("rejects bytes that aren't an image", async () => {
    await expect(dHash(Buffer.from("not an image"))).rejects.toThrow();
  });
});
