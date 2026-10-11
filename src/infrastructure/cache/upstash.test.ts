import { createUpstashRedis } from "@/infrastructure/cache/upstash";

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
