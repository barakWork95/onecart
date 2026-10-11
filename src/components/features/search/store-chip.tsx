import { STORE_META } from "@/components/features/store-meta";
import type { ProviderId } from "@/domain/shared/provider";
import { cn } from "@/lib/utils";

export function StoreChip({ provider, className }: { provider: ProviderId; className?: string }) {
  const meta = STORE_META[provider];
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full border border-border/60 text-xs font-bold",
        meta.chip,
        className,
      )}
    >
      {meta.short}
    </span>
  );
}
