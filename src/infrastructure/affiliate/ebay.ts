/** eBay Partner Network params (developer.ebay.com/api-docs/buy/static/ref-epn-link.html). */
export const EPN_PARAMS = {
  /** Event: 1 = click. */
  mkevt: "1",
  /** Channel: 1 = EPN. */
  mkcid: "1",
  /** Rotation id for eBay US (ebay.com). */
  mkrid: "711-53200-19255-0",
  /** Tool id: 10001 = default/API-generated. */
  toolid: "10001",
} as const;

const EPN_KEYS = [...Object.keys(EPN_PARAMS), "campid", "customid"];

/** Appends EPN tracking to an ebay.com URL, replacing any existing EPN params. */
export function buildEbayAffiliateUrl(cleanUrl: URL, campaignId: string): URL {
  const url = new URL(cleanUrl);
  for (const key of EPN_KEYS) url.searchParams.delete(key);
  for (const [key, value] of Object.entries(EPN_PARAMS)) url.searchParams.set(key, value);
  url.searchParams.set("campid", campaignId);
  return url;
}
