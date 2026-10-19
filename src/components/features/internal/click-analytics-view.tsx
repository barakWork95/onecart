import type { ReactNode } from "react";
import type { ClickDashboard } from "@/application/affiliate/click-analytics";
import { AutoRefresh } from "@/components/features/internal/auto-refresh";
import { STORE_META } from "@/components/features/store-meta";
import { money } from "@/domain/shared/money";
import { formatMoney, formatSnapshotTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ClickAnalyticsState =
  | { readonly kind: "ready"; readonly dashboard: ClickDashboard }
  /** No Supabase service key: clicks only go to the server logs. */
  | { readonly kind: "not_configured" }
  | { readonly kind: "error" };

/** How often the page re-reads the click log while open. */
const REFRESH_SECONDS = 30;

const count = new Intl.NumberFormat("en-IL");
const percent = new Intl.NumberFormat("en-IL", { style: "percent", maximumFractionDigits: 0 });

/** Internal: outbound clicks as KPIs, per store, top products and the latest clicks. */
export function ClickAnalyticsView({ state }: { state: ClickAnalyticsState }) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-brand-navy">Click analytics</h1>
        <p className="text-sm text-muted-foreground">
          Store clicks recorded by the /go redirect, by Israeli day. Refreshes every {REFRESH_SECONDS}{" "}
          seconds.
        </p>
      </header>
      {state.kind === "not_configured" && (
        <p className="rounded-2xl border border-border/60 bg-card p-4 text-sm">
          Click storage isn&apos;t configured (needs SUPABASE_SECRET_KEY). Clicks are only written to the
          server logs.
        </p>
      )}
      {state.kind === "error" && (
        <p role="alert" className="rounded-2xl border border-destructive/40 bg-card p-4 text-sm">
          Couldn&apos;t load the click analytics. Check that the click migrations are applied; details are in
          the server logs.
        </p>
      )}
      {state.kind === "ready" && (
        <>
          <AutoRefresh seconds={REFRESH_SECONDS} />
          <Dashboard dashboard={state.dashboard} />
        </>
      )}
    </div>
  );
}

function Dashboard({ dashboard }: { dashboard: ClickDashboard }) {
  const { kpis, byStore, topProducts, recent } = dashboard;
  const total = byStore.reduce((n, s) => n + s.clicks, 0);
  return (
    <>
      <ul aria-label="Clicks" className="grid grid-cols-3 gap-3">
        <Kpi label="Today" value={kpis.today} />
        <Kpi label="Last 7 days" value={kpis.last7Days} />
        <Kpi label="Last 30 days" value={kpis.last30Days} />
      </ul>
      {total === 0 && recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">No clicks recorded yet.</p>
      ) : (
        <>
          <Section title="Clicks by store, last 30 days">
            <Table caption="Clicks by store, last 30 days" head={["Store", "#Clicks", "#Share"]}>
              {byStore.map((s) => (
                <tr key={s.provider} className="border-t border-border/60">
                  <td className="py-1.5">
                    <StoreBadge provider={s.provider} />
                  </td>
                  <td className="py-1.5 text-end tabular-nums">{count.format(s.clicks)}</td>
                  <td className="py-1.5 text-end tabular-nums">{percent.format(s.clicks / total)}</td>
                </tr>
              ))}
            </Table>
          </Section>

          <Section title="Top products, last 30 days">
            <Table caption="Top products, last 30 days" head={["Product", "Store", "#Clicks"]}>
              {topProducts.map((p) => (
                <tr key={`${p.provider}:${p.productId}`} className="border-t border-border/60">
                  <td dir="auto" className="max-w-0 truncate py-1.5 pe-3" title={p.title ?? p.productId}>
                    {p.title ?? p.productId}
                  </td>
                  <td className="py-1.5">
                    <StoreBadge provider={p.provider} />
                  </td>
                  <td className="py-1.5 text-end tabular-nums">{count.format(p.clicks)}</td>
                </tr>
              ))}
            </Table>
          </Section>

          <Section title="Latest clicks">
            <Table
              caption="Latest clicks"
              head={["Time (Israel)", "Store", "Product", "#Price", "Deal", "Language"]}
            >
              {recent.map((c, i) => (
                <tr key={`${c.at}-${c.productId}-${i}`} className="border-t border-border/60">
                  <td className="py-1.5 pe-3 whitespace-nowrap tabular-nums">
                    <time dateTime={c.at}>{formatSnapshotTime(c.at)}</time>
                  </td>
                  <td className="py-1.5 pe-3">
                    <StoreBadge provider={c.provider} />
                  </td>
                  <td dir="auto" className="max-w-0 truncate py-1.5 pe-3" title={c.title ?? c.productId}>
                    {c.title ?? c.productId}
                  </td>
                  <td className="py-1.5 pe-3 text-end whitespace-nowrap tabular-nums">
                    {c.priceAgorot === null
                      ? "—"
                      : formatMoney(money(c.priceAgorot, "ILS"), { precise: true })}
                  </td>
                  <td className="py-1.5 pe-3">
                    {c.bestDeal && (
                      <span className="rounded bg-success px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-success-foreground uppercase">
                        Best deal
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-xs font-semibold">{c.locale.toUpperCase()}</td>
                </tr>
              ))}
            </Table>
          </Section>
        </>
      )}
    </>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex flex-col gap-1 rounded-2xl border border-border/60 bg-card p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold tabular-nums">{count.format(value)}</span>
    </li>
  );
}

function StoreBadge({ provider }: { provider: keyof typeof STORE_META }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STORE_META[provider].chip)}>
      {STORE_META[provider].name}
    </span>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

/** `head`: column labels; a leading "#" marks a right-aligned numeric column. */
function Table({ caption, head, children }: { caption: string; head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border/60 bg-card px-4 py-2">
      <table aria-label={caption} className="w-full table-fixed text-sm">
        <thead>
          <tr className="text-muted-foreground">
            {head.map((h) => (
              <th key={h} className={cn("py-1.5 font-medium", h.startsWith("#") ? "text-end" : "text-start")}>
                {h.replace(/^#/, "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
