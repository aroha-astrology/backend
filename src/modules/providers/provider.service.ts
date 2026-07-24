// =============================================================================
// Provider module service — Batch 1 addition: self-serve login/portal for
// admin-invited astrologers (see astrologers.service.ts#adminInviteAstrologer
// and requireProvider in src/middleware/auth.ts). `kind: 'pandit'` already
// flows through the type system (providerAccounts.kind), but there is no
// pandit profile/booking table yet — listProviderBookings below leaves an
// explicit extension point for the Pooja Booking Batch 1 plan rather than
// stubbing a fake pandit branch.
// =============================================================================

import { findAstrologerById, listBookingsForAstrologer } from '../astrologers/astrologers.repo.js';
import { toAstrologerDto, toBookingDto } from '../astrologers/astrologers.service.js';
import { listPoojaBookingsForPandit } from '../pooja-bookings/pooja-bookings.repo.js';
import type { AstrologerBookingDto } from '../astrologers/astrologers.schemas.js';
import type { PoojaBookingRow } from '../../db/schema.js';
import type { ProviderMeDto } from './provider.schemas.js';

export interface ProviderIdentity {
  kind: 'astrologer' | 'pandit';
  refId: string;
  displayName: string;
}

/**
 * GET /v1/provider/me. When kind === 'astrologer', also fetches and inlines
 * the full astrologer profile (astrologers.repo.ts#findAstrologerById) so the
 * portal doesn't need a second round-trip.
 */
export async function getProviderMe(provider: ProviderIdentity): Promise<ProviderMeDto> {
  const astrologer =
    provider.kind === 'astrologer' ? ((await findAstrologerById(provider.refId)) ?? null) : null;
  return {
    kind: provider.kind,
    refId: provider.refId,
    displayName: provider.displayName,
    astrologer: astrologer ? toAstrologerDto(astrologer) : null,
  };
}

/**
 * DTO mapper for a pooja booking returned by GET /v1/provider/bookings for a
 * pandit provider. Same field shape as PoojaBookingDtoSchema
 * (pooja-bookings.schemas.ts) and the toBookingDto already duplicated
 * locally in pooja-bookings.routes.ts / pooja-bookings.admin.routes.ts — kept
 * local here too rather than newly exported from the pooja-bookings module,
 * matching that existing per-file convention instead of introducing a new
 * cross-module shared export for it.
 */
function toPoojaBookingDto(row: PoojaBookingRow) {
  return {
    id: row.id,
    poojaId: row.poojaId,
    panditId: row.panditId,
    preferredDate: row.preferredDate,
    shipAddress: row.shipAddress,
    shipPincode: row.shipPincode,
    status: row.status,
    pricePaisePaid: row.pricePaisePaid,
    requestedAt: row.requestedAt.toISOString(),
    assignedAt: row.assignedAt ? row.assignedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    notes: row.notes,
  };
}

/** GET /v1/provider/bookings. */
export async function listProviderBookings(
  provider: Pick<ProviderIdentity, 'kind' | 'refId'>,
): Promise<(AstrologerBookingDto | ReturnType<typeof toPoojaBookingDto>)[]> {
  if (provider.kind === 'astrologer') {
    const rows = await listBookingsForAstrologer(provider.refId);
    return rows.map(toBookingDto);
  }
  const rows = await listPoojaBookingsForPandit(provider.refId);
  return rows.map(toPoojaBookingDto);
}
