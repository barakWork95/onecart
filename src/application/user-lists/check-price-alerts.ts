import type { UnifiedProduct } from "@/domain/product/unified-product";
import { noopLogger, type Logger } from "@/domain/shared/logger";
import { evaluateAlert, type PriceAlert } from "@/domain/user-lists/price-alert";
import type { AlertCheckRepository } from "@/domain/user-lists/ports";

/** All offers for a search text (any page), or null if the search itself failed. */
export type FetchOffers = (searchText: string) => Promise<readonly UnifiedProduct[] | null>;

export interface PriceCheckSummary {
  readonly checked: number;
  readonly triggered: number;
  /** Alerts whose product didn't appear in today's results. */
  readonly missing: number;
  /** Searches that failed; their alerts are left untouched and retried next run. */
  readonly failedSearches: number;
}

export interface CheckPriceAlertsDeps {
  readonly alerts: AlertCheckRepository;
  readonly fetchOffers: FetchOffers;
  readonly now?: () => Date;
  readonly logger?: Logger;
  /** Upper bound per run so one invocation stays inside serverless time limits. */
  readonly batchSize?: number;
}

/**
 * The daily price-alert job. Alerts sharing a search are checked with one
 * search (which itself hits the 24h cache), so cost scales with distinct
 * queries, not users.
 */
export function createCheckPriceAlerts(deps: CheckPriceAlertsDeps) {
  const now = deps.now ?? (() => new Date());
  const logger = deps.logger ?? noopLogger;

  return async function checkPriceAlerts(): Promise<PriceCheckSummary> {
    const active = await deps.alerts.listActiveAlerts(deps.batchSize ?? 500);
    const bySearch = new Map<string, PriceAlert[]>();
    for (const alert of active)
      bySearch.set(alert.searchText, [...(bySearch.get(alert.searchText) ?? []), alert]);

    const updated: PriceAlert[] = [];
    let missing = 0;
    let failedSearches = 0;

    for (const [searchText, alerts] of bySearch) {
      const offers = await deps.fetchOffers(searchText).catch((error: unknown) => {
        logger.warn("price-alerts: search threw", {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      });
      if (!offers) {
        failedSearches++;
        continue;
      }
      const byId = new Map(offers.map((o) => [o.id, o]));
      const at = now().toISOString();
      for (const alert of alerts) {
        const offer = byId.get(alert.productId);
        if (!offer) missing++;
        updated.push(evaluateAlert(alert, { price: offer?.price.total ?? null, at }));
      }
    }

    if (updated.length > 0) await deps.alerts.saveObservations(updated);
    return {
      checked: updated.length,
      triggered: updated.filter((a) => a.status === "triggered").length,
      missing,
      failedSearches,
    };
  };
}
