import type { PushResult, PushSubscriptionKeys } from "@/domain/notifications/push";

/** One user's push subscriptions (request-scoped; RLS limits it to their rows). */
export interface PushSubscriptionRepository {
  /** Idempotent per browser: subscribing again refreshes the keys. */
  save(subscription: PushSubscriptionKeys): Promise<void>;
  remove(endpoint: string): Promise<void>;
}

export interface StoredSubscription extends PushSubscriptionKeys {
  readonly userId: string;
  readonly failureCount: number;
}

export interface DeliveryOutcome {
  readonly subscription: StoredSubscription;
  readonly result: PushResult;
}

/** Cross-user subscriptions for the daily sender (service role). */
export interface PushDirectory {
  subscriptionsFor(userIds: readonly string[]): Promise<readonly StoredSubscription[]>;
  /**
   * `sent`: resets failures, stamps last success; `expired`: deletes it;
   * `failed`: counts a failure, deleting it at `maxFailures` in a row.
   */
  recordDeliveries(outcomes: readonly DeliveryOutcome[], maxFailures: number): Promise<void>;
}
