import { randomUUID } from "node:crypto";
import type { CurrentUser } from "@/domain/user-lists/ports";

export const DEMO_USER_COOKIE = "onecart_demo_uid";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CookieJar {
  get(name: string): { readonly value: string } | undefined;
  set(
    name: string,
    value: string,
    options: { httpOnly: boolean; sameSite: "lax"; secure: boolean; path: string; maxAge: number },
  ): unknown;
}

/**
 * Demo-mode identity: a random id in an httpOnly cookie, paired with the
 * in-memory store. Not an authentication mechanism — never used with Supabase.
 */
export function createCookieCurrentUser(cookies: CookieJar, options: { secure: boolean }): CurrentUser {
  function getUserId(): Promise<string | null> {
    const value = cookies.get(DEMO_USER_COOKIE)?.value;
    return Promise.resolve(value && UUID.test(value) ? value : null);
  }
  return {
    getUserId,
    async ensureUserId() {
      const existing = await getUserId();
      if (existing) return existing;
      const id = randomUUID();
      cookies.set(DEMO_USER_COOKIE, id, {
        httpOnly: true,
        sameSite: "lax",
        secure: options.secure,
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
      return id;
    },
  };
}
