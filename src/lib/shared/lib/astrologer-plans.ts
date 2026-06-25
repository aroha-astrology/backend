import type { AstroPlan } from '../types/database';

export const ASTRO_PLANS: Record<AstroPlan, { price: number; customers: number; label: string }> = {
  basic:        { price: 500,  customers: 10, label: 'Basic' },
  premium:      { price: 1000, customers: 20, label: 'Premium' },
  premium_plus: { price: 2500, customers: 50, label: 'Premium+' },
};

export const ASTRO_ADDONS = [
  { id: 'addon_5',  price: 250,  customers: 5,  label: '+5 Customers',  badge: 'Starter' },
  { id: 'addon_11', price: 500,  customers: 11, label: '+11 Customers', badge: 'Growth' },
  { id: 'addon_25', price: 1000, customers: 25, label: '+25 Customers', badge: 'Pro' },
] as const;

export type AstroAddonId = typeof ASTRO_ADDONS[number]['id'];
