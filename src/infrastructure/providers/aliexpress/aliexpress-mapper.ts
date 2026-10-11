import { toIls, type FxRates } from "@/domain/pricing/fx-rates";
import { calculateLandedPrice } from "@/domain/pricing/landed-price-calculator";
import type { ImportTaxPolicy } from "@/domain/pricing/import-tax-policy";
import { unifiedProductId, type IsoDateTime, type UnifiedProduct } from "@/domain/product/unified-product";
import {
  isCurrencyCode,
  moneyFromMajor,
  zeroMoney,
  type CurrencyCode,
  type Money,
} from "@/domain/shared/money";
import type { AliExpressRawProduct } from "@/infrastructure/providers/aliexpress/aliexpress-raw-schema";

export interface AliExpressMapContext {
  readonly policy: ImportTaxPolicy;
  readonly fx: FxRates;
  readonly fetchedAt: IsoDateTime;
  /**
   * Whether `target_sale_price` (queried with ship_to_country=IL) already includes
   * Israeli VAT. Must be confirmed against a live response before launch.
   */
  readonly pricesIncludeImportVat: boolean;
}

const ITEM_ID_IN_URL = /\/item\/(\d+)\.html/;

function asCurrency(code: string): CurrencyCode | null {
  const upper = code.toUpperCase();
  return isCurrencyCode(upper) ? upper : null;
}

/** Strips query/hash (tracking, affiliate params) and forces https. */
function cleanUrl(raw: string): string | null {
  const withProtocol = raw.startsWith("//") ? `https:${raw}` : raw;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.protocol = "https:";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Prefer the id in the canonical URL: AliExpress ids are 16 digits and JSON
 * numbers can lose precision past 2^53.
 */
function productIdOf(raw: AliExpressRawProduct, productUrl: string): string {
  return ITEM_ID_IN_URL.exec(productUrl)?.[1] ?? String(raw.product_id);
}

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim();
}

/**
 * Pure: raw AliExpress product → UnifiedProduct, or null when the item lacks
 * what we need to price it honestly (unsupported currency, zero price, bad URL).
 */
export function mapAliExpressProduct(
  raw: AliExpressRawProduct,
  ctx: AliExpressMapContext,
): UnifiedProduct | null {
  const currency = asCurrency(raw.target_sale_price_currency);
  const productUrl = cleanUrl(raw.product_detail_url);
  const title = normalizeTitle(raw.product_title);
  if (!currency || !productUrl || !title) return null;

  const item = moneyFromMajor(Number(raw.target_sale_price), currency);
  if (item.amountMinor <= 0) return null;

  const price = calculateLandedPrice(
    {
      item,
      // The product query doesn't quote shipping; the freight API can fill this in later.
      shipping: null,
      taxesCollectedAtCheckout: ctx.pricesIncludeImportVat ? zeroMoney(currency) : null,
    },
    ctx.policy,
    ctx.fx,
  );

  const providerProductId = productIdOf(raw, productUrl);

  return {
    id: unifiedProductId("aliexpress", providerProductId),
    provider: "aliexpress",
    providerProductId,
    title,
    imageUrl: raw.product_main_image_url ? cleanUrl(raw.product_main_image_url) : null,
    productUrl,
    price,
    originalPrice: originalPriceOf(raw, item, ctx.fx),
    // `evaluate_rate` is a positive-feedback %, not stars; converting would invent data.
    rating: null,
    delivery: { minDays: null, maxDays: null, isFreeShipping: null, methodLabel: null },
    // The affiliate product query only returns purchasable listings.
    availability: "in_stock",
    sellerName: raw.shop_name?.trim() || null,
    fetchedAt: ctx.fetchedAt,
  };
}

/** Strike-through price in ILS, only when it's genuinely higher than the sale price. */
function originalPriceOf(raw: AliExpressRawProduct, item: Money, fx: FxRates): Money | null {
  if (!raw.target_original_price) return null;
  const currency = asCurrency(raw.target_original_price_currency ?? raw.target_sale_price_currency);
  if (!currency) return null;
  const original = toIls(moneyFromMajor(Number(raw.target_original_price), currency), fx);
  return original.amountMinor > toIls(item, fx).amountMinor ? original : null;
}
