import type { UserRow } from '../../db/schema.js';
import { houseFrom, buildChartContext, type ChartContext } from '../../lib/intelligence/chart-context.js';
import type { ProfileContext } from '../birth-profiles/profile-context.js';
import { isFeatureOn, priceOf } from '../features/features.service.js';
import { findKundliByUserId } from './kundli.repo.js';

/**
 * The house-insight offer (v7 spec, switch `money.houseOffer`): house 1 and the house the current
 * Mahadasha lord sits in are free, any other house costs `money.houseSingle` (25 coins), and all
 * twelve together cost `money.houseBundle` (149 coins). With the switch off none of this applies
 * and a house costs `paid.houseInsight`, as it always did.
 */

export const HOUSE_SINGLE_FALLBACK_PAISE = 2500;
export const HOUSE_BUNDLE_FALLBACK_PAISE = 14900;
export const ALL_HOUSES: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

type BirthTimeAccuracy = 'exact' | 'approximate' | 'unknown' | null;
type OfferChart = Pick<ChartContext, 'dasha' | 'natal' | 'moonSignIndex'>;

/**
 * The house the current Mahadasha lord sits in: counted from the Ascendant, or from the Moon when
 * the birth time is unknown (the Ascendant is not reliable then, the Moon chart is). Null when the
 * chart has no running Mahadasha or the planet is not in the chart.
 */
export function mahadashaHouse(ctx: OfferChart, birthTimeAccuracy: BirthTimeAccuracy): number | null {
  const lord = ctx.dasha.mahadasha?.planet;
  if (!lord) return null;
  const placed = ctx.natal.find((p) => p.planet === lord);
  if (!placed) return null;
  return birthTimeAccuracy === 'unknown'
    ? houseFrom(ctx.moonSignIndex, placed.signIndex)
    : placed.house;
}

/** House 1 plus the Mahadasha house, de-duplicated and in order. */
export function freeHouseNumbers(ctx: OfferChart, birthTimeAccuracy: BirthTimeAccuracy): number[] {
  const dasha = mahadashaHouse(ctx, birthTimeAccuracy);
  return [...new Set([1, ...(dasha ? [dasha] : [])])].sort((a, b) => a - b);
}

/**
 * What the bundle costs for what is still locked: the bundle price, but never more than buying
 * those houses one by one. Someone who already bought seven houses is not asked for 149 coins to
 * finish the last two.
 */
export function bundleDuePaise(lockedPaidHouses: number, singlePaise: number, bundlePaise: number): number {
  return Math.min(bundlePaise, lockedPaidHouses * singlePaise);
}

export interface HouseOffer {
  /** False while money.houseOffer is off: the app keeps today's one-price unlock. */
  enabled: boolean;
  /** Houses that cost nothing (house 1 and the Mahadasha house). Empty when disabled or the chart is not ready. */
  freeHouses: number[];
  singlePaise: number;
  bundlePaise: number;
  /** What "unlock all" would cost right now. 0 means nothing is left to unlock. */
  bundleDuePaise: number;
  /** Houses that are neither unlocked nor free: what single or bundle purchases would pay for. */
  lockedPaidHouses: number[];
}

/** The free houses of one profile's chart, or null while its chart is not ready. */
export async function loadFreeHouses(user: UserRow, profile: ProfileContext): Promise<number[] | null> {
  const kundli = await findKundliByUserId(user.id, profile.birthProfileId);
  if (!kundli) return null;
  const ctx = await buildChartContext(kundli, profile, new Date());
  return ctx ? freeHouseNumbers(ctx, profile.birthTimeAccuracy) : null;
}

export async function getHouseOffer(user: UserRow, profile: ProfileContext): Promise<HouseOffer> {
  const [on, singlePaise, bundlePaise] = await Promise.all([
    isFeatureOn(user.id, 'money.houseOffer'),
    priceOf(user.id, 'money.houseSingle', HOUSE_SINGLE_FALLBACK_PAISE),
    priceOf(user.id, 'money.houseBundle', HOUSE_BUNDLE_FALLBACK_PAISE),
  ]);
  if (!on) {
    return { enabled: false, freeHouses: [], singlePaise, bundlePaise, bundleDuePaise: 0, lockedPaidHouses: [] };
  }
  const free = (await loadFreeHouses(user, profile)) ?? [];
  const unlocked = new Set(profile.unlockedHouses);
  const lockedPaidHouses = ALL_HOUSES.filter((h) => !unlocked.has(h) && !free.includes(h));
  return {
    enabled: true,
    freeHouses: free,
    singlePaise,
    bundlePaise,
    bundleDuePaise: bundleDuePaise(lockedPaidHouses.length, singlePaise, bundlePaise),
    lockedPaidHouses,
  };
}
