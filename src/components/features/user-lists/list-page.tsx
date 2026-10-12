import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { ProductImage } from "@/components/features/search/product-image";
import type { ReactNode } from "react";

/** Shared chrome for /saved and /alerts. */
export function ListPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pt-6 pb-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-brand-navy">{title}</h1>
        <p className="text-sm text-muted-foreground">{intro}</p>
      </header>
      {children}
    </main>
  );
}

export function EmptyList({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border px-6 py-12 text-center">
      <Icon className="size-10 text-muted-foreground" aria-hidden />
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      <Link
        href="/"
        className="mt-2 inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
      >
        Find products
      </Link>
    </div>
  );
}

export function ProductThumb({ imageUrl }: { imageUrl: string | null }) {
  return (
    <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-white">
      <ProductImage src={imageUrl} sizes="64px" className="p-1.5" />
    </div>
  );
}
