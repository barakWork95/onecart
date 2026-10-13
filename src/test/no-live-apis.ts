/**
 * Tests must never reach the stores' live APIs: SerpApi bills every search
 * against a 250-a-month quota. Adapters take an injected `fetch`; anything
 * that falls through to the real one for these hosts fails loudly instead.
 */
const LIVE_API_HOSTS = [
  "serpapi.com",
  "api.ebay.com",
  "api-sg.aliexpress.com",
  "api.deepl.com",
  "api-free.deepl.com",
];
const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (LIVE_API_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new Error(
      `Tests must not call live APIs (${url.hostname}); inject a fetch or use recorded fixtures.`,
    );
  }
  return realFetch(input, init);
}) as typeof fetch; // same signature; the cast only restores fetch's overloads
