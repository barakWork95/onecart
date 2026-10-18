import { ChevronRight } from "lucide-react";
import Link from "next/link";

export interface Crumb {
  readonly label: string;
  /** Omitted for the current page. */
  readonly href?: string;
}

/** "Home › Categories › Headphones", with the current page marked for assistive tech. */
export function Breadcrumbs({ crumbs, label = "Breadcrumb" }: { crumbs: readonly Crumb[]; label?: string }) {
  return (
    <nav aria-label={label} className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1.5">
        {crumbs.map((crumb, i) => (
          <li key={crumb.label} className="flex items-center gap-1.5">
            {/* An icon, not "›": text mirroring isn't reliable here, so right-to-left pages flip it. */}
            {i > 0 && <ChevronRight className="size-3.5 rtl:rotate-180" aria-hidden />}
            {crumb.href ? (
              <Link href={crumb.href} className="hover:text-foreground hover:underline">
                {crumb.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-foreground">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
