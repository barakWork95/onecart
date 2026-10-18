import { extractAttributes } from "@/domain/matching/item-attributes";
import { money, type Money } from "@/domain/shared/money";

/** A multi-pack's landed price per piece: "₪3.20 per piece" for a 10-pack at ₪32. */
export interface UnitPrice {
  readonly pack: number;
  readonly perUnit: Money;
}

/** "1/50Pcs", "2/5PCS", "1-3 pcs": a menu of pack sizes, priced for the smallest. */
const PACK_OPTIONS = /\d\s*[/-]\s*\d+\s*-?\s*(?:pcs|pc|pieces?|pack|pk)\b/i;

/**
 * The landed total per piece when a listing states exactly one pack size of
 * two or more. Null for a single item, an unstated pack, or a listing that
 * offers several pack sizes (its price is for whichever is cheapest).
 */
export function unitPrice(title: string, total: Money): UnitPrice | null {
  if (PACK_OPTIONS.test(title)) return null;
  const packs = extractAttributes(title).get("pack");
  if (!packs || packs.size !== 1) return null;
  const pack = Number([...packs][0]);
  if (!Number.isInteger(pack) || pack < 2) return null;
  return { pack, perUnit: money(Math.round(total.amountMinor / pack), total.currency) };
}
