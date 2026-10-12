import Image from "next/image";
import Link from "next/link";
import { DesktopNav } from "@/components/layout/desktop-nav";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/75">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-4 md:h-16">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex shrink-0 items-center gap-2 rounded-lg" aria-label="OneCart home">
            <Image src="/brand/onecart-icon.png" alt="" width={34} height={28} priority />
            <span className="leading-tight">
              <span className="block text-base font-bold tracking-tight text-brand-navy">OneCart</span>
              <span className="block text-[11px] font-medium text-muted-foreground">Compare</span>
            </span>
          </Link>
          <DesktopNav />
        </div>
        <span
          className="shrink-0 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground"
          title="All prices are shown in Israeli shekels, delivered to Israel"
        >
          ₪ ILS
        </span>
      </div>
    </header>
  );
}
