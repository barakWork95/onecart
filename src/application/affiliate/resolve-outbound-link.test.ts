import {
  createResolveOutboundLink,
  type ResolveOutboundLinkDeps,
} from "@/application/affiliate/resolve-outbound-link";
import type { AffiliateLinkBuilder, OutboundLinkCodec, OutboundTarget } from "@/domain/affiliate/ports";

const TARGET: OutboundTarget = {
  id: "amazon:B08KW1KR5H",
  provider: "amazon",
  url: "https://www.amazon.com/dp/B08KW1KR5H",
};

/** Codec fake: accepts only the token "valid" and returns the given target. */
const codecFor = (target: OutboundTarget): OutboundLinkCodec => ({
  encode: () => "/go/x",
  decode: (_id, params) => (params.s === "valid" ? target : null),
});

const tagging: AffiliateLinkBuilder = {
  build: async (_provider, url) => {
    const tagged = new URL(url);
    tagged.searchParams.set("tag", "onecart-20");
    return { url: tagged, affiliated: true };
  },
};

function setup(overrides: Partial<ResolveOutboundLinkDeps> = {}) {
  const clicks = { record: jest.fn() };
  const logger = { warn: jest.fn() };
  const resolve = createResolveOutboundLink({
    codec: codecFor(TARGET),
    affiliate: tagging,
    clicks,
    logger,
    now: () => new Date("2026-10-11T09:00:00.000Z"),
    ...overrides,
  });
  return { resolve, clicks, logger };
}

describe("resolveOutboundLink", () => {
  it("returns the tagged store URL and records the click", async () => {
    const { resolve, clicks } = setup();
    expect(await resolve(TARGET.id, { s: "valid" })).toEqual({
      ok: true,
      value: {
        location: "https://www.amazon.com/dp/B08KW1KR5H?tag=onecart-20",
        provider: "amazon",
        affiliated: true,
      },
    });
    expect(clicks.record).toHaveBeenCalledWith({
      productId: TARGET.id,
      provider: "amazon",
      affiliated: true,
      at: "2026-10-11T09:00:00.000Z",
    });
  });

  it("rejects links the codec didn't sign, without recording a click", async () => {
    const { resolve, clicks } = setup();
    expect(await resolve(TARGET.id, { s: "forged" })).toEqual({ ok: false, error: "invalid_link" });
    expect(clicks.record).not.toHaveBeenCalled();
  });

  it("rejects signed links whose destination is off the store's allowlist", async () => {
    const { resolve, logger } = setup({ codec: codecFor({ ...TARGET, url: "https://evil.io/dp/1" }) });
    expect(await resolve(TARGET.id, { s: "valid" })).toEqual({ ok: false, error: "disallowed_destination" });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("allowlist"), {
      id: TARGET.id,
      provider: "amazon",
    });
  });

  it("rejects when affiliate tagging moves the link off-host", async () => {
    const hijacking: AffiliateLinkBuilder = {
      build: async () => ({ url: new URL("https://evil.io/"), affiliated: true }),
    };
    const { resolve, logger } = setup({ affiliate: hijacking });
    expect(await resolve(TARGET.id, { s: "valid" })).toEqual({ ok: false, error: "disallowed_destination" });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("affiliate builder"), expect.anything());
  });

  it("still redirects when click recording fails", async () => {
    const { resolve, logger } = setup({ clicks: { record: () => Promise.reject(new Error("db down")) } });
    expect((await resolve(TARGET.id, { s: "valid" })).ok).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith("go: click recording failed", { error: "db down" });

    const other = setup({ clicks: { record: () => Promise.reject("nope") } });
    expect((await other.resolve(TARGET.id, { s: "valid" })).ok).toBe(true);
    expect(other.logger.warn).toHaveBeenCalledWith("go: click recording failed", { error: "nope" });
  });

  it("hands click recording to `defer`, so the redirect doesn't wait for it", async () => {
    const deferred: (() => Promise<void>)[] = [];
    const clicks = { record: jest.fn(() => Promise.reject(new Error("db down"))) };
    const { resolve, logger } = setup({
      clicks,
      defer: (task) => deferred.push(task),
    });
    expect((await resolve(TARGET.id, { s: "valid" })).ok).toBe(true);
    expect(clicks.record).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(1);

    await deferred[0]?.();
    expect(clicks.record).toHaveBeenCalledTimes(1);
    // The deferred task swallows the failure: nothing may throw after the response.
    expect(logger.warn).toHaveBeenCalledWith("go: click recording failed", { error: "db down" });
  });

  it("works with default clock and logger", async () => {
    const resolve = createResolveOutboundLink({
      codec: codecFor(TARGET),
      affiliate: tagging,
      clicks: { record: () => undefined },
    });
    expect((await resolve(TARGET.id, { s: "valid" })).ok).toBe(true);
  });
});
