import { createEbayTokenProvider, EBAY_TOKEN_ENDPOINT } from "@/infrastructure/providers/ebay/ebay-oauth";
import oauthToken from "./fixtures/oauth-token.json";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const signal = () => new AbortController().signal;

function setup(respond: () => Promise<Response>) {
  const clock = { ms: 1_760_000_000_000 };
  const fetchMock = jest.fn((_input: RequestInfo | URL, _init?: RequestInit) => respond());
  const tokens = createEbayTokenProvider({
    clientId: "client",
    clientSecret: "secret",
    fetch: fetchMock,
    now: () => clock.ms,
  });
  return { tokens, fetchMock, clock };
}

describe("createEbayTokenProvider", () => {
  it("requests a client-credentials token with Basic auth and the public scope", async () => {
    const { tokens, fetchMock } = setup(async () => json(oauthToken));
    expect(await tokens.getToken(signal())).toEqual({ ok: true, value: oauthToken.access_token });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(EBAY_TOKEN_ENDPOINT);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      Authorization: `Basic ${Buffer.from("client:secret").toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    });
  });

  it("reuses the token until a minute before expiry, then refreshes", async () => {
    const { tokens, fetchMock, clock } = setup(async () => json(oauthToken));
    await tokens.getToken(signal());
    clock.ms += (7200 - 61) * 1000;
    await tokens.getToken(signal());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    clock.ms += 2_000;
    await tokens.getToken(signal());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one refresh between concurrent callers", async () => {
    const { tokens, fetchMock } = setup(async () => json(oauthToken));
    await Promise.all([tokens.getToken(signal()), tokens.getToken(signal()), tokens.getToken(signal())]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches a fresh token after invalidate()", async () => {
    const { tokens, fetchMock } = setup(async () => json(oauthToken));
    await tokens.getToken(signal());
    tokens.invalidate();
    await tokens.getToken(signal());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [400, "unauthorized", "OAUTH_HTTP_400"],
    [401, "unauthorized", "OAUTH_HTTP_401"],
    [429, "rate_limited", "OAUTH_HTTP_429"],
    [503, "upstream_error", "OAUTH_HTTP_503"],
  ] as const)("maps HTTP %i to %s", async (status, kind, code) => {
    const { tokens } = setup(async () => json({ error: "invalid_client" }, status));
    expect(await tokens.getToken(signal())).toEqual({ ok: false, error: { kind, code } });
  });

  it("rejects malformed token responses", async () => {
    for (const respond of [async () => json({ token: "x" }), async () => new Response("<html>")]) {
      const { tokens } = setup(respond);
      expect(await tokens.getToken(signal())).toEqual({
        ok: false,
        error: { kind: "parse_error", code: "OAUTH_PARSE_ERROR" },
      });
    }
  });

  it("maps network failures and aborts", async () => {
    const { tokens } = setup(() => Promise.reject(new TypeError("fetch failed")));
    expect(await tokens.getToken(signal())).toEqual({
      ok: false,
      error: { kind: "upstream_error", code: "OAUTH_NETWORK", detail: "fetch failed" },
    });
    const other = setup(() => Promise.reject("down"));
    expect(await other.tokens.getToken(signal())).toMatchObject({ ok: false, error: { detail: "down" } });

    const aborted = new AbortController();
    aborted.abort();
    const timedOut = setup(() => Promise.reject(new DOMException("aborted", "AbortError")));
    expect(await timedOut.tokens.getToken(aborted.signal)).toEqual({
      ok: false,
      error: { kind: "timeout", code: "TIMEOUT" },
    });
  });
});
