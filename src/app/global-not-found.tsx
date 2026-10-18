import type { Metadata } from "next";
import Link from "next/link";
import { BASE_METADATA, HtmlShell } from "@/app/_html";

export const metadata: Metadata = { ...BASE_METADATA, title: "Page not found" };

/**
 * Any URL no route matches (an unknown language segment included). It renders outside
 * every layout, so it brings its own document and styles.
 */
export default function GlobalNotFound() {
  return (
    <HtmlShell lang="en" dir="ltr">
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start gap-3 px-4 py-16">
        <h1 className="text-3xl font-bold tracking-tight text-brand-navy">Page not found</h1>
        <p className="text-muted-foreground">That page doesn&apos;t exist, or it has moved.</p>
        <p className="text-muted-foreground" lang="he" dir="rtl">
          הדף לא נמצא.
        </p>
        <Link href="/" className="font-semibold text-primary underline-offset-4 hover:underline">
          Back to OneCart
        </Link>
      </main>
    </HtmlShell>
  );
}
