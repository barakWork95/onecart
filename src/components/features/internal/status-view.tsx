import { CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Section, StatusReport } from "@/application/ops/status-report";
import { isExhausted } from "@/domain/ops/status";
import { formatSnapshotTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const number = new Intl.NumberFormat("en-IL");
const n = (value: number | null) => (value === null ? "—" : number.format(value));

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card p-4 sm:p-5"
    >
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function SectionBody<T>({ section, children }: { section: Section<T>; children: (value: T) => ReactNode }) {
  if (section.kind === "not_configured")
    return <p className="text-sm text-muted-foreground">Not configured here.</p>;
  if (section.kind === "error")
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn&apos;t load: {section.message}
      </p>
    );
  return <>{children(section.value)}</>;
}

const when = (iso: string) => <time dateTime={iso}>{formatSnapshotTime(iso)}</time>;

/** Internal: cron runs, quotas, price recording, push and clicks at a glance. */
export function StatusView({ report, alertsPanel }: { report: StatusReport; alertsPanel?: ReactNode }) {
  const healthy = report.issues.length === 0;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-brand-navy">Status</h1>
        <p className="text-sm text-muted-foreground">As of {when(report.generatedAt)} (Israel time).</p>
      </header>

      <p
        role="status"
        className={cn(
          "flex items-start gap-2 rounded-2xl px-4 py-3 text-sm font-medium",
          healthy ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
        )}
      >
        {healthy ? (
          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        ) : (
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        )}
        <span>
          {healthy ? "All good." : `${report.issues.length} problem${report.issues.length === 1 ? "" : "s"}:`}
          {!healthy && (
            <ul className="ms-4 mt-1 list-disc font-normal">
              {report.issues.map((i) => (
                <li key={i.key}>{i.message}</li>
              ))}
            </ul>
          )}
        </span>
      </p>

      {alertsPanel}

      <Card title="Cron runs">
        <ul className="flex flex-col gap-2 text-sm">
          {report.jobs.map(({ job, last, lastOk, stale }) => (
            <li
              key={job}
              className="flex flex-col gap-0.5 border-t border-border/60 pt-2 first:border-0 first:pt-0"
            >
              <span className="font-semibold">
                {job}{" "}
                <span className={cn("font-medium", last?.ok && !stale ? "text-success" : "text-destructive")}>
                  {!last ? "never ran" : stale ? "missed its daily run" : last.ok ? "ok" : "problems"}
                </span>
              </span>
              {last && (
                <span className="text-muted-foreground">
                  Last run {when(last.finishedAt)}
                  {last.problems.length > 0 && `: ${last.problems.join("; ")}`}
                </span>
              )}
              {last && !last.ok && lastOk && (
                <span className="text-muted-foreground">Last ok {when(lastOk.finishedAt)}</span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Quotas">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground">
              <th scope="col" className="py-1 text-start font-medium">
                Quota
              </th>
              <th scope="col" className="py-1 text-end font-medium">
                Used
              </th>
              <th scope="col" className="py-1 text-end font-medium">
                Left
              </th>
            </tr>
          </thead>
          <tbody>
            {report.quotas.map((q) => (
              <tr key={q.name} className="border-t border-border/40">
                <th scope="row" className="py-1.5 pe-2 text-start font-normal">
                  {q.name}
                  {q.error && (
                    <span className="block text-xs text-destructive">Couldn&apos;t read: {q.error}</span>
                  )}
                </th>
                <td className="py-1.5 text-end tabular-nums">
                  {n(q.used)}
                  {q.limit !== null && <span className="text-muted-foreground"> / {n(q.limit)}</span>}
                </td>
                <td
                  className={cn(
                    "py-1.5 text-end font-semibold tabular-nums",
                    isExhausted(q) && "text-destructive",
                  )}
                >
                  {n(q.remaining)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {report.quotas.length === 0 && (
          <p className="text-sm text-muted-foreground">No live stores configured here.</p>
        )}
      </Card>

      <Card title="Price history (rows per day)">
        <SectionBody section={report.prices}>
          {(days) => (
            <ol
              className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3"
              aria-label="Rows recorded per day"
            >
              {days.map(({ day, count }) => (
                <li key={day} className="flex justify-between tabular-nums">
                  <span className="text-muted-foreground">{day}</span>
                  <span className={cn(count === 0 && "text-muted-foreground")}>{n(count)}</span>
                </li>
              ))}
            </ol>
          )}
        </SectionBody>
      </Card>

      <Card title="Price-alert notifications">
        <SectionBody section={report.push}>
          {(p) => (
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Subscribed browsers</dt>
              <dd className="text-end tabular-nums">{n(p.subscriptions)}</dd>
              <dt className="text-muted-foreground">Failing deliveries</dt>
              <dd className={cn("text-end tabular-nums", p.failingSubscriptions > 0 && "text-destructive")}>
                {n(p.failingSubscriptions)}
              </dd>
              <dt className="text-muted-foreground">Alerts watching</dt>
              <dd className="text-end tabular-nums">{n(p.alertsActive)}</dd>
              <dt className="text-muted-foreground">Alerts triggered</dt>
              <dd className="text-end tabular-nums">{n(p.alertsTriggered)}</dd>
              <dt className="text-muted-foreground">Waiting to be notified</dt>
              <dd className={cn("text-end tabular-nums", p.alertsWaiting > 0 && "text-destructive")}>
                {n(p.alertsWaiting)}
              </dd>
            </dl>
          )}
        </SectionBody>
      </Card>

      <Card title="Clicks today">
        <SectionBody section={report.clicksToday}>
          {(c) => (
            <p className="text-sm">
              <span className="text-2xl font-bold tabular-nums">{n(c.clicks)}</span>{" "}
              <span className="text-muted-foreground">
                clicks, {n(c.affiliated)} affiliate-tagged.{" "}
                <Link href="/internal/clicks" className="font-medium text-primary underline">
                  Click report
                </Link>{" "}
                ·{" "}
                <Link href="/internal/analytics" className="font-medium text-primary underline">
                  Click analytics
                </Link>
              </span>
            </p>
          )}
        </SectionBody>
      </Card>
    </div>
  );
}
