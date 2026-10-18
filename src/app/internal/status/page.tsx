import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { adminAccess } from "@/app/_admin-auth";
import { statusReport } from "@/app/_composition";
import {
  isOpsTargetAction,
  removeOpsTargetAction,
  saveOpsTargetAction,
  sendTestOpsAlertAction,
} from "@/app/internal/status/actions";
import { TestAlertButton } from "@/app/internal/status/test-alert-button";
import { StatusView } from "@/components/features/internal/status-view";
import { NotifyMe } from "@/components/features/user-lists/notify-me";
import { env, webPushConfig } from "@/config/env";

export const metadata: Metadata = { title: "Status", robots: { index: false, follow: false } };

const OPS_COPY = {
  label: "Ops alerts",
  off: "Get a push on this browser when a cron fails, a run is missed, or a quota hits zero.",
  on: "Ops alerts come to this browser.",
} as const;

async function Status() {
  await connection();
  // The proxy already asked for the password; checked again so the page never relies on the matcher alone.
  const authorization = (await headers()).get("authorization");
  if (adminAccess(authorization, env().ADMIN_DASHBOARD_PASSWORD) !== "granted") notFound();
  // Ops alerts need only the VAPID keys, not the shoppers' wishlist backend.
  const publicKey = webPushConfig(env())?.publicKey ?? null;
  return (
    <StatusView
      report={await statusReport()}
      alertsPanel={
        publicKey ? (
          <div className="flex flex-col gap-2">
            <NotifyMe
              publicKey={publicKey}
              save={saveOpsTargetAction}
              remove={removeOpsTargetAction}
              isSaved={isOpsTargetAction}
              keepBrowserSubscription
              copy={OPS_COPY}
            />
            <TestAlertButton action={sendTestOpsAlertAction} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Ops alerts need Web Push (VAPID keys) configured.</p>
        )
      }
    />
  );
}

export default function StatusPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-8 pb-10">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading status…</p>}>
        <Status />
      </Suspense>
    </main>
  );
}
