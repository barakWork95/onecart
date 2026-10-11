import "server-only";

import { err, ok, type Result } from "@/domain/shared/result";
import type { GatewayFailure } from "@/infrastructure/providers/gateway-failure";
import { ebayTokenResponseSchema } from "@/infrastructure/providers/ebay/ebay-raw-schema";

export const EBAY_TOKEN_ENDPOINT = "https://api.ebay.com/identity/v1/oauth2/token";
const SCOPE = "https://api.ebay.com/oauth/api_scope";
/** Refresh a minute early so a token never expires mid-request. */
const EXPIRY_MARGIN_MS = 60_000;

export interface EbayOAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly endpoint?: string;
}

export interface EbayTokenProvider {
  getToken(signal: AbortSignal): Promise<Result<string, GatewayFailure>>;
  /** Drop the cached token (after a 401) so the next call fetches a fresh one. */
  invalidate(): void;
}

/**
 * Client-credentials ("application") tokens for the Browse API. Tokens last
 * ~2 hours; one is cached per server instance and concurrent requests share
 * a single refresh.
 */
export function createEbayTokenProvider(config: EbayOAuthConfig): EbayTokenProvider {
  const doFetch = config.fetch ?? fetch;
  const now = config.now ?? Date.now;
  let cached: { token: string; expiresAtMs: number } | null = null;
  let inFlight: Promise<Result<string, GatewayFailure>> | null = null;

  async function fetchToken(signal: AbortSignal): Promise<Result<string, GatewayFailure>> {
    const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
    let response: Response;
    try {
      response = await doFetch(config.endpoint ?? EBAY_TOKEN_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "client_credentials", scope: SCOPE }).toString(),
        signal,
      });
    } catch (error) {
      if (signal.aborted) return err({ kind: "timeout", code: "TIMEOUT" });
      return err({
        kind: "upstream_error",
        code: "OAUTH_NETWORK",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    // 400/401 here mean bad client credentials — a config bug, not an outage.
    if (response.status === 400 || response.status === 401)
      return err({ kind: "unauthorized", code: `OAUTH_HTTP_${response.status}` });
    if (response.status === 429) return err({ kind: "rate_limited", code: "OAUTH_HTTP_429" });
    if (!response.ok) return err({ kind: "upstream_error", code: `OAUTH_HTTP_${response.status}` });

    const parsed = ebayTokenResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) return err({ kind: "parse_error", code: "OAUTH_PARSE_ERROR" });
    cached = {
      token: parsed.data.access_token,
      expiresAtMs: now() + parsed.data.expires_in * 1000 - EXPIRY_MARGIN_MS,
    };
    return ok(parsed.data.access_token);
  }

  return {
    async getToken(signal) {
      if (cached && cached.expiresAtMs > now()) return ok(cached.token);
      inFlight ??= fetchToken(signal).finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    invalidate() {
      cached = null;
    },
  };
}
