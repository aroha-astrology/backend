/**
 * Fixed top-up catalog. `amountPaise` is what the user pays — the `id`s here
 * MUST match real one-time product IDs configured in the Google Play Console
 * with the same price, since Play Billing products are fixed-price (see Task D1
 * in the rollout plan). Small and rarely-changing enough to keep as code rather
 * than a DB table — bump amounts here, no migration needed (but DOES need a
 * matching Play Console product edit).
 *
 * `bonusPaise` is extra wallet money on top of the payment (owner's offer,
 * 2026-10-17: pay ₹250 get ₹350, pay ₹500 get ₹750). It is granted by us when
 * the payment is confirmed, so changing it needs no Play Console edit.
 */
export const TOP_UP_AMOUNTS = [
  { id: 'recharge_25', amountPaise: 2500, currency: 'INR', label: '₹25' },
  { id: 'recharrge_50', amountPaise: 5000, currency: 'INR', label: '₹50' },
  { id: '100_recharge', amountPaise: 10000, currency: 'INR', label: '₹100' },
  {
    id: 'recharge_250',
    amountPaise: 25000,
    bonusPaise: 10000,
    currency: 'INR',
    label: '₹250',
    popular: true,
  },
  { id: 'recharge_500', amountPaise: 50000, bonusPaise: 25000, currency: 'INR', label: '₹500' },
] as const;

/** Extra wallet money a pack adds on top of its price; 0 for a pack without an offer or an unknown id. */
export function topUpBonusPaise(packId: string): number {
  const amount = TOP_UP_AMOUNTS.find((a) => a.id === packId);
  return amount && 'bonusPaise' in amount ? amount.bonusPaise : 0;
}
