import { callAliExpress } from "@/infrastructure/providers/aliexpress/aliexpress-gateway";

const config = { appKey: "k", appSecret: "s", now: () => new Date(0) };
const signal = () => new AbortController().signal;

describe("callAliExpress", () => {
  it("uses the real fetch and clock by default", async () => {
    const realFetch = global.fetch;
    global.fetch = jest.fn(async () => new Response("{}"));
    try {
      expect(await callAliExpress("m", {}, { appKey: "k", appSecret: "s" }, signal())).toEqual({
        ok: true,
        value: {},
      });
    } finally {
      global.fetch = realFetch;
    }
  });

  it("maps numeric gateway codes and non-Error network failures", async () => {
    expect(
      await callAliExpress(
        "m",
        {},
        { ...config, fetch: async () => new Response(JSON.stringify({ error_response: { code: 7 } })) },
        signal(),
      ),
    ).toEqual({ ok: false, error: { kind: "upstream_error", code: "GATEWAY_7" } });
    expect(
      await callAliExpress("m", {}, { ...config, fetch: () => Promise.reject("down") }, signal()),
    ).toEqual({
      ok: false,
      error: { kind: "upstream_error", code: "NETWORK", detail: "down" },
    });
  });
});
