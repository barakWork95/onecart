import { createUpstashRedis, upstashRedisLike } from "@/infrastructure/cache/upstash";

describe("createUpstashRedis", () => {
  it("returns null when Upstash isn't configured", () => {
    expect(createUpstashRedis({})).toBeNull();
    expect(createUpstashRedis({ UPSTASH_REDIS_REST_URL: "https://x.upstash.io" })).toBeNull();
  });

  it("creates a client when configured (no network on construction)", () => {
    const redis = createUpstashRedis({
      UPSTASH_REDIS_REST_URL: "https://x.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "t",
    });
    expect(redis).not.toBeNull();
    expect(typeof redis?.get).toBe("function");
  });
});

describe("upstashRedisLike", () => {
  const fakeClient = () => ({
    get: jest.fn(),
    set: jest.fn(),
    mget: jest.fn(async (...keys: string[]) => keys.map((k) => (k.startsWith("hit") ? k : null))),
  });

  it("reads many keys in one MGET per 100, keeping their order", async () => {
    const client = fakeClient();
    const redis = upstashRedisLike(client);
    const keys = Array.from({ length: 250 }, (_, i) => (i % 2 ? `hit-${i}` : `miss-${i}`));
    const values = await redis.mget(keys);
    expect(client.mget).toHaveBeenCalledTimes(3);
    expect(values).toHaveLength(250);
    expect(values[1]).toBe("hit-1");
    expect(values[248]).toBeNull();
    expect(values[249]).toBe("hit-249");
  });

  it("sends nothing for no keys", async () => {
    const client = fakeClient();
    expect(await upstashRedisLike(client).mget([])).toEqual([]);
    expect(client.mget).not.toHaveBeenCalled();
  });
});
