import { z } from "zod";

/**
 * Upstream shapes for `aliexpress.affiliate.product.query` (Affiliate API, gateway
 * `api-sg.aliexpress.com/sync`). Only the fields we read are declared; unknown keys are
 * ignored. Prices arrive as decimal strings, e.g. "89.90".
 */

const decimalString = z.string().regex(/^\d+(\.\d+)?$/, "expected a decimal string");

/** Validated per item, so one bad product is dropped without failing the whole page. */
export const aliExpressRawProductSchema = z.object({
  product_id: z.union([z.string().min(1), z.number().int().positive()]),
  product_title: z.string().min(1),
  product_detail_url: z.string().min(1),
  product_main_image_url: z.string().optional(),
  target_sale_price: decimalString,
  target_sale_price_currency: z.string().length(3),
  target_original_price: decimalString.optional(),
  target_original_price_currency: z.string().length(3).optional(),
  /** Positive-feedback percentage, e.g. "97.4%". Not a star rating. */
  evaluate_rate: z.string().optional(),
  /** Orders in the last 30 days. */
  lastest_volume: z.number().int().nonnegative().optional(),
  shop_name: z.string().optional(),
});

export type AliExpressRawProduct = z.infer<typeof aliExpressRawProductSchema>;

/** Envelope only; products are validated individually by the adapter. */
export const aliExpressQueryResponseSchema = z.object({
  aliexpress_affiliate_product_query_response: z.object({
    resp_result: z.object({
      resp_code: z.number().int(),
      resp_msg: z.string().optional(),
      result: z
        .object({
          current_page_no: z.number().int().optional(),
          current_record_count: z.number().int().optional(),
          total_record_count: z.number().int().optional(),
          products: z.object({ product: z.array(z.unknown()) }).optional(),
        })
        .optional(),
    }),
  }),
});

/** Gateway-level error (bad signature, rate limit…), returned with HTTP 200. */
export const aliExpressErrorResponseSchema = z.object({
  error_response: z.object({
    code: z.union([z.string(), z.number()]),
    msg: z.string().optional(),
    sub_code: z.string().optional(),
    sub_msg: z.string().optional(),
  }),
});

/** `aliexpress.affiliate.link.generate` response. */
export const aliExpressLinkGenerateResponseSchema = z.object({
  aliexpress_affiliate_link_generate_response: z.object({
    resp_result: z.object({
      resp_code: z.number().int(),
      resp_msg: z.string().optional(),
      result: z
        .object({
          total_result_count: z.number().int().optional(),
          promotion_links: z
            .object({
              promotion_link: z.array(
                z.object({ promotion_link: z.string().min(1), source_value: z.string().optional() }),
              ),
            })
            .optional(),
        })
        .optional(),
    }),
  }),
});
