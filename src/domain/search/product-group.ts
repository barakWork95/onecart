import {
  blocksGrouping,
  DEFAULT_MATCHING_POLICY,
  findConflict,
  matchProducts,
  matchSameStore,
  matchTitles,
  toMatchCandidate,
  type MatchBasis,
  type MatchCandidate,
  type MatchingPolicy,
} from "@/domain/matching/product-matcher";
import { tokenizeTitle } from "@/domain/matching/title-tokens";
import type { UnavailableListing } from "@/domain/product/unavailable-listing";
import type { ProductRating, UnifiedProduct } from "@/domain/product/unified-product";
import { heroImage, heroTitleListing, type ListingRank } from "@/domain/search/hero-listing";
import type { OfferClass } from "@/domain/search/search-intent";
import { compareMoney, type Money } from "@/domain/shared/money";

/** Non-empty list of offers, cheapest landed total first. */
export type Offers = readonly [UnifiedProduct, ...UnifiedProduct[]];

/**
 * The same product found in one or more stores — one card in the results list
 * and one row per store in the compare sheet. A store can have several
 * listings of it (sellers, colours); `offers` holds each store's cheapest and
 * `listings` all of them.
 */
export interface ProductGroup {
  /** Stable for identical input: derived from the cheapest offer's id. */
  readonly id: string;
  /** From the most-reviewed listing (usually the canonical page), else the stores' best match. */
  readonly title: string;
  /** A catalog photo when a store has one (Amazon), else the best-ranked listing's; see `heroImage`. */
  readonly imageUrl: string | null;
  /** Each store's cheapest listing, cheapest first: the per-store comparison. */
  readonly offers: Offers;
  /** Every listing of the product, from every store, cheapest first. */
  readonly listings: Offers;
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
  /** Each listing's position in its store's results; picks the card's photo and title. */
  readonly rankOf?: ListingRank;
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

/** A listing's positive match with a group member: across stores, or a second listing at one store. */
function memberMatch(candidate: MatchCandidate, member: MatchCandidate, policy: MatchingPolicy) {
  return candidate.product.provider === member.product.provider
    ? matchSameStore(candidate, member, policy)
    : matchProducts(candidate, member, policy);
}

/**
 * Best placement for a candidate. Two rules keep groups precise:
 * - nothing in the group may conflict with it (a different model, size,
 *   generation, brand, condition, or price far off), so A~B and B~C can't
 *   chain an A and C that disagree;
 * - it must positively match more than half the members, and every member
 *   when the match rests on title similarity alone. Sellers word one product
 *   many ways, so a 17-listing eBay group needn't match each title.
 * Most matched members, then the highest minimum score, wins.
 */
function findCluster(
  candidate: MatchCandidate,
  clusters: readonly Cluster[],
  policy: MatchingPolicy,
): { cluster: Cluster; basis: MatchBasis } | null {
  let best: { cluster: Cluster; basis: MatchBasis; share: number; score: number } | null = null;

  for (const cluster of clusters) {
    let minScore = Number.POSITIVE_INFINITY;
    let basis: MatchBasis | null = null;
    let matched = 0;
    let blocked = false;

    for (const member of cluster.members) {
      if (blocksGrouping(candidate, member, policy)) {
        blocked = true;
        break;
      }
      const match = memberMatch(candidate, member, policy);
      if (!match) continue;
      matched++;
      minScore = Math.min(minScore, match.score);
      basis = weaker(basis, match.basis);
    }

    const size = cluster.members.length;
    const enough = basis === "title_similarity" ? matched === size : matched * 2 > size;
    const share = matched / size;
    if (blocked || !basis || !enough) continue;
    if (!best || share > best.share || (share === best.share && minScore > best.score))
      best = { cluster, basis, share, score: minScore };
  }
  return best;
}

/**
 * Joins clusters that placement order kept apart: one listing at a time, a
 * seller's odd wording can start a second cluster of the same product. Two
 * clusters merge when no pair across them conflicts and more than half the
 * pairs match (every pair, when only titles match).
 */
function mergeClusters(clusters: Cluster[], policy: MatchingPolicy): Cluster[] {
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const a = clusters[i];
        const b = clusters[j];
        if (!a || !b) continue;
        let pairs = 0;
        let matched = 0;
        let basis: MatchBasis | null = null;
        let blocked = false;
        for (const x of a.members) {
          for (const y of b.members) {
            pairs++;
            if (blocksGrouping(x, y, policy)) {
              blocked = true;
              break;
            }
            const match = memberMatch(x, y, policy);
            if (match) {
              matched++;
              basis = weaker(basis, match.basis);
            }
          }
          if (blocked) break;
        }
        const enough = basis === "title_similarity" ? matched === pairs : matched * 2 > pairs;
        if (blocked || !basis || !enough) continue;
        clusters[i] = {
          members: [...a.members, ...b.members],
          weakestBasis: weaker(weaker(a.weakestBasis, basis), b.weakestBasis ?? basis),
        };
        clusters.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  return clusters;
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
 * matches it: no conflict with any listing in the group (model, generation,
 * condition…) and a title match with at least one. It only adds a "won't ship
 * to Israel" note, so one seller's wording is enough once nothing disagrees.
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
    if (
      cluster.members.some(
        (m) => m.tokens.isAccessory !== tokens.isAccessory || findConflict(m.tokens, tokens),
      )
    )
      continue;
    const scores = cluster.members.flatMap((m) => matchTitles(m.tokens, tokens, policy)?.score ?? []);
    if (scores.length === 0) continue;
    const score = scores.reduce((sum, x) => sum + x, 0) / scores.length;
    const current = best.get(listing.provider);
    if (!current || score > current.score) best.set(listing.provider, { listing, score });
  }
  return [...best.values()].map((b) => b.listing).sort((a, b) => a.provider.localeCompare(b.provider));
}

