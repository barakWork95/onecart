import {
  AlertTriangle,
  BadgeCheck,
  Clock,
  ExternalLink,
  FlaskConical,
  Languages,
  SearchX,
} from "lucide-react";
import type { ReactNode } from "react";
import type { QueryTranslationInfo } from "@/application/search/build-search-query";
import { findMatchesLink } from "@/components/features/search/group-view";
import { LoadMore } from "@/components/features/search/load-more";
import { ProductGroupCard } from "@/components/features/search/product-group-card";
import { SortChips } from "@/components/features/search/sort-chips";
import { STORE_META } from "@/components/features/store-meta";
import { buttonVariants } from "@/components/ui/button";
import { formatSnapshotTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProviderId } from "@/domain/shared/provider";
import {
  FAILED_PROVIDER_STATUSES,
  type ProviderOutcome,
  type SearchResponse,
} from "@/domain/search/search-response";
import { OUTBOUND_LINK } from "@/components/features/outbound-link";

const STATUS_TEXT: Partial<Record<ProviderOutcome["status"], string>> = {
  timeout: "timed out",
  error: "unavailable",
  circuit_open: "temporarily paused",
};

function TranslationNotice({
  query,
  translation,
}: {
  query: SearchResponse["query"];
  translation: QueryTranslationInfo;
}) {
  if (translation.source === null) {
    return (
      <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
        <Languages className="mt-0.5 size-4 shrink-0" aria-hidden />
        We couldn&apos;t translate your Hebrew search, so stores were searched with the original text. Try
        English for better results.
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Languages className="size-4 shrink-0 text-primary" aria-hidden />
      <span>
        Showing results for{" "}
        <strong className="font-semibold text-foreground">“{query.normalizedText}”</strong>
        <span className="sr-only">, translated from Hebrew</span>
        {translation.partial && <span> (some words couldn&apos;t be translated)</span>}
      </span>
    </p>
  );
}

function PartialNotice({
  failed,
  checkStores,
}: {
  failed: readonly ProviderOutcome[];
  /** Stores the cards offer "Check <store>" links for. */
  checkStores: readonly ProviderId[];
}) {
  const list = failed
    .map((o) => `${STORE_META[o.provider].name} (${STATUS_TEXT[o.status] ?? "unavailable"})`)
    .join(", ");
  const checks = checkStores.map((p) => `“Check ${STORE_META[p].name}”`).join(" or ");
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        Some stores are unavailable right now: {list}. Showing results from the rest
        {checks ? `; ${checks} on a card searches that store for the item.` : "."}
      </span>
    </p>
  );
}

/** Cached results younger than this read as current; older ones are dated. */
const SNAPSHOT_NOTICE_AFTER_MS = 60 * 60 * 1000;

/**
 * Stores whose prices come from an older snapshot (cache warming keeps
 * Amazon's for days), each with when it was fetched, oldest first.
 */
export function datedStores(
  providers: readonly ProviderOutcome[],
  generatedAt: string,
): { readonly provider: ProviderId; readonly cachedAt: string }[] {
  const now = Date.parse(generatedAt);
  return providers
    .flatMap((o) =>
      o.cachedAt && o.resultCount > 0 && now - Date.parse(o.cachedAt) > SNAPSHOT_NOTICE_AFTER_MS
        ? [{ provider: o.provider, cachedAt: o.cachedAt }]
        : [],
    )
    .sort((a, b) => a.cachedAt.localeCompare(b.cachedAt));
}

function SnapshotNotice({ stores }: { stores: ReturnType<typeof datedStores> }) {
  return (
    <p className="flex items-start gap-2 text-sm text-muted-foreground">
      <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        {stores.map(({ provider, cachedAt }, i) => (
          <span key={provider}>
            {i > 0 && " · "}
            {STORE_META[provider].name} prices as of{" "}
            <time dateTime={cachedAt}>{formatSnapshotTime(cachedAt)}</time>
          </span>
        ))}
        . Prices may have changed since; the store shows the current one.
      </span>
    </p>
  );
}

/** The current URL's search, one results page further; filters and sort are kept. */
export function nextPageHref(query: SearchResponse["query"], nextPage: number): string {
  const params = new URLSearchParams({ q: query.rawText });
  if (query.sort !== "relevance") params.set("sort", query.sort);
  if (query.filters.maxTotal) params.set("max", String(Math.round(query.filters.maxTotal.amountMinor / 100)));
  if (query.filters.freeShippingOnly) params.set("free", "1");
  params.set("page", String(nextPage));
  return `/search?${params.toString()}`;
}

