import type { DeliveryOutcome, PushDirectory, StoredSubscription } from "@/domain/notifications/ports";
import type { PushMessage, PushSender } from "@/domain/notifications/push";
import { noopLogger, type Logger } from "@/domain/shared/logger";
import type { PriceAlert } from "@/domain/user-lists/price-alert";
import type { TriggeredAlertRepository } from "@/domain/user-lists/ports";
import { DEFAULT_LOCALE, type Locale } from "@/domain/shared/locale";
import { dict } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/locales";
import { formatMoney } from "@/lib/format";

/** Titles beyond this are cut: notification banners show a line or two. */
const MAX_TITLE = 56;
/** A drop older than this is stale news: it's marked handled, not pushed. */
const STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
/** Consecutive failures before a subscription is dropped. */
export const MAX_DELIVERY_FAILURES = 5;
/** Sends in flight at once. */
const CONCURRENCY = 5;

export interface NotifyTriggeredAlertsDeps {
  readonly alerts: TriggeredAlertRepository;
  readonly directory: PushDirectory;
  readonly sender: PushSender;
  readonly now?: () => Date;
  readonly logger?: Logger;
  readonly batchSize?: number;
}

export interface NotificationSummary {
  /** Triggered alerts waiting to be notified. */
  readonly alerts: number;
  /** Alerts pushed to at least one browser. */
  readonly notified: number;
  readonly sent: number;
  readonly expired: number;
  readonly failed: number;
  /** Marked handled without a push: no subscription, or triggered too long ago. */
  readonly skipped: number;
}

/** The notification for a triggered alert, in the subscriber's language. */
export function alertMessage(alert: PriceAlert, locale: Locale = DEFAULT_LOCALE): PushMessage {
  const t = dict(locale).notifications;
  const title = alert.title.length > MAX_TITLE ? `${alert.title.slice(0, MAX_TITLE)}…` : alert.title;
  const target = formatMoney(alert.target, { precise: true, locale });
  return {
    title: t.priceDrop(title),
    body: alert.lastSeen
      ? t.nowAt(formatMoney(alert.lastSeen, { precise: true, locale }), target)
      : t.reachedTarget(target),
    url: localizedPath(locale, "/alerts"),
    tag: `alert-${alert.id}`,
  };
}

/**
 * Pushes each triggered, not-yet-notified alert to its owner's browsers, so
 * every trigger is sent once. An alert is marked notified once any browser
 * accepted it; if every send failed it waits for the next run. Alerts with no
 * subscription, or triggered days ago, are marked handled without a push.
 */
export function createNotifyTriggeredAlerts(deps: NotifyTriggeredAlertsDeps) {
  const now = deps.now ?? (() => new Date());
  const logger = deps.logger ?? noopLogger;

  return async function notifyTriggeredAlerts(): Promise<NotificationSummary> {
    const waiting = await deps.alerts.listUnnotified(deps.batchSize ?? 500);
    const summary = { alerts: waiting.length, notified: 0, sent: 0, expired: 0, failed: 0, skipped: 0 };
    if (waiting.length === 0) return summary;

    const at = now();
    const subscriptions = await deps.directory.subscriptionsFor([...new Set(waiting.map((w) => w.userId))]);
    const byUser = new Map<string, StoredSubscription[]>();
    for (const s of subscriptions) byUser.set(s.userId, [...(byUser.get(s.userId) ?? []), s]);

    const handled: string[] = [];
    const jobs: { alert: PriceAlert; subscription: StoredSubscription }[] = [];
    for (const { userId, alert } of waiting) {
      const triggeredMs = alert.triggeredAt ? Date.parse(alert.triggeredAt) : at.getTime();
      const targets = byUser.get(userId) ?? [];
      if (targets.length === 0 || at.getTime() - triggeredMs > STALE_AFTER_MS) {
        handled.push(alert.id);
        summary.skipped++;
      } else for (const subscription of targets) jobs.push({ alert, subscription });
    }

    const outcomes: (DeliveryOutcome & { readonly alertId: string })[] = [];
    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      const batch = jobs.slice(i, i + CONCURRENCY);
      outcomes.push(
        ...(await Promise.all(
          batch.map(async ({ alert, subscription }) => ({
            alertId: alert.id,
            subscription,
            result: (await deps.sender.send(subscription, alertMessage(alert, subscription.locale))).result,
          })),
        )),
      );
    }

    for (const o of outcomes) summary[o.result]++;
    const delivered = new Set(outcomes.filter((o) => o.result === "sent").map((o) => o.alertId));
    summary.notified = delivered.size;
    handled.push(...delivered);

    if (outcomes.length > 0) {
      try {
        await deps.directory.recordDeliveries(outcomes, MAX_DELIVERY_FAILURES);
      } catch (error) {
        // Bookkeeping only: the pushes already went out.
        logger.warn("push: recording deliveries failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (handled.length > 0) await deps.alerts.markNotified(handled, at.toISOString());
    return summary;
  };
}
