import { amazonSource, ebayCredentials, parseServerEnv } from "@/config/env";

describe("parseServerEnv", () => {
  it("treats empty values from an unfilled .env template as unset", () => {
    const env = parseServerEnv({ DEEPL_API_KEY: "", UPSTASH_REDIS_REST_URL: "", ALIEXPRESS_APP_KEY: "" });
    expect(env.DEEPL_API_KEY).toBeUndefined();
    expect(env.UPSTASH_REDIS_REST_URL).toBeUndefined();
    expect(env.ALIEXPRESS_APP_KEY).toBeUndefined();
  });

  it("applies defaults", () => {
    expect(parseServerEnv({})).toMatchObject({
      NODE_ENV: "development",
      ONECART_DEMO_PROVIDERS: false,
      SEARCH_CACHE_TTL_SECONDS: 86_400,
    });
  });

  it("parses the demo flag and numeric TTL", () => {
    expect(parseServerEnv({ ONECART_DEMO_PROVIDERS: "true", SEARCH_CACHE_TTL_SECONDS: "60" })).toMatchObject({
      ONECART_DEMO_PROVIDERS: true,
      SEARCH_CACHE_TTL_SECONDS: 60,
    });
  });

  it("still rejects malformed values that are present", () => {
    expect(() => parseServerEnv({ UPSTASH_REDIS_REST_URL: "not a url" })).toThrow();
    expect(() => parseServerEnv({ ONECART_DEMO_PROVIDERS: "yes" })).toThrow();
  });
});

describe("ebayCredentials", () => {
  it("accepts eBay's portal names (App ID / Cert ID)", () => {
    expect(
      ebayCredentials(parseServerEnv({ EBAY_APP_ID: "app", EBAY_CERT_ID: "cert", EBAY_DEV_ID: "dev" })),
    ).toEqual({
      clientId: "app",
      clientSecret: "cert",
    });
  });

  it("accepts OAuth names and prefers them when both are set", () => {
    expect(
      ebayCredentials(
        parseServerEnv({
          EBAY_CLIENT_ID: "id",
          EBAY_CLIENT_SECRET: "secret",
          EBAY_APP_ID: "app",
          EBAY_CERT_ID: "cert",
        }),
      ),
    ).toEqual({ clientId: "id", clientSecret: "secret" });
  });

  it("is null unless both an id and a secret are present", () => {
    expect(ebayCredentials(parseServerEnv({ EBAY_APP_ID: "app" }))).toBeNull();
    expect(ebayCredentials(parseServerEnv({}))).toBeNull();
  });
});

describe("amazonSource", () => {
  const source = (vars: Record<string, string>) => amazonSource(parseServerEnv(vars));

  it("uses recorded responses everywhere but Vercel production, so development spends no quota", () => {
    expect(source({ SERPAPI_API_KEY: "k" })).toBe("recorded");
    expect(source({ SERPAPI_API_KEY: "k", NODE_ENV: "production" })).toBe("recorded");
    expect(source({ SERPAPI_API_KEY: "k", VERCEL_ENV: "preview" })).toBe("recorded");
    expect(source({ SERPAPI_API_KEY: "k", VERCEL_ENV: "production" })).toBe("live");
  });

  it("follows SERPAPI_MODE when set, and is off when live has no key", () => {
    expect(source({ SERPAPI_API_KEY: "k", SERPAPI_MODE: "live" })).toBe("live");
    expect(source({ VERCEL_ENV: "production", SERPAPI_MODE: "recorded" })).toBe("recorded");
    expect(source({ VERCEL_ENV: "production" })).toBe("off");
    expect(source({ SERPAPI_MODE: "recorded" })).toBe("recorded");
  });
});
