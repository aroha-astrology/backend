// =============================================================================
// Digital Yantras & Wallpapers (roadmap step 11, ships off)
// =============================================================================
// A personal yantra designed from the chart (lib/astro-tools/yantra.ts): the
// graha, its number square, beej mantra, colours and the birth nakshatra.
// Two products, each a one-off wallet purchase per profile: the yantra
// (paid.digitalYantra, a print-ready square) and the phone wallpaper
// (paid.digitalWallpaper). The design is fixed at the first purchase, so a
// later purchase of the other kind (or a new dasha) shows the same yantra.
// The preview names the graha and why; the square and mantra come with
// ownership. The frontend draws both images from the spec. No AI call.
// =============================================================================

import type { UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import {
  buildYantraSpec,
  chooseYantraPlanet,
  type ShadbalaEntry,
  type YantraSpec,
} from '../../lib/astro-tools/yantra.js';
import { resolveFeaturesForUser } from '../features/features.service.js';
import { findKundliByUserId } from '../kundli/kundli.repo.js';
import { loadChartContext } from '../insights/insights.service.js';
import { addWalletBalance, deductWalletBalance } from '../users/users.repo.js';
import { insertDigitalProduct, listDigitalProducts, type DigitalKind } from './yantra.repo.js';

export const DIGITAL_PRODUCTS: Record<
  DigitalKind,
  { key: string; fallbackPaise: number; reason: string }
> = {
  yantra: { key: 'paid.digitalYantra', fallbackPaise: 4900, reason: 'digital_yantra' },
  wallpaper: { key: 'paid.digitalWallpaper', fallbackPaise: 2900, reason: 'digital_wallpaper' },
};

export interface YantraView {
  /** Always shown: which graha and why. */
  preview: Pick<YantraSpec, 'planet' | 'colours' | 'nakshatra' | 'why' | 'magicSum'>;
  owned: Record<DigitalKind, boolean>;
  /** The full design, once either product is owned. */
  spec: YantraSpec | null;
  /** What each product costs now; null while its switch is off. */
  prices: Record<DigitalKind, number | null>;
}

async function designFor(
  user: UserRow,
): Promise<{ birthProfileId: string | null; spec: YantraSpec }> {
  const loaded = await loadChartContext(user);
  if (!loaded) throw Errors.conflict('CHART_NOT_READY');
  const { profile, ctx } = loaded;
  const kundli = await findKundliByUserId(user.id, profile.birthProfileId);
  const shadbala = (
    (kundli?.chartData as { shadbala?: ShadbalaEntry[] } | null)?.shadbala ?? []
  ).filter((s) => typeof s?.totalVirupas === 'number');
  const maha = ctx.dasha.mahadasha;
  const choice = chooseYantraPlanet({
    mahadasha: maha ? { planet: maha.planet, until: maha.endDate.slice(0, 10) } : null,
    shadbala,
  });
  if (!choice) throw Errors.conflict('CHART_NOT_READY');
  return {
    birthProfileId: profile.birthProfileId,
    spec: buildYantraSpec(choice, ctx.moonNakshatraIndex),
  };
}

export async function getYantra(user: UserRow): Promise<YantraView> {
  const [{ birthProfileId, spec: fresh }, features] = await Promise.all([
    designFor(user),
    resolveFeaturesForUser(user.id),
  ]);
  const rows = await listDigitalProducts(user.id, birthProfileId);
  const owned = { yantra: false, wallpaper: false };
  for (const r of rows) owned[r.kind as DigitalKind] = true;
  // The design is fixed at the first purchase; before that, today's design.
  const bought = (rows.find((r) => r.kind === 'yantra') ?? rows[0])?.spec as YantraSpec | undefined;
  const shown = bought ?? fresh;
  const price = (kind: DigitalKind) => {
    const f = features[DIGITAL_PRODUCTS[kind].key];
    return f?.enabled === true ? (f.pricePaise ?? DIGITAL_PRODUCTS[kind].fallbackPaise) : null;
  };
  return {
    preview: {
      planet: shown.planet,
      colours: shown.colours,
      nakshatra: shown.nakshatra,
      why: shown.why,
      magicSum: shown.magicSum,
    },
    owned,
    spec: bought ?? null,
    prices: { yantra: price('yantra'), wallpaper: price('wallpaper') },
  };
}

/** Buys one product for the active profile (idempotent: owning it already costs nothing). */
export async function buyDigitalProduct(user: UserRow, kind: DigitalKind): Promise<YantraView> {
  const product = DIGITAL_PRODUCTS[kind];
  const features = await resolveFeaturesForUser(user.id);
  if (features[product.key]?.enabled !== true) throw Errors.forbidden('PRODUCT_NOT_AVAILABLE');

  const { birthProfileId, spec: fresh } = await designFor(user);
  const rows = await listDigitalProducts(user.id, birthProfileId);
  if (rows.some((r) => r.kind === kind)) return getYantra(user);
  const spec = (rows[0]?.spec as YantraSpec | undefined) ?? fresh;

  const price = features[product.key]?.pricePaise ?? product.fallbackPaise;
  const charged = await deductWalletBalance(user.id, price, product.reason);
  if (!charged) throw Errors.conflict('INSUFFICIENT_CREDITS');
  const refund = () =>
    addWalletBalance(user.id, price, `refund:${product.reason}`).catch((err: unknown) =>
      logger.error({ err, userId: user.id, kind }, 'yantra: refund failed'),
    );
  try {
    const inserted = await insertDigitalProduct({
      userId: user.id,
      birthProfileId,
      kind,
      spec,
      pricePaidPaise: price,
    });
    if (!inserted) await refund(); // a concurrent purchase won
  } catch (err) {
    await refund();
    throw err;
  }
  return getYantra(user);
}
