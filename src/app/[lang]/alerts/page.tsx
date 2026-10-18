import { BellRing, TrendingDown } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getServices } from "@/app/_composition";
import { pushPublicKey, readUserLists } from "@/app/_user-lists";
import {
  deleteAlertAction,
  removePushSubscriptionAction,
  savePushSubscriptionAction,
} from "@/app/[lang]/alerts/actions";
import { NotifyMe } from "@/components/features/user-lists/notify-me";
import { STORE_META } from "@/components/features/store-meta";
import { EmptyList, ListPage, ProductThumb } from "@/components/features/user-lists/list-page";
import { RemoveButton } from "@/components/features/user-lists/remove-button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PriceAlert } from "@/domain/user-lists/price-alert";
import { dict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";
import { currentLocale, getDictionary } from "@/i18n/server";
import { formatMoney } from "@/lib/format";
import { OUTBOUND_LINK } from "@/components/features/outbound-link";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).meta.alertsTitle };
}

function StatusChip({ alert, locale }: { alert: PriceAlert; locale: Locale }) {
  const t = dict(locale).alerts;
  return alert.status === "triggered" ? (
    <span className="rounded-full bg-success px-2 py-0.5 text-[11px] font-bold text-success-foreground">
      {t.dropped}
    </span>
  ) : (
    <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
      {t.watching}
    </span>
  );
}

async function AlertList({ locale }: { locale: Locale }) {
  await connection();
  const t = dict(locale).alerts;
  const money = (m: PriceAlert["target"]) => formatMoney(m, { precise: true, locale });
  const access = await readUserLists();
  if (access.kind === "unavailable") {
    return <EmptyList icon={BellRing} title={t.unavailableTitle} body={t.unavailableBody} locale={locale} />;
  }
  const alerts = access.kind === "user" ? await access.repo.listAlerts() : [];
  if (alerts.length === 0) {
    return <EmptyList icon={TrendingDown} title={t.emptyTitle} body={t.emptyBody} locale={locale} />;
  }

  const { linkCodec } = getServices();
  return (
    <ul className="flex flex-col gap-3" aria-label={t.list}>
      {alerts.map((alert) => (
        <li
          key={alert.id}
          className="flex items-center gap-3 rounded-3xl border border-border/60 bg-card p-3"
        >
          <ProductThumb imageUrl={alert.imageUrl} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2">
              <StatusChip alert={alert} locale={locale} />
              <span className="text-xs text-muted-foreground">{STORE_META[alert.provider].name}</span>
            </p>
            <h2 dir="auto" className="truncate font-semibold text-foreground rtl:text-right">
              {alert.title}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t.target} <strong className="text-foreground">{money(alert.target)}</strong>
              {" · "}
              {t.now} {alert.lastSeen ? money(alert.lastSeen) : t.nowUnavailable}
              {" · "}
              {t.was} {money(alert.baseline)}
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
                {t.buyNow}
              </a>
            )}
          </div>
          <RemoveButton
            label={t.remove(alert.title)}
            action={deleteAlertAction}
            productId={alert.productId}
            locale={locale}
          />
        </li>
      ))}
    </ul>
  );
}

/** The notifications switch, when push is configured; read per request like the list. */
async function Notifications({ locale }: { locale: Locale }) {
  await connection();
  const publicKey = pushPublicKey();
  return publicKey ? (
    <NotifyMe
      publicKey={publicKey}
      save={savePushSubscriptionAction}
      remove={removePushSubscriptionAction}
      locale={locale}
    />
  ) : null;
}

export default async function AlertsPage() {
  const locale = await currentLocale();
  const t = dict(locale).alerts;
  return (
    <ListPage title={t.title} intro={t.intro}>
      <Suspense fallback={null}>
        <Notifications locale={locale} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-24 w-full rounded-3xl" />}>
        <AlertList locale={locale} />
      </Suspense>
    </ListPage>
  );
}
