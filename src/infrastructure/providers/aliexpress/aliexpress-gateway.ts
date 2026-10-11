import type { ProviderErrorKind } from "@/domain/search/product-search-provider";
import type { GatewayFailure } from "@/infrastructure/providers/gateway-failure";
import { err, ok, type Result } from "@/domain/shared/result";
import { aliExpressErrorResponseSchema } from "@/infrastructure/providers/aliexpress/aliexpress-raw-schema";
import { signAliExpressParams } from "@/infrastructure/providers/aliexpress/aliexpress-signer";

export const ALIEXPRESS_ENDPOINT = "https://api-sg.aliexpress.com/sync";

export interface AliExpressGatewayConfig {
  readonly appKey: string;
  readonly appSecret: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly endpoint?: string;
}

const AUTH_ERROR_CODES = new Set([
  "IncompleteSignature",
  "InvalidSignature",
  "InvalidApiKey",
  "InvalidAppKey",
  "MissingAppKey",
  "AppKeyNotExist",
  "InsufficientPermission",
]);

const failure = (kind: ProviderErrorKind, code: string, detail?: string): GatewayFailure => ({
  kind,
  code,
  ...(detail ? { detail } : {}),
});

function failureForHttpStatus(status: number): GatewayFailure {
  if (status === 401 || status === 403) return failure("unauthorized", `HTTP_${status}`);
  if (status === 429) return failure("rate_limited", "HTTP_429");
  return failure("upstream_error", `HTTP_${status}`);
}

function failureForGatewayCode(code: string, detail: string | undefined): GatewayFailure {
  if (/limit|throttl|frequency/i.test(code)) return failure("rate_limited", `GATEWAY_${code}`, detail);
  if (AUTH_ERROR_CODES.has(code)) return failure("unauthorized", `GATEWAY_${code}`, detail);
  return failure("upstream_error", `GATEWAY_${code}`, detail);
}

/**
 * One signed call to the AliExpress Open Platform gateway. Returns the parsed
 * JSON body, or a classified failure for HTTP errors, network errors, aborts,
 * non-JSON bodies, and gateway `error_response`s. Never throws.
 */
export async function callAliExpress(
  method: string,
  appParams: Readonly<Record<string, string>>,
  config: AliExpressGatewayConfig,
  signal: AbortSignal,
): Promise<Result<unknown, GatewayFailure>> {
  const doFetch = config.fetch ?? fetch;
  const now = config.now ?? (() => new Date());
  const params: Record<string, string> = {
    method,
    app_key: config.appKey,
    sign_method: "md5",
    timestamp: String(now().getTime()),
    format: "json",
    v: "2.0",
    ...appParams,
  };
  const query = new URLSearchParams({ ...params, sign: signAliExpressParams(params, config.appSecret) });

  let text: string;
  try {
    const response = await doFetch(`${config.endpoint ?? ALIEXPRESS_ENDPOINT}?${query.toString()}`, {
      method: "POST",
      signal,
    });
    if (!response.ok) return err(failureForHttpStatus(response.status));
    text = await response.text();
  } catch (error) {
    if (signal.aborted) return err(failure("timeout", "TIMEOUT"));
    return err(failure("upstream_error", "NETWORK", error instanceof Error ? error.message : String(error)));
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return err(failure("parse_error", "INVALID_JSON", text.slice(0, 200)));
  }

  const gatewayError = aliExpressErrorResponseSchema.safeParse(body);
  if (gatewayError.success) {
    const { code, sub_code, msg, sub_msg } = gatewayError.data.error_response;
    return err(failureForGatewayCode(String(code), [sub_code, msg, sub_msg].filter(Boolean).join(" | ")));
  }
  return ok(body);
}
