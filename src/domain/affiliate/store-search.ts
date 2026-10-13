import type { ProviderId } from "@/domain/shared/provider";

const SEARCH_PAGES: Partial<Record<ProviderId, (q: string) => string>> = {
  amazon: (q) => `https://www.amazon.com/s?${new URLSearchParams({ k: q }).toString()}`,
  ebay: (q) => `https://www.ebay.com/sch/i.html?${new URLSearchParams({ _nkw: q }).toString()}`,
};

/**
 * The store's own search page for `text`, or null for stores without one we
 * link to. Used when the store's API is unavailable: the shopper can still
 * check it themselves, through our affiliate redirect.
 */
export function storeSearchUrl(provider: ProviderId, text: string): string | null {
  const page = SEARCH_PAGES[provider];
  const query = text.trim();
  return page && query ? page(query) : null;
}
