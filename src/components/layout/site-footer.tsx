/** Required by the Amazon Associates Operating Agreement; keep the wording exact. */
export const AMAZON_ASSOCIATES_DISCLOSURE = "As an Amazon Associate I earn from qualifying purchases.";

/**
 * Site-wide footer. Its bottom padding clears the fixed bottom tab bar
 * (h-16 + safe area), so pages don't need to pad for it themselves.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 pb-[calc(4rem+env(safe-area-inset-bottom)+1.25rem)]">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-1 px-4 pt-5 text-center text-xs text-muted-foreground sm:flex-row sm:justify-between sm:text-start">
        <p>© OneCart</p>
        <p>{AMAZON_ASSOCIATES_DISCLOSURE}</p>
      </div>
    </footer>
  );
}
