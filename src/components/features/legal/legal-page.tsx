import type { ReactNode } from "react";

export const LEGAL_LAST_UPDATED = "13 October 2026";

/** Shared layout for /privacy and /terms: one h1, readable line length, dated. */
export function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pt-8 pb-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-brand-navy">{title}</h1>
        <p className="text-sm text-muted-foreground">Last updated {LEGAL_LAST_UPDATED}</p>
        <p className="text-base leading-relaxed text-foreground">{intro}</p>
      </header>
      <div className="flex flex-col gap-6 text-sm leading-relaxed text-foreground/90 [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-foreground [&_li]:ms-5 [&_li]:list-disc [&_section]:flex [&_section]:flex-col [&_section]:gap-2">
        {children}
      </div>
    </main>
  );
}

/** "write to us at x@y" when a contact address is configured (CONTACT_EMAIL). */
export function ContactLine({ email, purpose }: { email: string | undefined; purpose: string }) {
  if (!email) return null;
  return (
    <p>
      For {purpose}, write to us at <a href={`mailto:${email}`}>{email}</a>.
    </p>
  );
}
