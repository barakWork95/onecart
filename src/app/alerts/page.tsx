import { BellRing, TrendingDown } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getServices } from "@/app/_composition";
import { readUserLists } from "@/app/_user-lists";
import { deleteAlertAction } from "@/app/alerts/actions";
import { STORE_META } from "@/components/features/store-meta";
import { EmptyList, ListPage, ProductThumb } from "@/components/features/user-lists/list-page";
import { RemoveButton } from "@/components/features/user-lists/remove-button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PriceAlert } from "@/domain/user-lists/price-alert";
import { formatMoney } from "@/lib/format";
import { OUTBOUND_LINK } from "@/components/features/outbound-link";

export const metadata: Metadata = { title: "Price alerts" };

function StatusChip({ alert }: { alert: PriceAlert }) {
  return alert.status === "triggered" ? (
    <span className="rounded-full bg-success px-2 py-0.5 text-[11px] font-bold text-success-foreground">
      Price dropped!
    </span>
  ) : (
    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
      Watching
    </span>
  );
}

async function AlertList() {
  await connection();
  const access = await readUserLists();
  if (access.kind === "unavailable") {
    return (
      <EmptyList
        icon={BellRing}
        title="Alerts aren't available"
        body="Price alerts aren't configured on this server."
      />
    );
  }
  const alerts = access.kind === "user" ? await access.repo.listAlerts() : [];
  if (alerts.length === 0) {
    return (
      <EmptyList
        icon={TrendingDown}
        title="No price alerts yet"
        body="Tap the bell on any product and pick a target price — we'll watch it daily."
      />
    );
  }

  const { linkCodec } = getServices();
  return (
    <ul className="flex flex-col gap-3" aria-label="Price alerts">
      {alerts.map((alert) => (
        <li
          key={alert.id}
          className="flex items-center gap-3 rounded-3xl border border-border/60 bg-card p-3"
        >
          <ProductThumb imageUrl={alert.imageUrl} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2">
              <StatusChip alert={alert} />
              <span className="text-xs text-muted-foreground">{STORE_META[alert.provider].name}</span>
            </p>
            <h2 className="truncate font-semibold text-foreground">{alert.title}</h2>
            <p className="text-xs text-muted-foreground">
              Target{" "}
              <strong className="text-foreground">{formatMoney(alert.target, { precise: true })}</strong>
              {" · "}Now {alert.lastSeen ? formatMoney(alert.lastSeen, { precise: true }) : "unavailable"}
              {" · "}Was {formatMoney(alert.baseline, { precise: true })}
            </p>
            {alert.status === "triggered" && (
              <a
                href={linkCodec.encode({
                  id: alert.productId,
                  provider: alert.provider,
                  url: alert.productUrl,
                })}
                {...OUTBOUND_LINK}
                className="text-sm font-semibold text-primary"
              >
                Buy now
              </a>
            )}
          </div>
          <RemoveButton
            label={`Delete price alert for ${alert.title}`}
            action={deleteAlertAction}
            productId={alert.productId}
          />
        </li>
      ))}
    </ul>
  );
}

export default function AlertsPage() {
  return (
    <ListPage title="Price alerts" intro="We re-check landed prices daily and flag any that hit your target.">
      <Suspense fallback={<Skeleton className="h-24 w-full rounded-3xl" />}>
        <AlertList />
      </Suspense>
    </ListPage>
  );
}