function toGroup(
  cluster: Cluster,
  unavailable: readonly UnavailableListing[],
  classes: GroupingOptions["classes"],
  rankOf: ListingRank | undefined,
): ProductGroup {
  const [first, ...rest] = cluster.members.map((m) => m.product).sort(compareOffers);
  // Clusters are created with one member and only grow.
  if (!first) throw new Error("Invariant violated: empty product cluster");
  const listings: Offers = [first, ...rest];
  const stores = new Set([first.provider]);
  const offers: Offers = [first, ...rest.filter((o) => !stores.has(o.provider) && stores.add(o.provider))];
  const last = listings[listings.length - 1] ?? first;

  const titleSource = heroTitleListing(listings, rankOf);

  return {
    id: `grp:${first.id}`,
    title: titleSource.title,
    imageUrl: heroImage(listings, unavailable, rankOf),
    offers,
    listings,
    priceRange: { min: first.price.total, max: last.price.total },
    rating: aggregateRating(listings),
    matchedBy: offers.length > 1 ? (cluster.weakestBasis ?? "single") : "single",
    unavailable,
    onIntent: listings.some((o) => classes?.get(o.id)?.onIntent ?? true),
    isAccessory: cluster.members.every((m) => m.tokens.isAccessory),
  };
}

/**
 * Groups the same product across stores, and its several listings within a
 * store, into one card. Products are placed cheapest-first. Pure and
 * deterministic.
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
  mergeClusters(clusters, policy);
  // Accessories never pick up a "doesn't ship" note: it would describe the product they fit.
  const listings = (options.unavailable ?? [])
    .map((listing) => ({ listing, tokens: tokenizeTitle(listing.title) }))
    .filter(({ tokens }) => tokens.accessorySignal === "none");
  return clusters.map((cluster) => {
    const isAccessory = cluster.members.every((m) => m.tokens.isAccessory);
    return toGroup(
      cluster,
      isAccessory ? [] : unavailableFor(cluster, listings, policy),
      options.classes,
      options.rankOf,
    );
  });
}
