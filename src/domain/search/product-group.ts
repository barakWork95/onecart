import {
  DEFAULT_MATCHING_POLICY,
  matchProducts,
  matchTitles,
  toMatchCandidate,
  type MatchBasis,
  type MatchCandidate,
  type MatchingPolicy,
} from "@/domain/matching/product-matcher";
import { tokenizeTitle } from "@/domain/matching/title-tokens";
import type { UnavailableListing } from "@/domain/product/unavailable-listing";
import type { ProductRating, UnifiedProduct } from "@/domain/product/unified-product";
import type { OfferClass } from "@/domain/search/search-intent";
import { compareMoney, type Money } from "@/domain/shared/money";

/** Non-empty list of offers, cheapest landed total first. */
export type Offers = readonly [UnifiedProduct, ...UnifiedProduct[]];

/**
 * The same product found in one or more stores — one card in the results list
 * and one row per store in the compare sheet. At most one offer per store.
 */
export interface ProductGroup {
  /** Stable for identical input: derived from the cheapest offer's id. */
  readonly id: string;
  /** From the offer with the most reviews (usually the cleanest title), else the cheapest. */
  readonly title: string;
  readonly imageUrl: string | null;
  readonly offers: Offers;
  readonly priceRange: { readonly min: Money; readonly max: Money };
  /** Review-count-weighted average across offers that have ratings. */
  readonly rating: ProductRating | null;
  /**
   * How confident the grouping is: `single` (one store), `model_number`
   * (shared model identifier), or `title_similarity` (weakest — the UI may
   * label it "similar item"). The weakest link in the group wins.
   */
  readonly matchedBy: "single" | MatchBasis;
  /**
   * The same product at stores that list it but won't ship it to Israel, at
   * most one per store and never a store already in `offers`.
   */
  readonly unavailable: readonly UnavailableListing[];
  /** Names the product the query names (always true for category searches). */
  readonly onIntent: boolean;
  /** An accessory or part rather than a product in its own right. */
  readonly isAccessory: boolean;
}

export interface GroupingOptions {
  readonly policy?: MatchingPolicy;
  /** Per-search accessory and intent decisions (`classifyOffers`); titles alone otherwise. */
  readonly classes?: ReadonlyMap<string, OfferClass>;
  /** Listings with no offer to Israel, attached to the groups they match. */
  readonly unavailable?: readonly UnavailableListing[];
}

export function bestOffer(group: ProductGroup): UnifiedProduct {
  return group.offers[0];
}

/** Cheapest landed total first; id breaks ties so ordering is deterministic. */
export function compareOffers(a: UnifiedProduct, b: UnifiedProduct): number {
  return compareMoney(a.price.total, b.price.total) || a.id.localeCompare(b.id);
}

interface Cluster {
  readonly members: MatchCandidate[];
  weakestBasis: MatchBasis | null;
}

/** A product's match candidate, with the search's accessory decision when there is one. */
function candidateFor(product: UnifiedProduct, classes: GroupingOptions["classes"]): MatchCandidate {
  const candidate = toMatchCandidate(product);
  const cls = classes?.get(product.id);
  return cls ? { product, tokens: { ...candidate.tokens, isAccessory: cls.isAccessory } } : candidate;
}

const BASIS_STRENGTH: Record<MatchBasis, number> = { title_similarity: 0, model_number: 1 };

function weaker(a: MatchBasis | null, b: MatchBasis): MatchBasis {
  return a === null || BASIS_STRENGTH[b] < BASIS_STRENGTH[a] ? b : a;
}

/**
 * Best placement for a candidate: a cluster with no offer from the same store
 * where the candidate matches EVERY member (complete linkage, so A~B and B~C
 * can't chain A and C together). Highest minimum score wins.
 */
function findCluster(
  candidate: MatchCandidate,
  clusters: readonly Cluster[],
  policy: MatchingPolicy,
): { cluster: Cluster; basis: MatchBasis } | null {
  let best: { cluster: Cluster; basis: MatchBasis; score: number } | null = null;

  for (const cluster of clusters) {
    let minScore = Number.POSITIVE_INFINITY;
    let basis: MatchBasis | null = null;
    let matchesAll = true;

    for (const member of cluster.members) {
      const match = matchProducts(candidate, member, policy);
      if (!match) {
        matchesAll = false;
        break;
      }
      minScore = Math.min(minScore, match.score);
      basis = weaker(basis, match.basis);
    }

    if (matchesAll && basis && (!best || minScore > best.score)) best = { cluster, basis, score: minScore };
  }
  return best;
}

