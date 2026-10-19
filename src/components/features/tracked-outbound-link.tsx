"use client";

import type { ComponentProps } from "react";
import { OUTBOUND_LINK } from "@/components/features/outbound-link";
import { analyticsTitle, trackEvent, type AnalyticsEvents } from "@/lib/analytics";

/**
 * An outbound store link (`OUTBOUND_LINK`: new tab, nofollow sponsored) that reports the
 * click. Reporting never delays or blocks the navigation: nothing is awaited and the
 * default action is untouched. Middle-clicks count too; right-clicks don't.
 */
export function TrackedOutboundLink({
  click,
  ...props
}: Omit<ComponentProps<"a">, "target" | "rel"> & { click: AnalyticsEvents["outbound_click"] }) {
  const report = () =>
    trackEvent("outbound_click", { ...click, product_title: analyticsTitle(click.product_title) });
  return (
    <a
      {...props}
      {...OUTBOUND_LINK}
      onClick={(event) => {
        report();
        props.onClick?.(event);
      }}
      onAuxClick={(event) => {
        if (event.button === 1) report();
        props.onAuxClick?.(event);
      }}
    />
  );
}
