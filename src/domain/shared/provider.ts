/**
 * E-commerce platforms OneCart aggregates. Adding a provider starts here:
 * extend this tuple, then implement a `ProductSearchProvider` adapter
 * (see CLAUDE.md → "Onboarding a new provider").
 */
export const PROVIDER_IDS = ["amazon", "aliexpress", "temu", "ebay"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}
