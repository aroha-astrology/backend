// =============================================================================
// Varshik Rashifal 2027 tiers: Snapshot (basic), Gold, Sampoorna (complete)
// =============================================================================
// The report is always written in full. The tier decides which pages the reader sees (the
// frontend filters by page key) and what was paid. Price and card text live in the
// varshik_pricing_tiers table (migration 0109) so the owner changes them in Admin with no deploy.
// The server charges the price read here, never one sent by the client.
// =============================================================================

import { asc, eq } from 'drizzle-orm';
import { z } from '@hono/zod-openapi';
import { db } from '../../config/db.js';
import { varshikPricingTiers, type VarshikTierRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';

export const VARSHIK_TIER_SLUGS = ['basic', 'gold', 'complete'] as const;
export type VarshikTierSlug = (typeof VARSHIK_TIER_SLUGS)[number];
export const VarshikTierSlugSchema = z.enum(VARSHIK_TIER_SLUGS);

export function isVarshikTierSlug(v: unknown): v is VarshikTierSlug {
  return typeof v === 'string' && (VARSHIK_TIER_SLUGS as readonly string[]).includes(v);
}

/** One tier as the app and the admin page see it. Prices are paise. */
export const VarshikTierSchema = z
  .object({
    tierSlug: VarshikTierSlugSchema,
    displayName: z.string(),
    subtitle: z.string(),
    badgeText: z.string().nullable(),
    pricePaise: z.number().int(),
    originalPricePaise: z.number().int().nullable(),
    pageCount: z.number().int(),
    shortDescription: z.string(),
    features: z.array(z.string()),
    excludes: z.array(z.string()),
    isPopular: z.boolean(),
    isActive: z.boolean(),
    sortOrder: z.number().int(),
    updatedAt: z.string(),
  })
  .openapi('VarshikTier');
export type VarshikTierDto = z.infer<typeof VarshikTierSchema>;

/** A tier on the catalogue: also carries what THIS reader pays after the Aroha Pass discount. */
export const VarshikCatalogueTierSchema = VarshikTierSchema.extend({
  /** Price after the reader's Pass discount (equal to listPricePaise without a Pass). */
  payPaise: z.number().int(),
}).openapi('VarshikCatalogueTier');
export type VarshikCatalogueTierDto = z.infer<typeof VarshikCatalogueTierSchema>;

/** Same rounding as reports.service withPassDiscount (not imported: that file imports this one). */
export function tierPayPaise(pricePaise: number, discountPct: number): number {
  return discountPct > 0 ? Math.round((pricePaise * (100 - discountPct)) / 100) : pricePaise;
}

function toDto(row: VarshikTierRow): VarshikTierDto {
  return {
    tierSlug: row.tierSlug as VarshikTierSlug,
    displayName: row.displayName,
    subtitle: row.subtitle,
    badgeText: row.badgeText,
    pricePaise: row.pricePaise,
    originalPricePaise: row.originalPricePaise,
    pageCount: row.pageCount,
    shortDescription: row.shortDescription,
    features: row.features,
    excludes: row.excludes,
    isPopular: row.isPopular,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Every tier, active or not, in sort order: the admin page. */
export async function listAllVarshikTiers(): Promise<VarshikTierDto[]> {
  const rows = await db.select().from(varshikPricingTiers).orderBy(asc(varshikPricingTiers.sortOrder));
  return rows.map(toDto);
}

/** The tiers a reader can buy now. */
export async function listActiveVarshikTiers(): Promise<VarshikTierDto[]> {
  return (await listAllVarshikTiers()).filter((t) => t.isActive);
}

/** The active catalogue tiers priced for one reader (Pass discount applied). */
export async function listCatalogueVarshikTiers(passDiscountPct: number): Promise<VarshikCatalogueTierDto[]> {
  return (await listActiveVarshikTiers()).map((t) => ({
    ...t,
    payPaise: tierPayPaise(t.pricePaise, passDiscountPct),
  }));
}

/** One tier the reader may buy; refuses an unknown or switched-off one before any money moves. */
export async function getBuyableVarshikTier(slug: unknown): Promise<VarshikTierDto> {
  if (!isVarshikTierSlug(slug)) throw Errors.badRequest('TIER_REQUIRED');
  const [row] = await db.select().from(varshikPricingTiers).where(eq(varshikPricingTiers.tierSlug, slug)).limit(1);
  if (!row || !row.isActive) throw Errors.badRequest('TIER_UNAVAILABLE');
  return toDto(row);
}

/** The tier row regardless of whether it is on sale (an owner of a switched-off tier keeps it). */
export async function getVarshikTier(slug: string): Promise<VarshikTierDto | null> {
  if (!isVarshikTierSlug(slug)) return null;
  const [row] = await db.select().from(varshikPricingTiers).where(eq(varshikPricingTiers.tierSlug, slug)).limit(1);
  return row ? toDto(row) : null;
}

/** What the admin may change. Slug is fixed; the page set per tier lives in the app. */
export const VarshikTierPatchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(60),
    subtitle: z.string().trim().min(1).max(120),
    badgeText: z.string().trim().max(40).nullable(),
    pricePaise: z.number().int().min(0).max(10_000_000),
    originalPricePaise: z.number().int().min(0).max(10_000_000).nullable(),
    pageCount: z.number().int().min(1).max(200),
    shortDescription: z.string().trim().min(1).max(600),
    features: z.array(z.string().trim().min(1).max(160)).max(10),
    excludes: z.array(z.string().trim().min(1).max(160)).max(10),
    isPopular: z.boolean(),
    isActive: z.boolean(),
  })
  .partial()
  .openapi('VarshikTierPatch');
export type VarshikTierPatch = z.infer<typeof VarshikTierPatchSchema>;

export async function updateVarshikTier(slug: VarshikTierSlug, patch: VarshikTierPatch): Promise<VarshikTierDto> {
  const current = await getVarshikTier(slug);
  if (!current) throw Errors.notFound('Unknown tier');
  const next = { ...current, ...patch };
  if (next.originalPricePaise !== null && next.originalPricePaise < next.pricePaise) {
    throw Errors.badRequest('The struck-out price cannot be lower than the price');
  }
  const [row] = await db
    .update(varshikPricingTiers)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(varshikPricingTiers.tierSlug, slug))
    .returning();
  return toDto(row!);
}