function EmptyState({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border px-6 py-12 text-center">
      <SearchX className="size-10 text-muted-foreground" aria-hidden />
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}

export interface ResultsViewProps {
  readonly response: SearchResponse;
  readonly translation: QueryTranslationInfo | null;
  readonly demoMode: boolean;
  /** Offer id → signed `/go/...` href. */
  readonly outboundLinks: Readonly<Record<string, string>>;
  /** Group id → a store that's down and a signed link to search it there. */
  readonly storeChecks?: Readonly<Record<string, { readonly provider: ProviderId; readonly href: string }>>;
  /** Stores answering from recorded samples rather than live (development). */
  readonly sampleStores?: readonly ProviderId[];
  /** Unavailable stores, with a signed link to search each one's own site for the query. */
  readonly storeSearches?: readonly { readonly provider: ProviderId; readonly href: string }[];
  /** Products this visitor saved / tracks; null when wishlists aren't available. */
  readonly userLists?: { readonly savedIds: readonly string[]; readonly alertIds: readonly string[] } | null;
}

export function ResultsView({
  response,
  translation,
  demoMode,
  outboundLinks,
  storeChecks = {},
  sampleStores = [],
  storeSearches = [],
  userLists = null,
}: ResultsViewProps) {
  const { query, groups, providers, totalOffers, isPartial, pagination } = response;
  const searched = providers.filter((p) => p.status !== "skipped");
  // A store that's down can't be searched again; its cards get "Check <store>" instead.
  const connectedStores = searched
    .filter((p) => !FAILED_PROVIDER_STATUSES.includes(p.status))
    .map((p) => p.provider);
  const failed = searched.filter((p) => FAILED_PROVIDER_STATUSES.includes(p.status));
  const allFailed = searched.length > 0 && failed.length === searched.length;
  const anyTaxEstimated = groups.some((g) => g.offers.some((o) => !o.price.taxesCollectedAtCheckout));
  const dated = datedStores(searched, response.generatedAt);

  return (
    <section aria-label="Search results" className="flex flex-col gap-4">
      {translation && <TranslationNotice query={query} translation={translation} />}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">{totalOffers}</span>{" "}
          {totalOffers === 1 ? "offer" : "offers"} •{" "}
          <span className="font-semibold text-primary">
            {searched.length} {searched.length === 1 ? "store" : "stores"}
          </span>
          {query.sort === "relevance" && <span> • Best match</span>}
        </p>
        <div className="flex gap-2">
          {demoMode && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-200">
              <FlaskConical className="size-3.5" aria-hidden />
              Demo data
            </span>
          )}
          {anyTaxEstimated && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
              <BadgeCheck className="size-3.5" aria-hidden />
              Import VAT included
            </span>
          )}
        </div>
      </div>

      <SortChips text={query.rawText} active={query.sort} />

      {dated.length > 0 && groups.length > 0 && <SnapshotNotice stores={dated} />}

      {isPartial && !allFailed && (
        <PartialNotice
          failed={failed}
          checkStores={[...new Set(Object.values(storeChecks).map((c) => c.provider))]}
        />
      )}
      {sampleStores.length > 0 && (
        <p className="flex items-start gap-2 rounded-2xl bg-violet-50 px-4 py-3 text-sm text-violet-900 dark:bg-violet-950 dark:text-violet-100">
          <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {sampleStores.map((p) => STORE_META[p].name).join(" and ")} results here are recorded samples, not
            live prices.
          </span>
        </p>
      )}

      {searched.length === 0 ? (
        <EmptyState
          title="No stores are connected yet"
          body="Store API keys aren't configured on this server, so there's nothing to search."
        />
      ) : allFailed ? (
        <EmptyState
          title="Stores aren't responding"
          body={
            storeSearches.length > 0
              ? "We couldn't reach any store just now. You can search them directly, or try again in a minute."
              : "We couldn't reach any store just now. Please try again in a minute."
          }
        >
          {storeSearches.length > 0 && (
            <ul className="flex flex-wrap justify-center gap-2" aria-label="Search the stores directly">
              {storeSearches.map(({ provider, href }) => (
                <li key={provider}>
                  <a
                    href={href}
                    {...OUTBOUND_LINK}
                    className={cn(
                      buttonVariants({ variant: "secondary", size: "lg" }),
                      "h-11 rounded-xl px-4 font-semibold",
                    )}
                  >
                    Search {STORE_META[provider].name}
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </EmptyState>
      ) : groups.length === 0 ? (
        <EmptyState
          title="No matches"
          body={`No store had results for “${query.rawText}”. Try fewer or more general words.`}
        />
      ) : (
        <>
          <ol className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3" aria-label="Products">
            {groups.map((group) => (
              <li key={group.id} className="min-w-0">
                <ProductGroupCard
                  group={group}
                  links={outboundLinks}
                  findMatches={findMatchesLink(group, connectedStores, query.normalizedText)}
                  checkStore={storeChecks[group.id] ?? null}
                  user={
                    userLists && {
                      searchText: query.rawText,
                      saved: userLists.savedIds.includes(group.offers[0].id),
                      tracking: userLists.alertIds.includes(group.offers[0].id),
                    }
                  }
                />
              </li>
            ))}
          </ol>
          <div className="flex flex-col items-center gap-3 pt-2">
            <p className="text-sm text-muted-foreground">
              Showing {groups.length} {groups.length === 1 ? "product" : "products"}
              {!pagination.hasNextPage && groups.length > 0 && " — that's everything the stores returned"}
            </p>
            {pagination.hasNextPage && <LoadMore href={nextPageHref(query, pagination.page + 1)} />}
          </div>
        </>
      )}
    </section>
  );
}
