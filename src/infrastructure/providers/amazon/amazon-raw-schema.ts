import { z } from "zod";

/**
 * SerpApi `engine=amazon` response (serpapi.com/amazon-search-api). Only the
 * fields we read are declared. Items are validated one by one by the adapter.
 */
export const amazonRawProductSchema = z.object({
  asin: z.string().regex(/^[A-Z0-9]{10}$/),
  title: z.string().min(1),
  link_clean: z.string().optional(),
  link: z.string().optional(),
  thumbnail: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  reviews: z.number().int().nonnegative().optional(),
  /** Display price, e.g. "$29.99" — the symbol tells us the currency. */
  price: z.string().optional(),
  extracted_price: z.number().positive().optional(),
  extracted_old_price: z.number().positive().optional(),
  /** Free-text lines such as "FREE delivery Sat, Jan 17 on $35 of items shipped by Amazon". */
  delivery: z.array(z.string()).optional(),
  sponsored: z.boolean().optional(),
  /** `[{ no_featured_offers: true }]` when no offer ships to `shipping_location`. */
  purchase_options: z.array(z.object({ no_featured_offers: z.boolean().optional() })).optional(),
});

export type AmazonRawProduct = z.infer<typeof amazonRawProductSchema>;

export const amazonSearchResponseSchema = z.object({
  /** Present on failures, and on successful searches with no results. */
  error: z.string().optional(),
  organic_results: z.array(z.unknown()).optional(),
  /**
   * Carousels ("Customers frequently viewed", …). With `shipping_location=IL`
   * these are often the only priced, deliverable items on a page.
   */
  featured_products: z.array(z.object({ products: z.array(z.unknown()).optional() })).optional(),
  /** `next` is present when Amazon has another results page. */
  serpapi_pagination: z.object({ current: z.number().optional(), next: z.string().optional() }).optional(),
});
