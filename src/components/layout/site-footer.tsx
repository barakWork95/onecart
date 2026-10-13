import Link from "next/link";

/** Required by the Amazon Associates Operating Agreement; keep the wording exact. */
export const AMAZON_ASSOCIATES_DISCLOSURE = "As an Amazon Associate I earn from qualifying purchases.";

/** Our affiliate relationships, stated plainly on every page (eBay Partner Network, Amazon Associates). */
export const AFFILIATE_DISCLOSURE =
  "OneCart is a participant in affiliate programs including the eBay Partner Network and Amazon Associates. We may earn a commission on qualifying purchases at no additional cost to you.";

export const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Use" },
] as const;

/**
 * Site-wide footer: affiliate disclosures and legal links on every page. On
 * mobile its bottom padding clears the fixed tab bar (h-16 + safe area); from
 * `md` up the tab bar is gone, so it doesn't.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 pb-[calc(4rem+env(safe-area-inset-bottom)+1.25rem)] md:pb-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 pt-5 text-center text-xs text-muted-foreground sm:text-start">
        <p className="max-w-3xl leading-relaxed">
          {AFFILIATE_DISCLOSURE} {AMAZON_ASSOCIATES_DISCLOSURE}
        </p>
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p>© OneCart</p>
          <nav aria-label="Legal">
            <ul className="flex gap-4">
              {LEGAL_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="inline-flex min-h-11 items-center font-medium text-foreground/80 underline-offset-4 hover:underline"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
