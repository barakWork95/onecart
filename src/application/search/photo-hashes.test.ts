import { photoHashesFor } from "@/application/search/photo-hashes";
import { searchIntent } from "@/domain/search/search-intent";
import { makeProduct } from "@/test/product-factory";

const GENERIC = searchIntent("cable clips");
const withPhoto = makeProduct({ sku: "1", title: "Cable Clip" });
const noPhoto = makeProduct({ sku: "2", title: "Cable Clip", imageUrl: null });

describe("photoHashesFor", () => {
  it("reads the cached hashes of a generic search's photos", async () => {
    const found = new Map([[withPhoto.imageUrl!, "e0b2b6969e9c9c9c"]]);
    const cached = jest.fn(() => Promise.resolve(found));
    expect(await photoHashesFor({ cached }, [withPhoto, noPhoto], GENERIC)).toBe(found);
    expect(cached).toHaveBeenCalledWith([withPhoto.imageUrl]);
  });

  it("skips the lookup with no reader, a branded search, or no photos", async () => {
    const cached = jest.fn(() => Promise.resolve(new Map<string, string>()));
    expect(await photoHashesFor(undefined, [withPhoto], GENERIC)).toBeUndefined();
    expect(await photoHashesFor({ cached }, [withPhoto], searchIntent("anker 737"))).toBeUndefined();
    expect(await photoHashesFor({ cached }, [noPhoto], GENERIC)).toBeUndefined();
    expect(cached).not.toHaveBeenCalled();
  });

  it("treats a failed lookup as no hashes, logging why", async () => {
    const logger = { warn: jest.fn() };
    expect(
      await photoHashesFor({ cached: () => Promise.reject("nope") }, [withPhoto], GENERIC, logger),
    ).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("photo hash lookup failed"), {
      error: "nope",
    });
    // The default logger is silent.
    expect(
      await photoHashesFor({ cached: () => Promise.reject(new Error("x")) }, [withPhoto], GENERIC),
    ).toBeUndefined();
  });
});
