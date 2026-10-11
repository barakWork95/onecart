import type { AffiliateLinkBuilder } from "@/domain/affiliate/ports";
import { buildAmazonAffiliateUrl } from "@/infrastructure/affiliate/amazon";
import { buildEbayAffiliateUrl } from "@/infrastructure/affiliate/ebay";
import type { AliExpressLinkGenerator } from "@/infrastructure/providers/aliexpress/aliexpress-link-generator";

export interface AffiliateConfig {
  readonly amazonTag?: string;
  readonly ebayCampaignId?: string;
  /** Converts clean AliExpress URLs into commissionable promotion links via the Affiliate API. */
  readonly aliexpress?: AliExpressLinkGenerator;
}

/**
 * Per-store affiliate tagging. Stores without a configured program get the
 * clean URL (`affiliated: false`) — the shopper still lands on the product.
 *
 * - Amazon and eBay: documented URL parameters, added synchronously.
 * - AliExpress: links must be issued by `aliexpress.affiliate.link.generate`
 *   (see `createAliExpressLinkGenerator`); falls back to the clean URL on failure.
 * - Temu: not supported — its affiliate links come from a dashboard, with no
 *   documented URL parameter, and we don't guess.
 */
export function createAffiliateLinkBuilder(config: AffiliateConfig): AffiliateLinkBuilder {
  return {
    async build(provider, cleanUrl) {
      if (provider === "amazon" && config.amazonTag) {
        return { url: buildAmazonAffiliateUrl(cleanUrl, config.amazonTag), affiliated: true };
      }
      if (provider === "ebay" && config.ebayCampaignId) {
        return { url: buildEbayAffiliateUrl(cleanUrl, config.ebayCampaignId), affiliated: true };
      }
      if (provider === "aliexpress" && config.aliexpress) {
        const promotion = await config.aliexpress.generate(cleanUrl).catch(() => null);
        if (promotion) return { url: promotion, affiliated: true };
      }
      return { url: new URL(cleanUrl), affiliated: false };
    },
  };
}
