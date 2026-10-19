/** How long one Supabase call may take before we give up on it. */
export const SUPABASE_TIMEOUT_MS = 5_000;

/**
 * `fetch` with a deadline, for clients (Supabase) that would otherwise wait on
 * a stalled connection for as long as the platform lets the function run. The
 * caller's own signal still applies.
 */
export function fetchWithTimeout(ms: number, base: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const deadline = AbortSignal.timeout(ms);
    const signal = init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
    return base(input, { ...init, signal });
  };
}
