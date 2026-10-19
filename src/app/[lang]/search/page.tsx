import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { searchFromParams } from "@/app/_composition";
import { readUserLists, userListsService } from "@/app/_user-lists";
import { PopularSearches } from "@/components/features/search/popular-searches";
import { ResultsSkeleton } from "@/components/features/search/results-skeleton";
import { ResultsView } from "@/components/features/search/results-view";
import { SearchBox } from "@/components/features/search/search-box";
import { Skeleton } from "@/components/ui/skeleton";
import { sanitizeSearchText } from "@/domain/search/search-query";
import { dict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";
import { currentLocale, getDictionary } from "@/i18n/server";

// Results are live store queries (see robots.ts); they're never worth indexing.
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).meta.searchTitle, robots: { index: false, follow: false } };
}

type SearchParams = PageProps<"/[lang]/search">["searchParams"];

async function Results({ searchParams, locale }: { searchParams: SearchParams; locale: Locale }) {
  // Live prices, clocks and caches: always render at request time, never prerender.
  await connection();
  const [result, access] = await Promise.all([searchFromParams(await searchParams), readUserLists()]);
  if (result.kind === "no_query") return null;
  const state = access.kind === "user" ? await userListsService.listState(access.repo) : null;
  const userLists =
    access.kind === "unavailable"
      ? null
      : { savedIds: state ? [...state.savedIds] : [], alertIds: state ? [...state.alertIds] : [] };
  return (
    <ResultsView
      response={result.response}
      translation={result.translation}
      demoMode={result.demoMode}
      outboundLinks={result.outboundLinks}
      storeChecks={result.storeChecks}
      storeSearches={result.storeSearches}
      sampleStores={result.sampleStores}
      userLists={userLists}
      locale={locale}
    />
  );
}

async function SearchContent({ searchParams, locale }: { searchParams: SearchParams; locale: Locale }) {
  const t = dict(locale).search;
  const params = await searchParams;
  // The same text the search runs on: tags, control characters and overlong input never show.
  const q = typeof params.q === "string" ? sanitizeSearchText(params.q) : "";

  return (
    <>
      {/* Keyed so a new query remounts the box with the new text. */}
      <SearchBox key={q} defaultValue={q} autoFocus={!q} locale={locale} />
      {q ? (
        // Keyed by the query string so every new search shows the skeleton. `page` is left out:
        // "Load more" keeps the cards on screen while the longer list renders.
        <Suspense
          key={new URLSearchParams(
            Object.entries(params).flatMap(([k, v]) =>
              typeof v === "string" && k !== "page" ? [[k, v]] : [],
            ),
          ).toString()}
          fallback={<ResultsSkeleton label={t.results.loading} />}
        >
          <Results searchParams={searchParams} locale={locale} />
        </Suspense>
      ) : (
        <PopularSearches heading={t.trySearching} locale={locale} />
      )}
    </>
  );
}

export default async function SearchPage({ searchParams }: PageProps<"/[lang]/search">) {
  const locale = await currentLocale();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 pt-4 pb-8">
      <h1 className="sr-only">{dict(locale).search.heading}</h1>
      <Suspense fallback={<Skeleton className="h-14 w-full rounded-2xl" />}>
        <SearchContent searchParams={searchParams} locale={locale} />
      </Suspense>
    </main>
  );
}
