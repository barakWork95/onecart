import { createHmac } from "node:crypto";
import { createHmacOutboundLinkCodec } from "@/infrastructure/affiliate/outbound-link-codec";

const SECRET = "test-secret-that-is-at-least-32-chars!";
const codec = createHmacOutboundLinkCodec(SECRET);
const TARGET = {
  id: "amazon:B08KW1KR5H",
  provider: "amazon",
  url: "https://www.amazon.com/dp/B08KW1KR5H",
} as const;

function paramsOf(href: string): { id: string; params: Record<string, string> } {
  const url = new URL(href, "https://onecart.example");
  return {
    id: decodeURIComponent(url.pathname.replace("/go/", "")),
    params: Object.fromEntries(url.searchParams),
  };
}

describe("createHmacOutboundLinkCodec", () => {
  it("round-trips a target through a /go href", () => {
    const href = codec.encode(TARGET);
    expect(href).toMatch(/^\/go\/amazon%3AB08KW1KR5H\?d=[\w-]+&s=[\w-]+$/);
    const { id, params } = paramsOf(href);
    expect(codec.decode(id, params)).toEqual(TARGET);
  });

  it("rejects links signed with a different secret", () => {
    const other = createHmacOutboundLinkCodec("another-secret-that-is-32-chars-long!!");
    const { id, params } = paramsOf(other.encode(TARGET));
    expect(codec.decode(id, params)).toBeNull();
  });

  it("rejects a tampered destination", () => {
    const { id, params } = paramsOf(codec.encode(TARGET));
    const forged = Buffer.from(JSON.stringify({ v: 1, p: "amazon", u: "https://evil.io" })).toString(
      "base64url",
    );
    expect(codec.decode(id, { ...params, d: forged })).toBeNull();
  });

  it("rejects a valid payload replayed under another product id", () => {
    const { params } = paramsOf(codec.encode(TARGET));
    expect(codec.decode("amazon:B0OTHER0001", params)).toBeNull();
  });

  it("rejects missing, oversized, or malformed parameters", () => {
    const { id, params } = paramsOf(codec.encode(TARGET));
    expect(codec.decode(id, {})).toBeNull();
    expect(codec.decode(id, { d: params.d })).toBeNull();
    expect(codec.decode(id, { ...params, s: "short" })).toBeNull();
    expect(codec.decode(id, { ...params, d: "x".repeat(5000) })).toBeNull();
    expect(codec.decode(id, { ...params, s: "x".repeat(200) })).toBeNull();
  });

  it("rejects signed payloads that aren't valid targets", () => {
    // Sign arbitrary payloads with the real secret to prove validation runs after verification.
    const sign = (id: string, payload: string) => {
      const d = Buffer.from(payload).toString("base64url");
      return { d, s: createHmac("sha256", SECRET).update(`${id}.${d}`).digest("base64url") };
    };
    expect(codec.decode("amazon:1", sign("amazon:1", "not json"))).toBeNull();
    expect(codec.decode("amazon:1", sign("amazon:1", "null"))).toBeNull();
    expect(
      codec.decode("amazon:1", sign("amazon:1", JSON.stringify({ v: 2, p: "amazon", u: "x" }))),
    ).toBeNull();
    expect(codec.decode("shein:1", sign("shein:1", JSON.stringify({ v: 1, p: "shein", u: "x" })))).toBeNull();
    // Provider in the payload must match the id's prefix.
    expect(
      codec.decode("amazon:1", sign("amazon:1", JSON.stringify({ v: 1, p: "ebay", u: "x" }))),
    ).toBeNull();
  });

  it("refuses weak secrets", () => {
    expect(() => createHmacOutboundLinkCodec("changeme")).toThrow(RangeError);
  });
});
