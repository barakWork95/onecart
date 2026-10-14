import { generateVAPIDKeys } from "web-push";
import { amazonSource, ebayCredentials, parseServerEnv, webPushConfig } from "@/config/env";

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

describe("Redis credentials", () => {
  const redis = (vars: Record<string, string>) => {
    const { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } = parseServerEnv(vars);
    return { url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN };
  };

  it("uses Vercel Storage's KV_REST_API_* names when UPSTASH_REDIS_REST_* aren't set", () => {
    expect(
      redis({
        KV_REST_API_URL: "https://onecart-redis.upstash.io",
        KV_REST_API_TOKEN: "kv-token",
        KV_URL: "rediss://x",
      }),
    ).toEqual({ url: "https://onecart-redis.upstash.io", token: "kv-token" });
  });

  it("prefers a complete UPSTASH_REDIS_REST_* pair", () => {
    expect(
      redis({
        UPSTASH_REDIS_REST_URL: "https://explicit.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "explicit",
        KV_REST_API_URL: "https://kv.upstash.io",
        KV_REST_API_TOKEN: "kv",
      }),
    ).toEqual({ url: "https://explicit.upstash.io", token: "explicit" });
  });

  it("never mixes a URL from one naming with a token from the other", () => {
    expect(
      redis({
        UPSTASH_REDIS_REST_URL: "https://explicit.upstash.io",
        KV_REST_API_URL: "https://kv.upstash.io",
        KV_REST_API_TOKEN: "kv",
      }),
    ).toEqual({ url: "https://kv.upstash.io", token: "kv" });
    expect(redis({ KV_REST_API_URL: "https://kv.upstash.io" })).toEqual({ url: undefined, token: undefined });
  });
});

describe("CONTACT_EMAIL", () => {
  const contact = (value: string | undefined) => parseServerEnv({ CONTACT_EMAIL: value }).CONTACT_EMAIL;

  it("accepts an address, trimming what a paste may add", () => {
    expect(contact("owner@onecartapp.com")).toBe("owner@onecartapp.com");
    expect(contact("  owner@onecartapp.com \n")).toBe("owner@onecartapp.com");
  });

  it("drops an empty or malformed value instead of failing the whole config", () => {
    expect(contact(undefined)).toBeUndefined();
    expect(contact("")).toBeUndefined();
    expect(contact("not-an-email")).toBeUndefined();
    expect(() => parseServerEnv({ CONTACT_EMAIL: "owner@" })).not.toThrow();
  });
});

describe("webPushConfig", () => {
  // A real pair from web-push itself, so the format checks can't drift from what it generates.
  const { publicKey, privateKey } = generateVAPIDKeys();
  const full = {
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: publicKey,
    VAPID_PRIVATE_KEY: privateKey,
    VAPID_SUBJECT: "mailto:alerts@onecartapp.com",
  };

  it("is on only with all three settings", () => {
    expect(webPushConfig(parseServerEnv(full))).toEqual({
      publicKey,
      privateKey,
      subject: "mailto:alerts@onecartapp.com",
    });
    expect(webPushConfig(parseServerEnv({ ...full, VAPID_SUBJECT: "" }))).toBeNull();
    expect(webPushConfig(parseServerEnv({}))).toBeNull();
  });

  it("rejects keys that aren't base64url VAPID keys, and a bare subject", () => {
    expect(() => parseServerEnv({ ...full, VAPID_PRIVATE_KEY: "not a key" })).toThrow();
    expect(() => parseServerEnv({ ...full, NEXT_PUBLIC_VAPID_PUBLIC_KEY: privateKey })).toThrow();
    expect(() => parseServerEnv({ ...full, VAPID_SUBJECT: "alerts@onecartapp.com" })).toThrow();
    expect(
      webPushConfig(parseServerEnv({ ...full, VAPID_SUBJECT: "https://www.onecartapp.com" })),
    ).not.toBeNull();
  });
});
