import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { redisHealthIssues } from "@/app/_composition";
import { BASE_METADATA, BASE_VIEWPORT, HtmlShell } from "@/app/_html";
import { RedisHealthBanner } from "@/components/features/internal/redis-health-banner";
import { AppHeader } from "@/components/layout/app-header";

export const metadata: Metadata = BASE_METADATA;
export const viewport: Viewport = BASE_VIEWPORT;

/** The admin pages' own root layout: English only, no shopper navigation. */
export default function InternalLayout({ children }: LayoutProps<"/internal">) {
  return (
    <HtmlShell lang="en" dir="ltr">
      <AppHeader />
      <Suspense fallback={null}>
        <RedisHealth />
      </Suspense>
      {children}
    </HtmlShell>
  );
}

/** Upstash failing or running out shows on every admin page (checked every 5 minutes). */
async function RedisHealth() {
  await connection();
  return <RedisHealthBanner issues={await redisHealthIssues()} />;
}
