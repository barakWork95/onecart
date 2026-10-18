"use client";

import { BellRing, X } from "lucide-react";
import { useState, useTransition } from "react";
import { createAlertAction } from "@/app/[lang]/alerts/actions";
import { buttonVariants } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { suggestTarget } from "@/domain/user-lists/price-alert";
import { money } from "@/domain/shared/money";
import { formatMoney } from "@/lib/format";
import { dict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

export function TrackPriceButton({
  productId,
  searchText,
  title,
  currentAgorot,
  initialTracking,
  overlay = false,
  locale = "en",
}: {
  locale?: Locale;
  productId: string;
  searchText: string;
  title: string;
  currentAgorot: number;
  initialTracking: boolean;
  /** Styled to sit on top of a product image. */
  overlay?: boolean;
}) {
  const t = dict(locale).lists;
  const current = money(currentAgorot, "ILS");
  const [open, setOpen] = useState(false);
  const [tracking, setTracking] = useState(initialTracking);
  const [target, setTarget] = useState(String(suggestTarget(current).amountMinor / 100));
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createAlertAction({ productId, searchText, targetShekels: target, locale });
      if (result.ok) {
        setTracking(true);
        setConfirmed(result.value.target);
        setOpen(false);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger
        aria-label={tracking ? t.changeAlert(title) : t.track(title)}
        title={confirmed ? t.alertSetBelow(confirmed) : undefined}
        className={cn(
          "flex size-9 items-center justify-center rounded-full border transition-colors",
          tracking
            ? "border-primary bg-primary/10 text-primary"
            : "border-border bg-card text-muted-foreground hover:text-foreground",
          overlay && "border-transparent shadow-sm backdrop-blur",
          overlay && (tracking ? "bg-background/95" : "bg-background/85"),
        )}
      >
        <BellRing className={cn("size-4", tracking && "fill-current")} aria-hidden />
      </DrawerTrigger>
      <DrawerContent className="mx-auto max-w-2xl rounded-t-3xl">
        <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-muted" aria-hidden />
        <form
          onSubmit={submit}
          className="flex flex-col gap-4 px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold tracking-widest text-primary uppercase">{t.alertHeading}</p>
              <DrawerTitle className="mt-1 text-xl font-bold text-foreground">{title}</DrawerTitle>
              <DrawerDescription className="mt-1 text-sm text-muted-foreground">
                {t.alertDescription(formatMoney(current, { precise: true, locale }))}
              </DrawerDescription>
            </div>
            <DrawerClose
              aria-label={t.closeAlert}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
            >
              <X className="size-4" aria-hidden />
            </DrawerClose>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground">
            {t.alertWhen}
            <span className="relative">
              <span className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                ₪
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="1"
                step="0.01"
                required
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="h-12 w-full rounded-xl border border-border bg-card ps-9 pe-4 text-base outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/20"
              />
            </span>
          </label>
          {error && (
            <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className={cn(buttonVariants({ size: "lg" }), "h-12 rounded-xl text-base font-semibold")}
          >
            {pending ? t.saving : tracking ? t.updateAlert : t.createAlert}
          </button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
