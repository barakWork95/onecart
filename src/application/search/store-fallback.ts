import type { OutboundTarget } from "@/domain/affiliate/ports";
import { storeSearchUrl } from "@/domain/affiliate/store-search";
import { matchSearchText } from "@/domain/matching/match-query";
import { FAILED_PROVIDER_STATUSES, type SearchResponse } from "@/domain/search/search-response";

/** A "Check Amazon" link target: the store's own search for one card's product. */
export type StoreCheck = OutboundTarget;

/**
 * When a store's API is unavailable (quota used up, outage, circuit open),
 * each card that only one other store has gets a link to search the failed
 * store's own site for that product. The comparison still happens, by the
 * shopper's own click, and through our affiliate redirect.
 */
/**
 * The /go link id. The codec only accepts ids that name their store
 * ("amazon:…"), so a signed link can't claim another store; the rest stays
 * URL-safe since it travels in the path.
 */
function linkId(provider: string, key: string): string {
  const slug = key
    .toLowerCase()
    .replace(/[^a-z0-9:]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${provider}:search:${slug}`;
}

function failedStores(response: SearchResponse) {
  return response.providers.filter((o) => FAILED_PROVIDER_STATUSES.includes(o.status)).map((o) => o.provider);
}

/**
 * When stores are unavailable, a search of each one's own site for the whole
 * query. With every store down there are no cards to hang "Check" links on,
 * so the error state offers these instead of a dead end.
 */
export function storeSearches(response: SearchResponse): readonly StoreCheck[] {
  const text = response.query.normalizedText;
  return failedStores(response).flatMap((provider) => {
    const url = storeSearchUrl(provider, text);
    return url ? [{ id: linkId(provider, text), provider, url }] : [];
  });
}

export function storeChecks(response: SearchResponse): Readonly<Record<string, StoreCheck>> {
  const failed = failedStores(response);
  const checks: Record<string, StoreCheck> = {};
  for (const group of response.groups) {
    const [only, ...others] = group.offers;
    if (others.length > 0) continue;
    const listed = new Set([only.provider, ...group.unavailable.map((u) => u.provider)]);
    for (const provider of failed) {
      if (listed.has(provider)) continue;
      const url = storeSearchUrl(provider, matchSearchText(group.title));
      if (!url) continue;
      checks[group.id] = { id: linkId(provider, group.id), provider, url };
      break;
    }
  }
  return checks;
}
