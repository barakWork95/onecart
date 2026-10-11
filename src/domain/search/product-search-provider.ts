import type { UnifiedProduct } from "@/domain/product/unified-product";
import type { ProviderId } from "@/domain/shared/provider";
import type { Result } from "@/domain/shared/result";
import type { SearchQuery } from "@/domain/search/search-query";

export type ProviderErrorKind =
  | "timeout"
  | "rate_limited"
  | "unauthorized"
  | "upstream_error"
  /** Upstream responded but the payload didn't match the expected schema. */
  | "parse_error";

export interface ProviderError {
  readonly provider: ProviderId;
  readonly kind: ProviderErrorKind;
  /** Stable code surfaced in `ProviderOutcome.errorCode`. */
  readonly code: string;
  /** Internal detail for logs only — never sent to the client. */
  readonly detail?: string;
  /** Whether the circuit breaker should count this as a failure (auth/parse errors are bugs, not outages). */
  readonly retryable: boolean;
}

/**
 * Port implemented by every provider adapter in `src/infrastructure/providers/*`.
 * Adapters must never throw for upstream failures — return `err(...)` instead,
 * so the orchestrator can degrade gracefully.
 */
export interface ProductSearchProvider {
  readonly id: ProviderId;
  search(
    query: SearchQuery,
    options: { readonly signal: AbortSignal },
  ): Promise<Result<readonly UnifiedProduct[], ProviderError>>;
}
