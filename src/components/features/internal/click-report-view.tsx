import type { ReactNode } from "react";
import type { ClickReport } from "@/application/affiliate/click-report";
import type { ClickTotals } from "@/domain/affiliate/click-stats";
import { STORE_META } from "@/components/features/store-meta";

export type ClickReportState =
  | { readonly kind: "ready"; readonly report: ClickReport }
  /** No Supabase service key: clicks only go to the server logs. */
  | { readonly kind: "not_configured" }
  | { readonly kind: "error" };

const percent = new Intl.NumberFormat("en-IL", { style: "percent", maximumFractionDigits: 0 });
const count = new Intl.NumberFormat("en-IL");

const share = (t: ClickTotals) => (t.affiliateShare === null ? "—" : percent.format(t.affiliateShare));

/** Internal: outbound clicks per store and per day, with the share that carried an affiliate tag. */
export function ClickReportView({ state, days }: { state: ClickReportState; days: number }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-brand-navy">Outbound clicks</h1>
        <p className="text-sm text-muted-foreground">
          {state.kind === "ready"
            ? `Last ${days} days (Israel time), since ${state.report.sinceDay}.`
            : `Last ${days} days (Israel time).`}
        </p>
      </header>
      {state.kind === "not_configured" && (
        <p className="rounded-2xl border border-border/60 bg-card p-4 text-sm">
          Click storage isn&apos;t configured (needs <code>SUPABASE_SECRET_KEY</code>). Clicks are only
          written to the server logs.
        </p>
      )}
      {state.kind === "error" && (
        <p role="alert" className="rounded-2xl border border-destructive/40 bg-card p-4 text-sm">
          Couldn&apos;t load clicks. Check that the <code>outbound_clicks</code> migration is applied; details
          are in the server logs.
        </p>
      )}
      {state.kind === "ready" && <Report report={state.report} />}
    </div>
  );
}

function Report({ report }: { report: ClickReport }) {
  if (report.overall.clicks === 0) {
    return <p className="text-sm text-muted-foreground">No clicks in this period yet.</p>;
  }
  return (
    <>
      <dl className="grid grid-cols-2 gap-3">
        <Tile label="Clicks" value={count.format(report.overall.clicks)} />
        <Tile label="Affiliate-tagged" value={share(report.overall)} />
      </dl>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">By store</h2>
        <Table head={["Store", "#Clicks", "#Tagged", "#Share"]}>
          {report.stores.map((s) => (
            <tr key={s.provider}>
              <th scope="row" className="py-2 pe-3 text-start font-medium">
                {STORE_META[s.provider].name}
              </th>
              <Num>{count.format(s.clicks)}</Num>
              <Num>{count.format(s.affiliated)}</Num>
              <Num>{share(s)}</Num>
            </tr>
          ))}
        </Table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">By day</h2>
        <Table head={["Day", "#Clicks", "Stores", "#Share"]}>
          {report.days.map((d) => (
            <tr key={d.day}>
              <th scope="row" className="py-2 pe-3 text-start font-medium whitespace-nowrap tabular-nums">
                {d.day}
              </th>
              <Num>{count.format(d.clicks)}</Num>
              <td className="py-2 pe-3 text-muted-foreground">
                {d.stores.map((s) => `${STORE_META[s.provider].name} ${count.format(s.clicks)}`).join(" · ")}
              </td>
              <Num>{share(d)}</Num>
            </tr>
          ))}
        </Table>
      </section>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}

/** `head`: column labels; a leading "#" marks a right-aligned numeric column. */
function Table({ head, children }: { head: readonly string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card px-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-muted-foreground">
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className={`py-2 pe-3 font-medium ${h.startsWith("#") ? "text-end" : "text-start"}`}
              >
                {h.replace(/^#/, "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr+tr]:border-t [&_tr+tr]:border-border/40">{children}</tbody>
      </table>
    </div>
  );
}

function Num({ children }: { children: ReactNode }) {
  return <td className="py-2 pe-3 text-end tabular-nums">{children}</td>;
}
