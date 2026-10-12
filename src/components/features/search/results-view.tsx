import { AlertTriangle, BadgeCheck, FlaskConical, Languages, SearchX } from "lucide-react";
import type { QueryTranslationInfo } from "@/application/search/build-search-query";
import { ProductGroupCard } from "@/components/features/search/product-group-card";
import { SortChips } from "@/components/features/search/sort-chips";
import { STORE_META } from "@/components/features/store-meta";
import {
  FAILED_PROVIDER_STATUSES,
  type ProviderOutcome,
  type SearchResponse,
} from "@/domain/search/search-response";

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

function PartialNotice({ failed }: { failed: readonly ProviderOutcome[] }) {
  const list = failed
    .map((o) => `${STORE_META[o.provider].name} (${STATUS_TEXT[o.status] ?? "unavailable"})`)
    .join(", ");
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>Some stores are unavailable right now: {list}. Showing results from the rest.</span>
    </p>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border px-6 py-12 text-center">
      <SearchX className="size-10 text-muted-foreground" aria-hidden />
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export interface ResultsViewProps {
  readonly response: SearchResponse;
  readonly translation: QueryTranslationInfo | null;
  readonly demoMode: boolean;
  /** Offer id → signed `/go/...` href. */
  readonly outboundLinks: Readonly<Record<string, string>>;
  /** Products this visitor saved / tracks; null when wishlists aren't available. */
  readonly userLists?: { readonly savedIds: readonly string[]; readonly alertIds: readonly string[] } | null;
}

export function ResultsView({
  response,
  translation,
  demoMode,
  outboundLinks,
  userLists = null,
}: ResultsViewProps) {
  const { query, groups, providers, totalOffers, isPartial } = response;
  const searched = providers.filter((p) => p.status !== "skipped");
  const failed = searched.filter((p) => FAILED_PROVIDER_STATUSES.includes(p.status));
  const allFailed = searched.length > 0 && failed.length === searched.length;
  const anyTaxEstimated = groups.some((g) => g.offers.some((o) => !o.price.taxesCollectedAtCheckout));

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

      {isPartial && !allFailed && <PartialNotice failed={failed} />}

      {searched.length === 0 ? (
        <EmptyState
          title="No stores are connected yet"
          body="Store API keys aren't configured on this server, so there's nothing to search."
        />
      ) : allFailed ? (
        <EmptyState
          title="Stores aren't responding"
          body="We couldn't reach any store just now. Please try again in a minute."
        />
      ) : groups.length === 0 ? (
        <EmptyState
          title="No matches"
          body={`No store had results for “${query.rawText}”. Try fewer or more general words.`}
        />
      ) : (
        <ol className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3" aria-label="Products">
          {groups.map((group) => (
            <li key={group.id} className="min-w-0">
              <ProductGroupCard
                group={group}
                links={outboundLinks}
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
      )}
    </section>
  );
}
