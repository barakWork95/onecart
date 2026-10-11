import type { ProviderId } from "@/domain/shared/provider";

/**
 * The only domains each store may send shoppers to. A URL is allowed when its
 * host IS one of these or a subdomain of one ("www.amazon.com", "s.click.aliexpress.com").
 * Changing this list is a security review, not a refactor.
 */
export const STORE_HOSTS: Readonly<Record<ProviderId, readonly string[]>> = {
  amazon: ["amazon.com"],
  aliexpress: ["aliexpress.com", "aliexpress.us"],
  temu: ["temu.com"],
  ebay: ["ebay.com"],
};

function hostMatches(hostname: string, apex: string): boolean {
  return hostname === apex || hostname.endsWith(`.${apex}`);
}

/**
 * Parses `url` and returns it only if it's a plain https link to one of the
 * provider's own domains — no credentials ("https://amazon.com@evil.com"),
 * no custom port, no other scheme. Everything else → null.
 */
export function parseAllowedStoreUrl(provider: ProviderId, url: string): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return null;
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  return STORE_HOSTS[provider].some((apex) => hostMatches(hostname, apex)) ? parsed : null;
}
