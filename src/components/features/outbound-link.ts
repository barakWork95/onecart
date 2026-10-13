/**
 * Attributes for every link that leaves OneCart for a store (always through
 * the signed /go redirect, which adds our affiliate tag):
 * - new tab, so the shopper keeps their comparison;
 * - `sponsored` + `nofollow`: affiliate links, per Google's guidance;
 * - `noopener noreferrer`: the store page gets no handle on our window and
 *   no referrer (attribution rides on the URL's tag/campid, not the referrer).
 * Spread it on the anchor: `<a href={…} {...OUTBOUND_LINK}>`.
 */
export const OUTBOUND_LINK = {
  target: "_blank",
  rel: "nofollow sponsored noopener noreferrer",
} as const;
