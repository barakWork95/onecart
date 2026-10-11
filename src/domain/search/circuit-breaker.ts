/**
 * Per-provider circuit breaker as a pure state machine. Persistence (Redis)
 * lives behind `CircuitBreakerStore`, so every server instance shares state.
 *
 * closed ──N consecutive retryable failures──▶ open ──cooldown elapsed──▶ (probe)
 *   ▲                                                                       │
 *   └──────────────── probe succeeds ◀──────────────────────────────────────┘
 *                     probe fails → open again with a fresh cooldown
 */

export interface CircuitBreakerPolicy {
  /** Consecutive retryable failures that open the circuit. */
  readonly failureThreshold: number;
  /** How long the circuit stays open before a probe request is allowed. */
  readonly cooldownMs: number;
}

export const DEFAULT_CIRCUIT_BREAKER_POLICY: CircuitBreakerPolicy = {
  failureThreshold: 5,
  cooldownMs: 30_000,
};

export type CircuitState =
  | { readonly status: "closed"; readonly consecutiveFailures: number }
  | { readonly status: "open"; readonly openedAtMs: number };

export const CLOSED_CIRCUIT: CircuitState = { status: "closed", consecutiveFailures: 0 };

/**
 * - `allow`: circuit closed, call normally.
 * - `probe`: cooldown elapsed (half-open), call once to test recovery.
 * - `reject`: circuit open, don't call.
 */
export type CircuitDecision = "allow" | "probe" | "reject";

export function decideCircuit(
  state: CircuitState | null,
  nowMs: number,
  policy: CircuitBreakerPolicy,
): CircuitDecision {
  if (!state || state.status === "closed") return "allow";
  return nowMs - state.openedAtMs >= policy.cooldownMs ? "probe" : "reject";
}

export function circuitAfterSuccess(): CircuitState {
  return CLOSED_CIRCUIT;
}

export function circuitAfterFailure(
  state: CircuitState | null,
  decision: CircuitDecision,
  nowMs: number,
  policy: CircuitBreakerPolicy,
): CircuitState {
  if (decision === "probe" || state?.status === "open") return { status: "open", openedAtMs: nowMs };
  const consecutiveFailures = (state?.consecutiveFailures ?? 0) + 1;
  return consecutiveFailures >= policy.failureThreshold
    ? { status: "open", openedAtMs: nowMs }
    : { status: "closed", consecutiveFailures };
}
