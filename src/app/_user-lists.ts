import "server-only";

import { cookies } from "next/headers";
import { getServices, findOffer, offersFor } from "@/app/_composition";
import { createCheckPriceAlerts } from "@/application/user-lists/check-price-alerts";
import { createUserListsService } from "@/application/user-lists/user-lists";
import type { CurrentUser, UserListsRepository } from "@/domain/user-lists/ports";
import { createCookieCurrentUser } from "@/infrastructure/auth/cookie-current-user";
import { createSupabaseCurrentUser } from "@/infrastructure/auth/supabase-current-user";
import { createSupabaseServiceClient, createSupabaseUserClient } from "@/infrastructure/db/supabase-clients";
import {
  createSupabaseAlertCheckRepository,
  createSupabaseUserListsRepository,
} from "@/infrastructure/db/supabase-user-lists";
import { consoleLogger } from "@/infrastructure/logging/console-logger";

/**
 * Request-scoped wiring for wishlists and alerts. Must be called while
 * handling a request (it reads cookies).
 */
export const userListsService = createUserListsService({ findOffer });

export type UserListsAccess =
  /** No backend configured (no Supabase, not demo mode): hide save/alert UI. */
  | { readonly kind: "unavailable" }
  /** Backend available but this visitor has no account yet (nothing saved). */
  | { readonly kind: "no_user" }
  | { readonly kind: "user"; readonly repo: UserListsRepository };

async function currentUserAndRepo(): Promise<{
  currentUser: CurrentUser;
  repoFor: (userId: string) => UserListsRepository;
} | null> {
  const backend = getServices().userListsBackend;
  const jar = await cookies();

  if (backend.kind === "supabase") {
    const client = createSupabaseUserClient(backend.url, backend.publishableKey, jar);
    return {
      currentUser: createSupabaseCurrentUser(client),
      repoFor: (userId) => createSupabaseUserListsRepository(client, userId),
    };
  }
  if (backend.kind === "memory") {
    return {
      currentUser: createCookieCurrentUser(jar, { secure: process.env.NODE_ENV === "production" }),
      repoFor: (userId) => backend.store.forUser(userId),
    };
  }
  return null;
}

/** For rendering: never creates a user. */
export async function readUserLists(): Promise<UserListsAccess> {
  const wiring = await currentUserAndRepo();
  if (!wiring) return { kind: "unavailable" };
  const userId = await wiring.currentUser.getUserId();
  return userId ? { kind: "user", repo: wiring.repoFor(userId) } : { kind: "no_user" };
}

/** For Server Actions: creates an (anonymous) user on first write. */
export async function writeUserLists(): Promise<UserListsRepository | null> {
  const wiring = await currentUserAndRepo();
  if (!wiring) return null;
  return wiring.repoFor(await wiring.currentUser.ensureUserId());
}

/** The daily checker, or null when there's no cross-user access (no service key / no backend). */
export function priceAlertChecker() {
  const backend = getServices().userListsBackend;
  const alerts =
    backend.kind === "memory"
      ? backend.store.alertCheck
      : backend.kind === "supabase" && backend.secretKey
        ? createSupabaseAlertCheckRepository(createSupabaseServiceClient(backend.url, backend.secretKey))
        : null;
  return alerts ? createCheckPriceAlerts({ alerts, fetchOffers: offersFor, logger: consoleLogger }) : null;
}
