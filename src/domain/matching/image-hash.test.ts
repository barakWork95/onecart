import { hammingDistance, isImageHash } from "@/domain/matching/image-hash";

describe("image hashes", () => {
  it("counts differing bits between two 64-bit hashes", () => {
    expect(hammingDistance("0000000000000000", "0000000000000000")).toBe(0);
    expect(hammingDistance("0000000000000000", "0000000000000001")).toBe(1);
    expect(hammingDistance("ffffffffffffffff", "0000000000000000")).toBe(64);
    expect(hammingDistance("f0f0f0f0f0f0f0f0", "0f0f0f0f0f0f0f0f")).toBe(64);
    expect(hammingDistance("8000000000000000", "0000000000000000")).toBe(1);
  });

  it("knows a valid hash: 16 lower-case hex digits", () => {
    expect(isImageHash("00ff00ff00ff00ff")).toBe(true);
    expect(isImageHash("00FF00FF00FF00FF")).toBe(false);
    expect(isImageHash("00ff")).toBe(false);
    expect(isImageHash(null)).toBe(false);
  });
});
