import type { RedisLike } from "@/infrastructure/cache/redis-client";
import { createInMemoryRedis } from "@/infrastructure/cache/in-memory-redis";
import { fetchImage, isAllowedImageUrl, MAX_IMAGE_BYTES } from "@/infrastructure/images/image-fetcher";
import { createRedisImageHashIndex, imageHashKey } from "@/infrastructure/images/redis-image-hash-index";

describe("isAllowedImageUrl", () => {
  it.each([
    ["https://ae-pic-a1.aliexpress-media.com/kf/S8dea.jpg", true],
    ["https://ae01.alicdn.com/kf/S8a1.jpg", true],
    ["https://i.ebayimg.com/images/g/abc/s-l500.jpg", true],
    ["https://m.media-amazon.com/images/I/61O3.jpg", true],
    ["https://evil.example/x.jpg", false],
    ["https://i.ebayimg.com.evil.example/x.jpg", false],
    ["http://i.ebayimg.com/x.jpg", false],
    ["https://i.ebayimg.com:8443/x.jpg", false],
    ["not a url", false],
  ])("%p → %p", (url, allowed) => expect(isAllowedImageUrl(url)).toBe(allowed));
});

describe("fetchImage", () => {
  const image = (body: BodyInit, type = "image/jpeg", status = 200, headers: Record<string, string> = {}) =>
    jest.fn(async () => new Response(body, { status, headers: { "content-type": type, ...headers } }));

  it("returns an allowed image's bytes", async () => {
    const doFetch = image("jpegbytes");
    expect((await fetchImage("https://i.ebayimg.com/x.jpg", doFetch))?.toString()).toBe("jpegbytes");
  });

  it("refuses other hosts, non-images, errors, oversized bodies and failures", async () => {
    expect(await fetchImage("https://evil.example/x.jpg", image("x"))).toBeNull();
    expect(await fetchImage("https://i.ebayimg.com/x.jpg", image("<html>", "text/html"))).toBeNull();
    expect(await fetchImage("https://i.ebayimg.com/x.jpg", image("x", "image/jpeg", 404))).toBeNull();
    expect(
      await fetchImage(
        "https://i.ebayimg.com/x.jpg",
        image("x", "image/jpeg", 200, { "content-length": String(MAX_IMAGE_BYTES + 1) }),
      ),
    ).toBeNull();
    expect(
      await fetchImage("https://i.ebayimg.com/x.jpg", image(new Uint8Array(MAX_IMAGE_BYTES + 1))),
    ).toBeNull();
    expect(
      await fetchImage("https://i.ebayimg.com/x.jpg", () => Promise.reject(new Error("timeout"))),
    ).toBeNull();
  });
});

describe("createRedisImageHashIndex", () => {
  it("reads every photo's hash in one batched read, never one GET per photo", async () => {
    const redis = createInMemoryRedis();
    const spied = { ...redis, get: jest.spyOn(redis, "get"), mget: jest.spyOn(redis, "mget") };
    const client: RedisLike = redis;
    const index = createRedisImageHashIndex({ redis: client, hashImage: async () => "00ff00ff00ff00ff" });
    const urls = Array.from({ length: 60 }, (_, i) => `https://i.ebayimg.com/${i}.jpg`);
    await index.ensure(urls.slice(0, 10));
    spied.mget.mockClear();

    const found = await index.cached(urls);
    expect(found.size).toBe(10);
    expect(spied.mget).toHaveBeenCalledTimes(1);
    expect(spied.get).not.toHaveBeenCalled();
  });

  it("hashes only what's missing, caches results, and never downloads on a cache read", async () => {
    const redis = createInMemoryRedis();
    const hashImage = jest.fn(async (url: string) => (url.endsWith("bad.jpg") ? null : "00ff00ff00ff00ff"));
    const index = createRedisImageHashIndex({ redis, hashImage, concurrency: 2 });
    const urls = [
      "https://i.ebayimg.com/a.jpg",
      "https://i.ebayimg.com/b.jpg",
      "https://i.ebayimg.com/bad.jpg",
      "https://i.ebayimg.com/a.jpg",
    ];

    expect(await index.cached(urls)).toEqual(new Map());
    expect(await index.ensure(urls)).toBe(2);
    expect(hashImage).toHaveBeenCalledTimes(3);
    expect(await index.cached(urls)).toEqual(
      new Map([
        ["https://i.ebayimg.com/a.jpg", "00ff00ff00ff00ff"],
        ["https://i.ebayimg.com/b.jpg", "00ff00ff00ff00ff"],
      ]),
    );
    // Cached hashes and remembered failures aren't fetched again.
    expect(await index.ensure(urls)).toBe(0);
    expect(hashImage).toHaveBeenCalledTimes(3);
    expect(await redis.get(imageHashKey("https://i.ebayimg.com/bad.jpg"))).toBe("unhashable");
  });
});
