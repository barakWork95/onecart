/**
 * Amazon Associates: the `tag` query parameter carries the tracking id
 * (e.g. "onecart-20"). Any existing tag is replaced; other params are kept.
 */
export function buildAmazonAffiliateUrl(cleanUrl: URL, tag: string): URL {
  const url = new URL(cleanUrl);
  url.searchParams.delete("tag");
  url.searchParams.set("tag", tag);
  return url;
}
