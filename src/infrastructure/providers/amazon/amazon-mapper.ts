import { toIls, type FxRates } from "@/domain/pricing/fx-rates";
import type { ImportTaxPolicy } from "@/domain/pricing/import-tax-policy";
import { calculateLandedPrice } from "@/domain/pricing/landed-price-calculator";
import type { UnavailableListing } from "@/domain/product/unavailable-listing";
import { unifiedProductId, type IsoDateTime, type UnifiedProduct } from "@/domain/product/unified-product";
import { moneyFromMajor, zeroMoney, type CurrencyCode } from "@/domain/shared/money";
import { parseAmazonDelivery } from "@/infrastructure/providers/amazon/amazon-delivery";
import type { AmazonRawProduct } from "@/infrastructure/providers/amazon/amazon-raw-schema";

export interface AmazonMapContext {
  readonly policy: ImportTaxPolicy;
  readonly fx: FxRates;
  readonly now: Date;
  readonly fetchedAt: IsoDateTime;
}

/** Currency from the display price. amazon.com quotes "$" = USD; ILS appears when the shopper's currency is set. */
function currencyOf(price: string | undefined): CurrencyCode | null {
  const text = price?.trim() ?? "";
  if (text.startsWith("$")) return "USD";
  if (text.startsWith("₪") || text.toUpperCase().startsWith("ILS")) return "ILS";
  if (text.startsWith("€")) return "EUR";
  if (text.startsWith("£")) return "GBP";
  return null;
}

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim();
}

/** Canonical https://www.amazon.com/dp/{ASIN} — drops ref/tracking/affiliate params. */
function canonicalUrl(asin: string): string {
  return `https://www.amazon.com/dp/${asin}`;
}

/**
 * Amazon's image size modifier ("…/61O3iMlnJIL._AC_UY218_.jpg"). Search
 * results carry the 218px thumbnail; `_AC_SL500_` serves the same photo with
 * its longer side at 500px (confirmed: 142×218 → 325×500), sharp on a 2× tile.
 */
const IMAGE_SIZE = /\._[A-Z0-9_,]+_\.(jpe?g|png|webp)$/i;

function cleanImage(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    parsed.pathname = parsed.pathname.replace(IMAGE_SIZE, "._AC_SL500_.$1");
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Pure: SerpApi Amazon item → UnifiedProduct, or null when it can't be priced honestly. */
/**
 * An item Amazon lists with no offer that ships to the destination (confirmed
 * live for Sony WH-1000XM5 → Israel: "This item cannot be shipped to your
 * selected delivery location"). Null for anything else, including priced items.
 */
export function mapAmazonUnavailable(raw: AmazonRawProduct): UnavailableListing | null {
  const title = normalizeTitle(raw.title);
  const noOffer = raw.purchase_options?.some((o) => o.no_featured_offers === true) ?? false;
  if (!noOffer || raw.extracted_price !== undefined || !title) return null;
  return {
    id: unifiedProductId("amazon", raw.asin),
    provider: "amazon",
    providerProductId: raw.asin,
    title,
    productUrl: canonicalUrl(raw.asin),
    imageUrl: cleanImage(raw.thumbnail),
    reason: "no_offer_to_destination",
  };
}

export function mapAmazonProduct(raw: AmazonRawProduct, ctx: AmazonMapContext): UnifiedProduct | null {
  const currency = currencyOf(raw.price);
  const title = normalizeTitle(raw.title);
  if (!currency || raw.extracted_price === undefined || !title) return null;

  const item = moneyFromMajor(raw.extracted_price, currency);
  const delivery = parseAmazonDelivery(raw.delivery, item, ctx.now);

  const price = calculateLandedPrice(
    {
      item,
      shipping: delivery.shipping,
      // "$X shipping & import fees deposit": X already covers taxes, so estimate none on top.
      taxesCollectedAtCheckout: delivery.includesImportFees ? zeroMoney(currency) : null,
    },
    ctx.policy,
    ctx.fx,
  );

  const original =
    raw.extracted_old_price !== undefined && raw.extracted_old_price > raw.extracted_price
      ? toIls(moneyFromMajor(raw.extracted_old_price, currency), ctx.fx)
      : null;

  return {
    id: unifiedProductId("amazon", raw.asin),
    provider: "amazon",
    providerProductId: raw.asin,
    title,
    imageUrl: cleanImage(raw.thumbnail),
    productUrl: canonicalUrl(raw.asin),
    price,
    originalPrice: original,
    rating:
      raw.rating !== undefined && raw.reviews !== undefined && raw.reviews > 0
        ? { average: raw.rating, count: raw.reviews }
        : null,
    delivery: {
      minDays: delivery.minDays,
      maxDays: delivery.maxDays,
      isFreeShipping: delivery.isFreeShipping,
      methodLabel: null,
    },
    availability: "in_stock",
    sellerName: null,
    fetchedAt: ctx.fetchedAt,
  };
}
