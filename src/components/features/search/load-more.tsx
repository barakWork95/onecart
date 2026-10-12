"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Label() {
  const { pending } = useLinkStatus();
  return (
    <>
      {/* Fixed-size icon slot, so the label doesn't shift while loading. */}
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <ChevronDown className="size-4" aria-hidden />
      )}
      <span aria-live="polite">{pending ? "Loading more…" : "Load more"}</span>
    </>
  );
}

/**
 * "Load more" is a link to the next results page: the server re-renders the
 * list through that page while the current cards stay on screen. Never
 * prefetched, because a deeper page can cost a store API call (SerpApi bills
 * per page); the server serves already-loaded results first.
 */
export function LoadMore({ href }: { href: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      scroll={false}
      className={cn(
        buttonVariants({ variant: "secondary", size: "lg" }),
        "h-11 w-full rounded-xl px-6 font-semibold sm:w-auto",
      )}
    >
      <Label />
    </Link>
  );
}
