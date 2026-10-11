import type { IsoDateTime } from "@/domain/product/unified-product";
import { money, type Money } from "@/domain/shared/money";
import { err, ok, type Result } from "@/domain/shared/result";
import type { ProductSnapshot } from "@/domain/user-lists/product-snapshot";

export type AlertStatus = "active" | "triggered";

export interface PriceAlert extends Omit<ProductSnapshot, "price"> {
  readonly id: string;
  /** Notify when the landed total is at or below this (ILS). */
  readonly target: Money;
  /** Landed total when the alert was created. */
  readonly baseline: Money;
  /** Most recent landed total seen by the checker; null until first check or while unavailable. */
  readonly lastSeen: Money | null;
  readonly lastCheckedAt: IsoDateTime | null;
  readonly status: AlertStatus;
  readonly triggeredAt: IsoDateTime | null;
  readonly createdAt: IsoDateTime;
}

export type TargetError = "target_not_positive" | "target_not_below_current";

/** A target must be a real drop: positive and strictly below today's price. */
export function validateTarget(target: Money, current: Money): Result<Money, TargetError> {
  if (target.currency !== "ILS" || target.amountMinor <= 0) return err("target_not_positive");
  if (target.amountMinor >= current.amountMinor) return err("target_not_below_current");
  return ok(target);
}

/** Default suggestion: 10% off, rounded down to a whole shekel (at least ₪1). */
export function suggestTarget(current: Money): Money {
  const shekels = Math.floor((current.amountMinor * 0.9) / 100);
  return money(Math.max(1, shekels) * 100, "ILS");
}

export interface AlertObservation {
  /** Today's landed total, or null if the product wasn't found in today's results. */
  readonly price: Money | null;
  readonly at: IsoDateTime;
}

/**
 * Pure state transition for the daily checker. A triggered alert stays
 * triggered (the user decides what to do next); prices keep being recorded.
 */
export function evaluateAlert(alert: PriceAlert, observation: AlertObservation): PriceAlert {
  const lastSeen = observation.price ?? alert.lastSeen;
  const dropped =
    alert.status === "active" &&
    observation.price !== null &&
    observation.price.amountMinor <= alert.target.amountMinor;
  return {
    ...alert,
    lastSeen,
    lastCheckedAt: observation.at,
    status: dropped ? "triggered" : alert.status,
    triggeredAt: dropped ? observation.at : alert.triggeredAt,
  };
}
