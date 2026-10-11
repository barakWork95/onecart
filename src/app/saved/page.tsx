import { Bookmark, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { getServices } from "@/app/_composition";
import { readUserLists } from "@/app/_user-lists";
import { removeSavedAction } from "@/app/saved/actions";
import { STORE_META } from "@/components/features/store-meta";
import { EmptyList, ListPage, ProductThumb } from "@/components/features/user-lists/list-page";
import { RemoveButton } from "@/components/features/user-lists/remove-button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Saved" };

async function SavedList() {
  await connection();
  const access = await readUserLists();
  if (access.kind === "unavailable") {
    return (
      <EmptyList
        icon={Bookmark}
        title="Saving isn't available"
        body="Wishlists aren't configured on this server."
      />
    );
  }
  const items = access.kind === "user" ? await access.repo.listSaved() : [];
  if (items.length === 0) {
    return (
      <EmptyList
        icon={Bookmark}
        title="Nothing saved yet"
        body="Tap the bookmark on any product to keep it here."
      />
    );
  }

  const { linkCodec } = getServices();
  return (
    <ul className="flex flex-col gap-3" aria-label="Saved products">
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-3 rounded-3xl border border-border/60 bg-card p-3">
          <ProductThumb imageUrl={item.imageUrl} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold text-foreground">{item.title}</h2>
            <p className="text-xs text-muted-foreground">
              {formatMoney(item.price)} on {STORE_META[item.provider].name} when saved
            </p>
            <div className="mt-1 flex gap-3 text-sm font-semibold">
              <a
                href={linkCodec.encode({ id: item.productId, provider: item.provider, url: item.productUrl })}
                target="_blank"
                rel="nofollow sponsored noopener"
                className="text-primary"
                aria-label={`Go to ${STORE_META[item.provider].name} for ${item.title}`}
              >
                Go to store
              </a>
              <Link
                href={`/search?${new URLSearchParams({ q: item.searchText }).toString()}`}
                className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className="size-3.5" aria-hidden />
                Compare today&apos;s prices
              </Link>
            </div>
          </div>
          <RemoveButton
            label={`Remove ${item.title} from Saved`}
            action={removeSavedAction}
            productId={item.productId}
          />
        </li>
      ))}
    </ul>
  );
}

export default function SavedPage() {
  return (
    <ListPage title="Saved" intro="Products you bookmarked, with the landed price when you saved them.">
      <Suspense fallback={<Skeleton className="h-24 w-full rounded-3xl" />}>
        <SavedList />
      </Suspense>
    </ListPage>
  );
}
