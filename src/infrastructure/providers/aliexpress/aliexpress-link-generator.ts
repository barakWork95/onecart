import "server-only";

import { noopLogger, type Logger } from "@/domain/shared/logger";
import type { RedisLike } from "@/infrastructure/cache/redis-client";
import {
  callAliExpress,
  type AliExpressGatewayConfig,
} from "@/infrastructure/providers/aliexpress/aliexpress-gateway";
import { aliExpressLinkGenerateResponseSchema } from "@/infrastructure/providers/aliexpress/aliexpress-raw-schema";

const API_METHOD = "aliexpress.affiliate.link.generate";
/** Promotion links don't expire on a schedule; a month bounds staleness if our tracking id changes. */
const LINK_TTL_SECONDS = 60 * 60 * 24 * 30;
/** This runs inside the /go redirect, so it must be quick; on timeout the shopper gets the clean link. */
const DEFAULT_TIMEOUT_MS = 1_500;

export const promotionLinkKey = (trackingId: string, url: string) => `aff:aliexpress:v1:${trackingId}:${url}`;

export interface AliExpressLinkGeneratorConfig extends AliExpressGatewayConfig {
  readonly trackingId: string;
  readonly cache: RedisLike;
  readonly timeoutMs?: number;
  readonly logger?: Logger;
}

export interface AliExpressLinkGenerator {
  /** The commissionable promotion link for a clean product URL, or null if none could be generated. */
  generate(cleanUrl: URL): Promise<URL | null>;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * AliExpress only pays commission on links it issued itself
 * (`s.click.aliexpress.com/e/...`), so we ask the API to convert each clean
 * URL on first click and cache the answer. Failures return null — the caller
 * then sends the shopper to the clean URL rather than blocking the click.
 */
export function createAliExpressLinkGenerator(
  config: AliExpressLinkGeneratorConfig,
): AliExpressLinkGenerator {
  const logger = config.logger ?? noopLogger;

  return {
    async generate(cleanUrl) {
      const source = cleanUrl.toString();
      const key = promotionLinkKey(config.trackingId, source);

      try {
        const cached = await config.cache.get<unknown>(key);
        const url = typeof cached === "string" ? parseUrl(cached) : null;
        if (url) return url;
      } catch (error) {
        logger.warn("aliexpress-link: cache read failed", { error: String(error) });
      }

      const response = await callAliExpress(
        API_METHOD,
        { promotion_link_type: "0", source_values: source, tracking_id: config.trackingId },
        config,
        AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      );
      if (!response.ok) {
        logger.warn("aliexpress-link: generation failed", {
          code: response.error.code,
          detail: response.error.detail,
        });
        return null;
      }

      const parsed = aliExpressLinkGenerateResponseSchema.safeParse(response.value);
      if (!parsed.success) {
        logger.warn("aliexpress-link: unexpected response shape", { error: parsed.error.message });
        return null;
      }
      const { resp_code, resp_msg, result } =
        parsed.data.aliexpress_affiliate_link_generate_response.resp_result;
      const links = result?.promotion_links?.promotion_link ?? [];
      // Match on source_value when present; a single link for a single source is unambiguous.
      const match =
        links.find((l) => l.source_value === source) ?? (links.length === 1 ? links[0] : undefined);
      const promotionUrl = resp_code === 200 && match ? parseUrl(match.promotion_link) : null;
      if (!promotionUrl) {
        logger.warn("aliexpress-link: no promotion link returned", { resp_code, resp_msg });
        return null;
      }

      try {
        await config.cache.set(key, promotionUrl.toString(), { ex: LINK_TTL_SECONDS });
      } catch (error) {
        logger.warn("aliexpress-link: cache write failed", { error: String(error) });
      }
      return promotionUrl;
    },
  };
}
