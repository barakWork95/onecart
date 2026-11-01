import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { OpsIssue } from "@/domain/ops/issues";

/**
 * Shown on every /internal page while Upstash is failing, out of quota or past
 * its warning share: the failover keeps the site up, so nothing else would show it.
 */
export function RedisHealthBanner({ issues }: { issues: readonly OpsIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div
      role="alert"
      className="mx-auto mt-4 flex max-w-5xl gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground"
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="flex flex-col gap-1">
        <p className="font-semibold">Redis needs attention</p>
        <ul className="flex flex-col gap-0.5">
          {issues.map((issue) => (
            <li key={issue.key}>{issue.message}</li>
          ))}
        </ul>
        <p className="text-muted-foreground">
          The site keeps running on per-server memory meanwhile: rate limits and store budgets are weaker, and
          cached pages can&apos;t refresh.{" "}
          <Link href="/internal/status" className="font-medium text-foreground underline">
            Open the status page
          </Link>
        </p>
      </div>
    </div>
  );
}
