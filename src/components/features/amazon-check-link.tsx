"use client";

import { ExternalLink } from "lucide-react";
import { amazonCheckUrl } from "@/domain/affiliate/amazon-check";
import { dict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";
import { analyticsTitle, trackEvent } from "@/lib/analytics";

/** Amazon is a separate destination, never a priced row or a /go redirect in interim mode. */
export function AmazonCheckLink({
  query,
  tag,
  disclose = true,
  locale = "en",
}: {
  query: string;
  tag?: string;
  disclose?: boolean;
  locale?: Locale;
}) {
  const t = dict(locale).amazonInterim;
  return (
    <div className="flex flex-col gap-1 py-2">
      <a
        href={amazonCheckUrl(query, tag)}
        target="_blank"
        rel="sponsored nofollow noopener"
        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold text-primary hover:bg-secondary"
        onClick={() => trackEvent("amazon_price_check", { query: analyticsTitle(query), locale })}
      >
        {t.checkPrice}
        <ExternalLink className="size-3.5" aria-hidden />
      </a>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{t.notCompared}</p>
      {disclose && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {dict(locale).affiliateDisclosure}
        </p>
      )}
    </div>
  );
}
