"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { localeOf } from "@/app/_action-locale";
import { userListsService, writeUserLists } from "@/app/_user-lists";
import { MAX_QUERY_LENGTH } from "@/domain/search/search-query";
import { dict } from "@/i18n/dictionaries";
import { consoleLogger } from "@/infrastructure/logging/console-logger";

const productRef = z.object({
  productId: z.string().min(3).max(200),
  searchText: z.string().trim().min(1).max(MAX_QUERY_LENGTH),
});

export type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; message: string };

/** Save or unsave the product. The client sends only an id and its search — never product data. */
export async function setSavedAction(input: unknown): Promise<ActionResult<{ saved: boolean }>> {
  const t = dict(localeOf(input)).actions;
  const parsed = productRef.extend({ saved: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: t.invalidRequest };
  try {
    const repo = await writeUserLists();
    if (!repo) return { ok: false, message: t.savingUnavailable };
    if (!parsed.data.saved) {
      await userListsService.removeSaved(repo, parsed.data.productId);
    } else {
      const result = await userListsService.saveProduct(repo, parsed.data);
      if (!result.ok) {
        return {
          ok: false,
          message: result.error === "limit_reached" ? t.savedLimit : t.priceChanged,
        };
      }
    }
    revalidatePath("/saved");
    return { ok: true, value: { saved: parsed.data.saved } };
  } catch (error) {
    consoleLogger.warn("actions: setSaved failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: t.savingUnavailable };
  }
}

export async function removeSavedAction(input: unknown): Promise<ActionResult> {
  const t = dict(localeOf(input)).actions;
  const parsed = z.object({ productId: z.string().min(3).max(200) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: t.invalidRequest };
  try {
    const repo = await writeUserLists();
    if (!repo) return { ok: false, message: t.savingUnavailable };
    await userListsService.removeSaved(repo, parsed.data.productId);
    revalidatePath("/saved");
    return { ok: true, value: undefined };
  } catch (error) {
    consoleLogger.warn("actions: removeSaved failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, message: t.savingUnavailable };
  }
}
