import { isFeaturableListing } from "@/domain/deals/featured-listing";
import { detectPriceDrop, PRICE_DROP_POLICY, type PriceDropPolicy } from "@/domain/deals/price-drop";
import type {
  PriceDropBoard,
  PriceDropCard,
  PriceHistoryStore,
  PriceObservation,
} from "@/domain/deals/ports";
import { tokenizeTitle } from "@/domain/matching/title-tokens";
import type { UnifiedProduct } from "@/domain/product/unified-product";
import { intentTier } from "@/domain/search/result-ordering";
import { searchIntent } from "@/domain/search/search-intent";
import type { SearchResponse } from "@/domain/search/search-response";
import { noopLogger, type Logger } from "@/domain/shared/logger";
import { money } from "@/domain/shared/money";

/** An observation with the product it came from (for the card, if it turns out to be a drop). */
export interface Observed {
  readonly observation: PriceObservation;
  readonly product: UnifiedProduct;
}

/**
 * What a warm run records from one search: listings of the product the query
 * names (no accessories, no related items) that a homepage card could feature.
 * Only these can become drop cards, so only these are worth a row.
 */
export function observationsFrom(query: string, response: SearchResponse, day: string): Observed[] {
  const intent = searchIntent(response.query.normalizedText);
  return response.groups
    .filter((g) => !g.isAccessory && intentTier(g, intent) === 0)
    .flatMap((g) => g.listings)
    .filter((p) => isFeaturableListing(p, tokenizeTitle(p.title), intent))
    .map((product) => ({
      product,
      observation: {
        productId: product.id,
        provider: product.provider,
        day,
        totalMinor: product.price.total.amountMinor,
        itemMinor: product.price.item.amountMinor,
        query,
        title: product.title.slice(0, 300),
      },
    }));
}

/** History kept: four lookbacks, so a drop can always be judged on a full month. */
const RETENTION_DAYS = 120;
/** Cards kept on the board, biggest drops first. */
const MAX_DROP_CARDS = 12;
/** Per search, so one query's sellers can't fill the board. */
const MAX_CARDS_PER_QUERY = 2;

function daysBefore(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export interface RecordPriceHistoryDeps {
  readonly history: PriceHistoryStore;
  readonly board: PriceDropBoard;
  readonly policy?: PriceDropPolicy;
  readonly logger?: Logger;
}

export interface PriceHistoryRun {
  readonly recorded: number;
  readonly drops: number;
}

/**
 * After a warm run: record today's prices, prune old days, find products at a
 * real drop against our own history, and leave their cards on the board.
 */
export function createRecordPriceHistory(deps: RecordPriceHistoryDeps) {
  const policy = deps.policy ?? PRICE_DROP_POLICY;
  const logger = deps.logger ?? noopLogger;

  return async function recordPriceHistory(
    observed: readonly Observed[],
    today: string,
  ): Promise<PriceHistoryRun> {
    // A product found by two searches is one row, under the first search that found it.
    const byId = new Map<string, Observed>();
    for (const o of observed) if (!byId.has(o.observation.productId)) byId.set(o.observation.productId, o);
    const rows = [...byId.values()];
    if (rows.length === 0) return { recorded: 0, drops: 0 };

    await deps.history.record(rows.map((o) => o.observation));
    try {
      await deps.history.prune(daysBefore(today, RETENTION_DAYS));
    } catch (error) {
      logger.warn("price-history: prune failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const past = await deps.history.history([...byId.keys()], daysBefore(today, policy.lookbackDays));
    const cards: PriceDropCard[] = [];
    for (const { observation, product } of rows) {
      const drop = detectPriceDrop(
        past.filter((p) => p.productId === observation.productId),
        today,
        policy,
      );
      if (!drop) continue;
      cards.push({
        productId: product.id,
        provider: product.provider,
        title: product.title,
        imageUrl: product.imageUrl,
        productUrl: product.productUrl,
        query: observation.query,
        current: money(drop.currentMinor, "ILS"),
        typical: money(drop.typicalMinor, "ILS"),
        dropShare: drop.dropShare,
        historyDays: drop.historyDays,
        observedAt: product.fetchedAt,
      });
    }

    const perQuery = new Map<string, number>();
    const board = cards
      .sort((a, b) => b.dropShare - a.dropShare || a.productId.localeCompare(b.productId))
      .filter((card) => {
        const n = perQuery.get(card.query) ?? 0;
        perQuery.set(card.query, n + 1);
        return n < MAX_CARDS_PER_QUERY;
      })
      .slice(0, MAX_DROP_CARDS);
    await deps.board.save(board);
    return { recorded: rows.length, drops: board.length };
  };
}
