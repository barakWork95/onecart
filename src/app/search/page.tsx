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

export const metadata: Metadata = { title: "Compare prices" };

type SearchParams = PageProps<"/search">["searchParams"];

async function Results({ searchParams }: { searchParams: SearchParams }) {
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
      userLists={userLists}
    />
  );
}

async function SearchContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";

  return (
    <>
      {/* Keyed so a new query remounts the box with the new text. */}
      <SearchBox key={q} defaultValue={q} autoFocus={!q} />
      {q ? (
        // Keyed by the full query string so every new search shows the skeleton.
        <Suspense
          key={new URLSearchParams(
            Object.entries(params).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])),
          ).toString()}
          fallback={<ResultsSkeleton />}
        >
          <Results searchParams={searchParams} />
        </Suspense>
      ) : (
        <PopularSearches heading="Try searching for" />
      )}
    </>
  );
}

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 pt-4 pb-8">
      <h1 className="sr-only">Compare prices across stores</h1>
      <Suspense fallback={<Skeleton className="h-14 w-full rounded-2xl" />}>
        <SearchContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
