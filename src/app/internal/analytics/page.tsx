import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { adminAccess } from "@/app/_admin-auth";
import { clickAnalyticsData } from "@/app/_composition";
import {
  ClickAnalyticsView,
  type ClickAnalyticsState,
} from "@/components/features/internal/click-analytics-view";
import { env } from "@/config/env";

export const metadata: Metadata = { title: "Click analytics", robots: { index: false, follow: false } };

async function load(): Promise<ClickAnalyticsState> {
  const data = await clickAnalyticsData();
  return typeof data === "string" ? { kind: data } : { kind: "ready", dashboard: data };
}

async function Dashboard() {
  await connection();
  // The proxy already asked for the password; checked again so the page never relies on the matcher alone.
  const authorization = (await headers()).get("authorization");
  if (adminAccess(authorization, env().ADMIN_DASHBOARD_PASSWORD) !== "granted") notFound();
  return <ClickAnalyticsView state={await load()} />;
}

export default function AnalyticsPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pt-8 pb-10">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading click analytics…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}
