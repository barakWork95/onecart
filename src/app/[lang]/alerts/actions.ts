"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/app/[lang]/saved/actions";
import { userListsService, writePushSubscriptions, writeUserLists } from "@/app/_user-lists";
import { isAllowedPushEndpoint } from "@/domain/notifications/push";
import type { AlertError } from "@/application/user-lists/user-lists";
import { MAX_QUERY_LENGTH } from "@/domain/search/search-query";
import { formatMoney } from "@/lib/format";
import { consoleLogger } from "@/infrastructure/logging/console-logger";

const UNAVAILABLE = "Price alerts aren't available right now.";

const MESSAGES: Record<AlertError, string> = {
  not_found: "This price changed — refresh the search and try again.",
  limit_reached: "You've reached the price-alert limit. Delete one to add another.",
  target_not_positive: "Enter a target price above ₪0.",
  target_not_below_current: "Pick a target below today's price.",
};

const createInput = z.object({
  productId: z.string().min(3).max(200),
  searchText: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
  /** Whole or decimal shekels as typed by the user. */
  targetShekels: z.coerce.number().finite().positive().max(1_000_000),
});

export async function createAlertAction(input: unknown): Promise<ActionResult<{ target: string }>> {
  const parsed = createInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: MESSAGES.target_not_positive };
  try {
    const repo = await writeUserLists();
    if (!repo) return { ok: false, message: UNAVAILABLE };
    const result = await userListsService.createAlert(repo, {
      productId: parsed.data.productId,
      searchText: parsed.data.searchText,
      targetAgorot: Math.round(parsed.data.targetShekels * 100),
    });
    if (!result.ok) return { ok: false, message: MESSAGES[result.error] };
    revalidatePath("/alerts");
    return { ok: true, value: { target: formatMoney(result.value.target, { precise: true }) } };
  } catch (error) {
    consoleLogger.warn("actions: createAlert failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: UNAVAILABLE };
  }
}

export async function deleteAlertAction(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ productId: z.string().min(3).max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  try {
    const repo = await writeUserLists();
    if (!repo) return { ok: false, message: UNAVAILABLE };
    await userListsService.deleteAlert(repo, parsed.data.productId);
    revalidatePath("/alerts");
    return { ok: true, value: undefined };
  } catch (error) {
    consoleLogger.warn("actions: deleteAlert failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: UNAVAILABLE };
  }
}

const NOTIFY_UNAVAILABLE = "Notifications aren't available right now.";
const base64url = (min: number, max: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]+=*$/)
    .min(min)
    .max(max);

/** `PushSubscription.toJSON()` from the browser; only the major push services are accepted. */
const subscriptionInput = z.object({
  endpoint: z.string().max(1000).refine(isAllowedPushEndpoint),
  keys: z.object({ p256dh: base64url(20, 200), auth: base64url(8, 100) }),
});

/** Turns price-alert notifications on for this browser. */
export async function savePushSubscriptionAction(input: unknown): Promise<ActionResult> {
  const parsed = subscriptionInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "This browser's notification setup isn't supported." };
  try {
    const repo = await writePushSubscriptions();
    if (!repo) return { ok: false, message: NOTIFY_UNAVAILABLE };
    await repo.save({ endpoint: parsed.data.endpoint, ...parsed.data.keys });
    return { ok: true, value: undefined };
  } catch (error) {
    consoleLogger.warn("actions: savePushSubscription failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: NOTIFY_UNAVAILABLE };
  }
}

/** Turns them off for this browser. */
export async function removePushSubscriptionAction(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ endpoint: z.string().max(1000) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  try {
    const repo = await writePushSubscriptions();
    if (!repo) return { ok: false, message: NOTIFY_UNAVAILABLE };
    await repo.remove(parsed.data.endpoint);
    return { ok: true, value: undefined };
  } catch (error) {
    consoleLogger.warn("actions: removePushSubscription failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: NOTIFY_UNAVAILABLE };
  }
}
