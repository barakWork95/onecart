import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { adminAccess } from "@/app/_admin-auth";
import { clickReport } from "@/app/_composition";
import { ClickReportView, type ClickReportState } from "@/components/features/internal/click-report-view";
import { env } from "@/config/env";

export const metadata: Metadata = { title: "Clicks", robots: { index: false, follow: false } };

const DAYS = 30;

async function load(): Promise<ClickReportState> {
  const report = await clickReport(DAYS);
  return typeof report === "string" ? { kind: report } : { kind: "ready", report };
}

async function Report() {
  await connection();
  // The proxy already asked for the password; checked again so the page never relies on the matcher alone.
  const authorization = (await headers()).get("authorization");
  if (adminAccess(authorization, env().ADMIN_DASHBOARD_PASSWORD) !== "granted") notFound();
  return <ClickReportView state={await load()} days={DAYS} />;
}

export default function ClicksPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-8 pb-10">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading clicks…</p>}>
        <Report />
      </Suspense>
    </main>
  );
}
