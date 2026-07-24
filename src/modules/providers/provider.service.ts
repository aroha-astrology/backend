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
import type { AstrologerBookingDto } from '../astrologers/astrologers.schemas.js';
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

/** GET /v1/provider/bookings. */
export async function listProviderBookings(
  provider: Pick<ProviderIdentity, 'kind' | 'refId'>,
): Promise<AstrologerBookingDto[]> {
  if (provider.kind === 'astrologer') {
    const rows = await listBookingsForAstrologer(provider.refId);
    return rows.map(toBookingDto);
  }
  // TODO(pooja-booking plan): add a kind === 'pandit' branch here listing
  // pooja_bookings by panditId, once that table/repo exists.
  return [];
}
