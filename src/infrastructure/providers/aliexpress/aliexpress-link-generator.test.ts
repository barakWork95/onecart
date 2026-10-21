import { createInMemoryRedis } from "@/infrastructure/cache/in-memory-redis";
import type { RedisLike } from "@/infrastructure/cache/redis-client";
import {
  createAliExpressLinkGenerator,
  promotionLinkKey,
  type AliExpressLinkGeneratorConfig,
} from "@/infrastructure/providers/aliexpress/aliexpress-link-generator";
import { signAliExpressParams } from "@/infrastructure/providers/aliexpress/aliexpress-signer";
import linkGenerateOk from "./fixtures/link-generate-ok.json";

const SOURCE = new URL("https://www.aliexpress.com/item/1005006271234567.html");
const PROMOTION = "https://s.click.aliexpress.com/e/_DmLifeP3";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function setup(
  respond: (url: URL) => Promise<Response>,
  overrides: Partial<AliExpressLinkGeneratorConfig> = {},
) {
  const fetchMock = jest.fn((input: RequestInfo | URL) => respond(new URL(String(input))));
  const logger = { warn: jest.fn() };
  const cache = createInMemoryRedis();
  const generator = createAliExpressLinkGenerator({
    appKey: "12345",
    appSecret: "s3cr3t",
    trackingId: "onecart",
    cache,
    fetch: fetchMock,
    now: () => new Date("2026-10-11T09:00:00.000Z"),
    logger,
    ...overrides,
  });
  return { generator, fetchMock, logger, cache };
}

const response = (links: unknown[], respCode = 200) => ({
  aliexpress_affiliate_link_generate_response: {
    resp_result: {
      resp_code: respCode,
      result: { total_result_count: links.length, promotion_links: { promotion_link: links } },
    },
  },
});

describe("createAliExpressLinkGenerator", () => {
  it("requests a signed promotion link for the clean URL with our tracking id", async () => {
    const { generator, fetchMock } = setup(async () => json(linkGenerateOk));
    expect((await generator.generate(SOURCE))?.toString()).toBe(PROMOTION);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const { sign, ...signed } = Object.fromEntries(url.searchParams);
    expect(signed).toMatchObject({
      method: "aliexpress.affiliate.link.generate",
      promotion_link_type: "0",
      source_values: SOURCE.toString(),
      tracking_id: "onecart",
      app_key: "12345",
      sign_method: "md5",
    });
    expect(sign).toBe(signAliExpressParams(signed, "s3cr3t"));
  });

  it("caches generated links so repeat clicks don't call the API", async () => {
    const { generator, fetchMock, cache } = setup(async () => json(linkGenerateOk));
    await generator.generate(SOURCE);
    await generator.generate(SOURCE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await cache.get(promotionLinkKey("onecart", SOURCE.toString()))).toBe(PROMOTION);
  });

  it("accepts a single link without a source_value", async () => {
    const { generator } = setup(async () => json(response([{ promotion_link: PROMOTION }])));
    expect((await generator.generate(SOURCE))?.toString()).toBe(PROMOTION);
  });

  it("picks the link whose source_value matches when several are returned", async () => {
    const { generator } = setup(async () =>
      json(
        response([
          {
            promotion_link: "https://s.click.aliexpress.com/e/_other",
            source_value: "https://www.aliexpress.com/item/1.html",
          },
          { promotion_link: PROMOTION, source_value: SOURCE.toString() },
        ]),
      ),
    );
    expect((await generator.generate(SOURCE))?.toString()).toBe(PROMOTION);
  });

  it.each([
    ["no links", response([])],
    [
      "ambiguous links",
      response([{ promotion_link: "https://a.example/1" }, { promotion_link: "https://a.example/2" }]),
    ],
    ["a non-200 resp_code", response([{ promotion_link: PROMOTION }], 405)],
    ["an unparseable link", response([{ promotion_link: "not a url", source_value: SOURCE.toString() }])],
    ["an unexpected shape", { surprise: true }],
  ])("returns null for %s", async (_label, body) => {
    const { generator, logger, cache } = setup(async () => json(body));
    expect(await generator.generate(SOURCE)).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
    expect(await cache.get(promotionLinkKey("onecart", SOURCE.toString()))).toBeNull();
  });

  it("returns null on gateway errors and timeouts", async () => {
    const gateway = setup(async () =>
      json({ error_response: { code: "InvalidSignature", msg: "bad sign" } }),
    );
    expect(await gateway.generator.generate(SOURCE)).toBeNull();
    expect(gateway.logger.warn).toHaveBeenCalledWith("aliexpress-link: generation failed", {
      code: "GATEWAY_InvalidSignature",
      detail: "bad sign",
    });

    const slow = setup(() => new Promise<Response>(() => undefined), {
      timeoutMs: 5,
      fetch: (_i, init) =>
        new Promise<Response>((_r, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
        ),
    });
    expect(await slow.generator.generate(SOURCE)).toBeNull();
  });

  it("keeps working when the cache is down", async () => {
    const broken: RedisLike = {
      get: () => Promise.reject(new Error("x")),
      mget: () => Promise.reject(new Error("x")),
      set: () => Promise.reject(new Error("x")),
    };
    const { generator, logger } = setup(async () => json(linkGenerateOk), { cache: broken });
    expect((await generator.generate(SOURCE))?.toString()).toBe(PROMOTION);
    expect(logger.warn).toHaveBeenCalledWith("aliexpress-link: cache read failed", expect.anything());
    expect(logger.warn).toHaveBeenCalledWith("aliexpress-link: cache write failed", expect.anything());
  });

  it("ignores a corrupt cached value", async () => {
    const { generator, fetchMock, cache } = setup(async () => json(linkGenerateOk));
    await cache.set(promotionLinkKey("onecart", SOURCE.toString()), "not a url", { ex: 60 });
    expect((await generator.generate(SOURCE))?.toString()).toBe(PROMOTION);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("works with the default logger", async () => {
    const generator = createAliExpressLinkGenerator({
      appKey: "k",
      appSecret: "s",
      trackingId: "t",
      cache: createInMemoryRedis(),
      fetch: async () => json({}),
    });
    expect(await generator.generate(SOURCE)).toBeNull();
  });
});
