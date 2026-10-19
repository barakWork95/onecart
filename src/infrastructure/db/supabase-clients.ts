import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchWithTimeout, SUPABASE_TIMEOUT_MS } from "@/infrastructure/db/fetch-with-timeout";

/** Every Supabase call has a deadline: a stalled database never hangs a page or an action. */
const global = { fetch: fetchWithTimeout(SUPABASE_TIMEOUT_MS) };

export interface SupabaseCookieStore {
  getAll(): { name: string; value: string }[];
  set(name: string, value: string, options?: Record<string, unknown>): unknown;
}

/**
 * Request-scoped client acting as the visitor (publishable key + their session
 * cookie), so RLS applies. Server Components can't write cookies; the session
 * refresh happens in `src/proxy.ts`, so a failed write there is safe to ignore.
 */
export function createSupabaseUserClient(
  url: string,
  publishableKey: string,
  cookies: SupabaseCookieStore,
): SupabaseClient {
  return createServerClient(url, publishableKey, {
    global,
    cookies: {
      getAll: () => cookies.getAll(),
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) cookies.set(name, value, options);
        } catch {
          // Called from a Server Component render: cookies are read-only there.
        }
      },
    },
  });
}

/** Service-role client for background jobs. Bypasses RLS — never use it for a user's request. */
export function createSupabaseServiceClient(url: string, secretKey: string): SupabaseClient {
  return createClient(url, secretKey, {
    global,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
