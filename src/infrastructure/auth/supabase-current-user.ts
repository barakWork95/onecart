import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentUser } from "@/domain/user-lists/ports";

/**
 * Identity from the Supabase session cookie. `getClaims()` verifies the JWT
 * (locally with asymmetric signing keys, otherwise via the Auth server), so
 * the id can be trusted. New visitors become anonymous users on their first
 * save — no sign-up wall; the account can be upgraded to email/OAuth later.
 */
export function createSupabaseCurrentUser(client: SupabaseClient): CurrentUser {
  async function getUserId(): Promise<string | null> {
    const { data, error } = await client.auth.getClaims();
    if (error || !data) return null;
    return typeof data.claims.sub === "string" ? data.claims.sub : null;
  }

  return {
    getUserId,
    async ensureUserId() {
      const existing = await getUserId();
      if (existing) return existing;
      const { data, error } = await client.auth.signInAnonymously();
      if (error || !data.user)
        throw new Error(`Anonymous sign-in failed: ${error?.message ?? "no user returned"}`);
      return data.user.id;
    },
  };
}