function aggregateRating(offers: Offers): ProductRating | null {
  let weightedSum = 0;
  let count = 0;
  for (const offer of offers) {
    if (!offer.rating || offer.rating.count <= 0) continue;
    weightedSum += offer.rating.average * offer.rating.count;
    count += offer.rating.count;
  }
  return count > 0 ? { average: Math.round((weightedSum / count) * 100) / 100, count } : null;
}

/**
 * For each store missing from the group, the unavailable listing that best
 * matches every offer in it (complete linkage, as for offers).
 */
function unavailableFor(
  cluster: Cluster,
  listings: readonly { listing: UnavailableListing; tokens: ReturnType<typeof tokenizeTitle> }[],
  policy: MatchingPolicy,
): UnavailableListing[] {
  const stores = new Set(cluster.members.map((m) => m.product.provider));
  const best = new Map<string, { listing: UnavailableListing; score: number }>();
  for (const { listing, tokens } of listings) {
    if (stores.has(listing.provider)) continue;
    let minScore = Number.POSITIVE_INFINITY;
    for (const member of cluster.members) {
      const match = matchTitles(member.tokens, tokens, policy);
      minScore = Math.min(minScore, match ? match.score : Number.NEGATIVE_INFINITY);
    }
    const current = best.get(listing.provider);
    if (minScore > 0 && (!current || minScore > current.score))
      best.set(listing.provider, { listing, score: minScore });
  }
  return [...best.values()].map((b) => b.listing).sort((a, b) => a.provider.localeCompare(b.provider));
}

function toGroup(
  cluster: Cluster,
  unavailable: readonly UnavailableListing[],
  classes: GroupingOptions["classes"],
): ProductGroup {
  const [first, ...rest] = cluster.members.map((m) => m.product).sort(compareOffers);
  // Clusters are created with one member and only grow.
  if (!first) throw new Error("Invariant violated: empty product cluster");
  const offers: Offers = [first, ...rest];
  const last = offers[offers.length - 1] ?? first;

  const byReviews = [...offers].sort((a, b) => (b.rating?.count ?? 0) - (a.rating?.count ?? 0));
  const titleSource = (byReviews[0]?.rating?.count ?? 0) > 0 ? (byReviews[0] ?? first) : first;

  return {
    id: `grp:${first.id}`,
    title: titleSource.title,
    imageUrl: titleSource.imageUrl ?? offers.find((o) => o.imageUrl)?.imageUrl ?? null,
    offers,
    priceRange: { min: first.price.total, max: last.price.total },
    rating: aggregateRating(offers),
    matchedBy: cluster.weakestBasis ?? "single",
    unavailable,
    onIntent: offers.some((o) => classes?.get(o.id)?.onIntent ?? true),
    isAccessory: cluster.members.every((m) => m.tokens.isAccessory),
  };
}

/**
 * Groups the same product across stores. Products are placed cheapest-first,
 * so when one store lists the item twice, the cheaper listing joins the group
 * and the other stays as its own card. Pure and deterministic.
 */
export function groupProducts(
  products: readonly UnifiedProduct[],
  options: GroupingOptions = {},
): ProductGroup[] {
  const policy = options.policy ?? DEFAULT_MATCHING_POLICY;
  const clusters: Cluster[] = [];

  for (const product of [...products].sort(compareOffers)) {
    const candidate = candidateFor(product, options.classes);
    const placement = findCluster(candidate, clusters, policy);
    if (placement) {
      placement.cluster.members.push(candidate);
      placement.cluster.weakestBasis = weaker(placement.cluster.weakestBasis, placement.basis);
    } else {
      clusters.push({ members: [candidate], weakestBasis: null });
    }
  }
  // Accessories never pick up a "doesn't ship" note: it would describe the product they fit.
  const listings = (options.unavailable ?? [])
    .map((listing) => ({ listing, tokens: tokenizeTitle(listing.title) }))
    .filter(({ tokens }) => tokens.accessorySignal === "none");
  return clusters.map((cluster) => {
    const isAccessory = cluster.members.every((m) => m.tokens.isAccessory);
    return toGroup(cluster, isAccessory ? [] : unavailableFor(cluster, listings, policy), options.classes);
  });
}
