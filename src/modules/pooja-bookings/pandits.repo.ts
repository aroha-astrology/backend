// =============================================================================
// Pandits repo — the concierge pilot's admin-vetted pandit roster. Every
// pandit is added by an admin (see pooja-bookings.admin.routes.ts) after
// off-platform vetting — there is NO self-onboarding route in this batch, so
// `verified` simply defaults to true: an admin having added the row IS the
// verification step, unlike the abandoned reference app's
// self-signup-with-hardcoded-verified-true model, which had no real vetting
// behind that flag at all.
// =============================================================================

import { eq } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { pandits, type PanditRow, type NewPanditRow } from '../../db/schema.js';

export async function createPandit(values: NewPanditRow): Promise<PanditRow> {
  const [row] = await db.insert(pandits).values(values).returning();
  if (!row) throw new Error('Failed to insert pandit');
  return row;
}

export async function findPanditById(id: string): Promise<PanditRow | undefined> {
  const rows = await db.select().from(pandits).where(eq(pandits.id, id)).limit(1);
  return rows[0];
}
