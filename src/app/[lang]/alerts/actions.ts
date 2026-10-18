"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/app/[lang]/saved/actions";
import { localeOf } from "@/app/_action-locale";
import { userListsService, writePushSubscriptions, writeUserLists } from "@/app/_user-lists";
import { isAllowedPushEndpoint } from "@/domain/notifications/push";
import type { AlertError } from "@/application/user-lists/user-lists";
import { MAX_QUERY_LENGTH } from "@/domain/search/search-query";
import { dict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";
import { formatMoney } from "@/lib/format";
import { consoleLogger } from "@/infrastructure/logging/console-logger";

/** Each way creating an alert can fail, as the shopper reads it. */
function alertError(error: AlertError, locale: Locale): string {
  const t = dict(locale).actions;
  const messages: Record<AlertError, string> = {
    not_found: t.priceChanged,
    limit_reached: t.alertLimit,
    target_not_positive: t.targetPositive,
    target_not_below_current: t.targetBelowCurrent,
  };
  return messages[error];
}

const createInput = z.object({
  productId: z.string().min(3).max(200),
  searchText: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
  /** Whole or decimal shekels as typed by the user. */
  targetShekels: z.coerce.number().finite().positive().max(1_000_000),
});

export async function createAlertAction(input: unknown): Promise<ActionResult<{ target: string }>> {
  const locale = localeOf(input);
  const t = dict(locale).actions;
  const parsed = createInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: t.targetPositive };
  try {
    const repo = await writeUserLists();
    if (!repo) return { ok: false, message: t.alertsUnavailable };
    const result = await userListsService.createAlert(repo, {
      productId: parsed.data.productId,
      searchText: parsed.data.searchText,
      targetAgorot: Math.round(parsed.data.targetShekels * 100),
    });
    if (!result.ok) return { ok: false, message: alertError(result.error, locale) };
    revalidatePath("/alerts");
    return { ok: true, value: { target: formatMoney(result.value.target, { precise: true, locale }) } };
  } catch (error) {
    consoleLogger.warn("actions: createAlert failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: t.alertsUnavailable };
  }
}

export async function deleteAlertAction(input: unknown): Promise<ActionResult> {
  const t = dict(localeOf(input)).actions;
  const parsed = z.object({ productId: z.string().min(3).max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: t.invalidRequest };
  try {
    const repo = await writeUserLists();
    if (!repo) return { ok: false, message: t.alertsUnavailable };
    await userListsService.deleteAlert(repo, parsed.data.productId);
    revalidatePath("/alerts");
    return { ok: true, value: undefined };
  } catch (error) {
    consoleLogger.warn("actions: deleteAlert failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: t.alertsUnavailable };
  }
}

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
  const locale = localeOf(input);
  const t = dict(locale).actions;
  const parsed = subscriptionInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: t.notifyUnsupported };
  try {
    const repo = await writePushSubscriptions();
    if (!repo) return { ok: false, message: t.notifyUnavailable };
    // Its notifications are written in the language the browser subscribed in.
    await repo.save({ endpoint: parsed.data.endpoint, ...parsed.data.keys, locale });
    return { ok: true, value: undefined };
  } catch (error) {
    consoleLogger.warn("actions: savePushSubscription failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: t.notifyUnavailable };
  }
}

/** Turns them off for this browser. */
export async function removePushSubscriptionAction(input: unknown): Promise<ActionResult> {
  const t = dict(localeOf(input)).actions;
  const parsed = z.object({ endpoint: z.string().max(1000) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: t.invalidRequest };
  try {
    const repo = await writePushSubscriptions();
    if (!repo) return { ok: false, message: t.notifyUnavailable };
    await repo.remove(parsed.data.endpoint);
    return { ok: true, value: undefined };
  } catch (error) {
    consoleLogger.warn("actions: removePushSubscription failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: t.notifyUnavailable };
  }
}
