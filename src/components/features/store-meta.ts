import type { ProviderId } from "@/domain/shared/provider";

/** Display names and the small logo-chip styling used in cards and the compare sheet. */
export const STORE_META: Record<
  ProviderId,
  { readonly name: string; readonly short: string; readonly chip: string }
> = {
  aliexpress: {
    name: "AliExpress",
    short: "Ali",
    chip: "bg-orange-50 text-red-600 dark:bg-red-950 dark:text-red-300",
  },
  temu: {
    name: "Temu",
    short: "Temu",
    chip: "bg-amber-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  },
  amazon: {
    name: "Amazon",
    short: "Amz",
    chip: "bg-sky-50 text-slate-800 dark:bg-sky-950 dark:text-sky-200",
  },
  ebay: {
    name: "eBay",
    short: "eBay",
    chip: "bg-slate-100 text-blue-700 dark:bg-slate-800 dark:text-blue-300",
  },
};
