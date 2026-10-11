import { toIls, type FxRates } from "@/domain/pricing/fx-rates";
import type { ImportTaxPolicy } from "@/domain/pricing/import-tax-policy";
import { calculateLandedPrice } from "@/domain/pricing/landed-price-calculator";
import { unifiedProductId, type IsoDateTime, type UnifiedProduct } from "@/domain/product/unified-product";
import { businessDaysUntil } from "@/domain/shared/business-days";
import { isCurrencyCode, moneyFromMajor, type Money } from "@/domain/shared/money";
import type { EbayRawItem, EbayRawShippingOption } from "@/infrastructure/providers/ebay/ebay-raw-schema";

export interface EbayMapContext {
  readonly policy: ImportTaxPolicy;
  readonly fx: FxRates;
  readonly now: Date;
  readonly fetchedAt: IsoDateTime;
}

function toMoney(amount: { value: string; currency: string } | undefined): Money | null {
  if (!amount || !isCurrencyCode(amount.currency)) return null;
  return moneyFromMajor(Number(amount.value), amount.currency);
}

/** "v1|395012345678|0" → "395012345678"; variations keep a suffix so each stays unique. */
function listingId(raw: EbayRawItem): string | null {
  const [, legacy, variation] = raw.itemId.split("|");
  const id = raw.legacyItemId ?? legacy;
  if (!id || !/^\d+$/.test(id)) return null;
  return variation && variation !== "0" ? `${id}-${variation}` : id;
}

/** Cheapest option that quotes a cost, compared in ILS so mixed currencies order correctly. */
function cheapestShipping(options: readonly EbayRawShippingOption[], fx: FxRates) {
  let best: { option: EbayRawShippingOption; cost: Money } | null = null;
  for (const option of options) {
    const cost = toMoney(option.shippingCost);
    if (!cost) continue;
    if (!best || toIls(cost, fx).amountMinor < toIls(best.cost, fx).amountMinor) best = { option, cost };
  }
  return best;
}

function cleanImage(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Pure: Browse API item summary → UnifiedProduct, or null when it can't be
 * priced honestly (unsupported currency, zero price, auction-only).
 */
export function mapEbayItem(raw: EbayRawItem, ctx: EbayMapContext): UnifiedProduct | null {
  // Auction prices aren't final; we only compare Buy It Now listings.
  if (raw.buyingOptions && !raw.buyingOptions.includes("FIXED_PRICE")) return null;

  const id = listingId(raw);
  const item = toMoney(raw.price);
  const title = raw.title.replace(/\s+/g, " ").trim();
  if (!id || !item || item.amountMinor <= 0 || !title) return null;

  const shipping = cheapestShipping(raw.shippingOptions ?? [], ctx.fx);
  const option = shipping?.option;
  const min = option?.minEstimatedDeliveryDate
    ? businessDaysUntil(ctx.now, new Date(option.minEstimatedDeliveryDate))
    : null;
  const max = option?.maxEstimatedDeliveryDate
    ? businessDaysUntil(ctx.now, new Date(option.maxEstimatedDeliveryDate))
    : null;

  const original = toMoney(raw.marketingPrice?.originalPrice);
  const originalIls = original ? toIls(original, ctx.fx) : null;

  return {
    id: unifiedProductId("ebay", id),
    provider: "ebay",
    providerProductId: id,
    title,
    imageUrl: cleanImage(raw.image?.imageUrl),
    // Canonical listing URL; tracking params from itemWebUrl are dropped.
    productUrl: `https://www.ebay.com/itm/${id.split("-")[0]}`,
    price: calculateLandedPrice({ item, shipping: shipping?.cost ?? null }, ctx.policy, ctx.fx),
    originalPrice:
      originalIls && originalIls.amountMinor > toIls(item, ctx.fx).amountMinor ? originalIls : null,
    // Item summaries carry seller feedback, not product ratings; we don't conflate the two.
    rating: null,
    delivery: {
      minDays: min ?? max,
      maxDays: max ?? min,
      isFreeShipping: shipping ? shipping.cost.amountMinor === 0 : null,
      methodLabel: null,
    },
    availability: "in_stock",
    sellerName: raw.seller?.username ?? null,
    fetchedAt: ctx.fetchedAt,
  };
}
