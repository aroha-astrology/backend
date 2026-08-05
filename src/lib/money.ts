/**
 * Money is stored and passed around as integer paise everywhere in this
 * codebase (`wallet_balance_paise`, `feature_flags.price_paise`, every
 * `*_FALLBACK_PAISE`). This is the one place that turns a paise amount into
 * user-facing text.
 *
 * It exists because several notification/copy strings used to hardcode the
 * rupee figure ("You earned ₹100!") next to a payout that the admin could
 * change — so the message and the actual credit could disagree. Anything that
 * quotes an amount to a user must format the SAME resolved value it acted on,
 * never a literal.
 *
 * Mirrors the frontend's `formatRupees` in `lib/format.ts`: whole rupees when
 * the amount divides evenly, two decimals otherwise.
 */
export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${Number.isInteger(rupees) ? rupees : rupees.toFixed(2)}`;
}
