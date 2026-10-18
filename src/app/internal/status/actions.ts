"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { adminAccess } from "@/app/_admin-auth";
import { opsAlertTargets, sendTestOpsAlert } from "@/app/_composition";
import type { ActionResult } from "@/app/[lang]/saved/actions";
import { env } from "@/config/env";
import { isAllowedPushEndpoint } from "@/domain/notifications/push";

/** Server Actions are reachable without the page: each checks the admin password itself. */
async function isAdmin(): Promise<boolean> {
  return adminAccess((await headers()).get("authorization"), env().ADMIN_DASHBOARD_PASSWORD) === "granted";
}

const FORBIDDEN = { ok: false, message: "Not allowed." } as const;
const base64url = (min: number, max: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]+=*$/)
    .min(min)
    .max(max);
const subscriptionInput = z.object({
  endpoint: z.string().max(1000).refine(isAllowedPushEndpoint),
  keys: z.object({ p256dh: base64url(20, 200), auth: base64url(8, 100) }),
});

/** Adds this browser to the ops alert list. */
export async function saveOpsTargetAction(input: unknown): Promise<ActionResult> {
  if (!(await isAdmin())) return FORBIDDEN;
  const parsed = subscriptionInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "This browser's notification setup isn't supported." };
  await opsAlertTargets().addTarget({ endpoint: parsed.data.endpoint, ...parsed.data.keys });
  return { ok: true, value: undefined };
}

/** Removes this browser from the ops alert list (its own subscription stays). */
export async function removeOpsTargetAction(input: unknown): Promise<ActionResult> {
  if (!(await isAdmin())) return FORBIDDEN;
  const parsed = z.object({ endpoint: z.string().max(1000) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  await opsAlertTargets().removeTarget(parsed.data.endpoint);
  return { ok: true, value: undefined };
}

/** Whether this browser is on the ops alert list. */
export async function isOpsTargetAction(input: { endpoint: string }): Promise<boolean> {
  if (!(await isAdmin())) return false;
  return (await opsAlertTargets().targets()).some((t) => t.endpoint === input.endpoint);
}

/** Sends a test alert to every listed browser. */
export async function sendTestOpsAlertAction(): Promise<
  ActionResult<{ targets: number; delivered: number }>
> {
  if (!(await isAdmin())) return FORBIDDEN;
  return { ok: true, value: await sendTestOpsAlert() };
}
