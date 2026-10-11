import type { ImportTaxPolicy } from "@/domain/pricing/import-tax-policy";
import { money } from "@/domain/shared/money";

/**
 * Israeli personal-import rules used for landed-price ESTIMATES.
 *
 * Last verified: 2026-10-11. The VAT exemption went $75 → $150 (Dec 2025) → $130
 * (Feb 2026) and the Knesset revoked both orders, restoring $75 (July 2026).
 * Re-verify against the Israel Tax Authority before launch and on any news of change.
 *
 * Open questions (owner: product):
 * - exemptionBasis: most sources say the threshold uses the goods value only, with
 *   shipping excluded when charged separately. Some carriers apply item + shipping.
 * - defaultDutyRateBps: real duty depends on the tariff code (0–12% + purchase tax on
 *   some categories). 12% is a deliberately conservative over-estimate for orders > $500.
 * - clearanceFee: carriers charge a handling fee when collecting VAT; amount varies by
 *   carrier and is not modeled yet.
 */
export const ISRAEL_IMPORT_POLICY: ImportTaxPolicy = {
  vatRateBps: 1800,
  vatExemptionThreshold: money(75_00, "USD"),
  dutyExemptionThreshold: money(500_00, "USD"),
  defaultDutyRateBps: 1200,
  exemptionBasis: "goods_only",
  clearanceFee: money(0, "ILS"),
};
