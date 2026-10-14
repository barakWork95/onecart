"use server";

import { headers } from "next/headers";
import { adminAccess } from "@/app/_admin-auth";
import { sendTestNotification, type TestPushResult } from "@/app/_user-lists";
import { env } from "@/config/env";

/**
 * TEMPORARY: sends a test push to this browser's own subscriptions. Checks the
 * admin password itself: a Server Action is reachable without the page.
 */
export async function sendTestPushAction(): Promise<TestPushResult | { readonly kind: "forbidden" }> {
  const authorization = (await headers()).get("authorization");
  if (adminAccess(authorization, env().ADMIN_DASHBOARD_PASSWORD) !== "granted") return { kind: "forbidden" };
  return sendTestNotification();
}
