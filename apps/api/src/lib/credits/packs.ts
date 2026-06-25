// Single source of truth for credit packs. Server uses this to validate
// pack_id and amount; client mirrors it for display in the credits page.
// Prices are in INR rupees and inclusive of 18% GST.

export interface CreditPack {
  id: string;
  credits: number;
  priceRupees: number;
  label: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'pack_10',  credits: 10,  priceRupees: 99,  label: 'Starter Pack (10 tokens)' },
  { id: 'pack_30',  credits: 30,  priceRupees: 199, label: 'Popular Pack (30 tokens)' },
  { id: 'pack_100', credits: 100, priceRupees: 599, label: 'Best Value Pack (100 tokens)' },
];

export function getPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}
