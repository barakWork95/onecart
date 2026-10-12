import { z } from "zod";

/**
 * eBay Browse API `GET /item_summary/search` (developer.ebay.com, buy_browse_v1_oas3).
 * Only the fields we read. Money is { value: "34.50", currency: "USD" }.
 */
const amount = z.object({ value: z.string().regex(/^\d+(\.\d+)?$/), currency: z.string().length(3) });

const shippingOption = z.object({
  shippingCostType: z.string().optional(),
  shippingCost: amount.optional(),
  minEstimatedDeliveryDate: z.iso.datetime({ offset: true }).optional(),
  maxEstimatedDeliveryDate: z.iso.datetime({ offset: true }).optional(),
});

export const ebayRawItemSchema = z.object({
  /** RESTful id, e.g. "v1|395012345678|0" (the last part is the variation). */
  itemId: z.string().min(1),
  legacyItemId: z.string().regex(/^\d+$/).optional(),
  title: z.string().min(1),
  price: amount,
  image: z.object({ imageUrl: z.string() }).optional(),
  /** Larger renditions; the fallback when `image` is missing. */
  thumbnailImages: z.array(z.object({ imageUrl: z.string() })).optional(),
  additionalImages: z.array(z.object({ imageUrl: z.string() })).optional(),
  itemWebUrl: z.string().optional(),
  shippingOptions: z.array(shippingOption).optional(),
  marketingPrice: z.object({ originalPrice: amount.optional() }).optional(),
  seller: z.object({ username: z.string().optional() }).optional(),
  conditionId: z.string().optional(),
  buyingOptions: z.array(z.string()).optional(),
});

export type EbayRawItem = z.infer<typeof ebayRawItemSchema>;
export type EbayRawShippingOption = z.infer<typeof shippingOption>;

export const ebaySearchResponseSchema = z.object({
  total: z.number().int().nonnegative().optional(),
  /** Omitted entirely when nothing matches. */
  itemSummaries: z.array(z.unknown()).optional(),
});

export const ebayErrorResponseSchema = z.object({
  errors: z.array(z.object({ errorId: z.number().int(), message: z.string().optional() })).min(1),
});

export const ebayTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});
