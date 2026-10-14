import "server-only";

import { cookies } from "next/headers";
import { getServices, findOffer, offersFor } from "@/app/_composition";
import { createCheckPriceAlerts } from "@/application/user-lists/check-price-alerts";
import {
  createNotifyTriggeredAlerts,
  MAX_DELIVERY_FAILURES,
} from "@/application/user-lists/notify-triggered-alerts";
import { env, webPushConfig } from "@/config/env";
import type { PushSubscriptionRepository } from "@/domain/notifications/ports";
import { createUserListsService } from "@/application/user-lists/user-lists";
import type { CurrentUser, UserListsRepository } from "@/domain/user-lists/ports";
import { createCookieCurrentUser } from "@/infrastructure/auth/cookie-current-user";
import { createSupabaseCurrentUser } from "@/infrastructure/auth/supabase-current-user";
import { createSupabaseServiceClient, createSupabaseUserClient } from "@/infrastructure/db/supabase-clients";
import {
  createSupabasePushDirectory,
  createSupabasePushSubscriptions,
} from "@/infrastructure/db/supabase-push-subscriptions";
import {
  createSupabaseAlertCheckRepository,
  createSupabaseTriggeredAlertRepository,
  createSupabaseUserListsRepository,
} from "@/infrastructure/db/supabase-user-lists";
import { createWebPushSender } from "@/infrastructure/notifications/web-push-sender";
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
  pushFor: (userId: string) => PushSubscriptionRepository;
} | null> {
  const backend = getServices().userListsBackend;
  const jar = await cookies();

  if (backend.kind === "supabase") {
    const client = createSupabaseUserClient(backend.url, backend.publishableKey, jar);
    return {
      currentUser: createSupabaseCurrentUser(client),
      repoFor: (userId) => createSupabaseUserListsRepository(client, userId),
      pushFor: (userId) => createSupabasePushSubscriptions(client, userId),
    };
  }
  if (backend.kind === "memory") {
    return {
      currentUser: createCookieCurrentUser(jar, { secure: process.env.NODE_ENV === "production" }),
      repoFor: (userId) => backend.store.forUser(userId),
      pushFor: (userId) => backend.push.forUser(userId),
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

/**
 * The VAPID public key the browser subscribes with, or null when price-alert
 * notifications are off (keys not configured, or no backend for alerts).
 */
export function pushPublicKey(): string | null {
  const config = webPushConfig(env());
  return config && getServices().userListsBackend.kind !== "none" ? config.publicKey : null;
}

/** For Server Actions: this visitor's push subscriptions, creating an anonymous user if needed. */
export async function writePushSubscriptions(): Promise<PushSubscriptionRepository | null> {
  if (!pushPublicKey()) return null;
  const wiring = await currentUserAndRepo();
  if (!wiring) return null;
  return wiring.pushFor(await wiring.currentUser.ensureUserId());
}

/** Cross-user stores and a sender for pushing, or null when push is off or there's no service access. */
function pushStores() {
  const config = webPushConfig(env());
  if (!config) return null;
  const backend = getServices().userListsBackend;
  const sender = createWebPushSender(config);
  if (backend.kind === "memory")
    return { alerts: backend.store.triggered, directory: backend.push.directory, sender };
  if (backend.kind === "supabase" && backend.secretKey) {
    const service = createSupabaseServiceClient(backend.url, backend.secretKey);
    return {
      alerts: createSupabaseTriggeredAlertRepository(service),
      directory: createSupabasePushDirectory(service),
      sender,
    };
  }
  return null;
}

/** The daily notifier, or null when push is off or there's no cross-user access. */
export function triggeredAlertNotifier() {
  const stores = pushStores();
  return stores ? createNotifyTriggeredAlerts({ ...stores, logger: consoleLogger }) : null;
}

export type TestPushResult =
  | { readonly kind: "not_configured" }
  | { readonly kind: "no_subscription" }
  | { readonly kind: "sent"; readonly sent: number; readonly expired: number; readonly failed: number };

/**
 * TEMPORARY (internal /internal/push-test): pushes a test notification to the
 * calling browser's own subscriptions, to check delivery end to end on a real
 * device. It can only ever reach the caller's own anonymous account.
 */
export async function sendTestNotification(): Promise<TestPushResult> {
  const stores = pushStores();
  const wiring = await currentUserAndRepo();
  if (!stores || !wiring) return { kind: "not_configured" };
  const userId = await wiring.currentUser.getUserId();
  const subscriptions = userId ? await stores.directory.subscriptionsFor([userId]) : [];
  if (subscriptions.length === 0) return { kind: "no_subscription" };
  const outcomes = await Promise.all(
    subscriptions.map(async (subscription) => ({
      subscription,
      result: await stores.sender.send(subscription, {
        title: "OneCart test notification",
        body: "Price-alert notifications work on this device.",
        url: "/alerts",
        tag: "onecart-test",
      }),
    })),
  );
  await stores.directory.recordDeliveries(outcomes, MAX_DELIVERY_FAILURES);
  const count = (r: string) => outcomes.filter((o) => o.result === r).length;
  return { kind: "sent", sent: count("sent"), expired: count("expired"), failed: count("failed") };
}

/** Runs the notifier for the cron; a failure is logged and reported, never thrown. */
export async function notifyTriggeredAlerts() {
  const notify = triggeredAlertNotifier();
  if (!notify) return "not_configured" as const;
  try {
    return await notify();
  } catch (error) {
    consoleLogger.warn("price-alerts: notifications failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "error" as const;
  }
}
