import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { adminAccess } from "@/app/_admin-auth";
import { sendTestPushAction } from "@/app/internal/push-test/actions";
import { TestPushButton } from "@/app/internal/push-test/test-push-button";
import { env } from "@/config/env";

export const metadata: Metadata = { title: "Push test", robots: { index: false, follow: false } };

/** TEMPORARY: checks Web Push end to end on a real device. Remove once verified. */
async function PushTest() {
  await connection();
  // The proxy already asked for the password; checked again so the page never relies on the matcher alone.
  const authorization = (await headers()).get("authorization");
  if (adminAccess(authorization, env().ADMIN_DASHBOARD_PASSWORD) !== "granted") notFound();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold tracking-tight text-brand-navy">Push test</h1>
      <ol className="ms-5 list-decimal text-sm text-muted-foreground">
        <li>
          In this browser, open{" "}
          <Link href="/alerts" className="font-medium text-primary underline">
            Alerts
          </Link>{" "}
          and turn on notifications.
        </li>
        <li>Come back here and send a test. It goes only to this browser&apos;s own subscription.</li>
      </ol>
      <TestPushButton action={sendTestPushAction} />
    </div>
  );
}

export default function PushTestPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-8 pb-10">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <PushTest />
      </Suspense>
    </main>
  );
}
