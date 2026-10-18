import { eq } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { appSettings } from '../../db/schema.js';
import { isFeatureOn, isFeatureOnGlobally } from '../features/features.service.js';
import {
  EMPTY_STORED,
  StoredHomeLayoutSchema,
  type HomeLayoutDoc,
  type StoredHomeLayout,
} from './home-layout.schemas.js';

const KEY = 'home.layout';
const SWITCH = 'experience.homeLayout';

export async function readStoredLayout(): Promise<StoredHomeLayout> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
  if (!row) return EMPTY_STORED;
  const parsed = StoredHomeLayoutSchema.safeParse(row.value);
  // A stored document that no longer fits the schema is ignored rather than breaking Home.
  return parsed.success ? parsed.data : EMPTY_STORED;
}

async function writeStoredLayout(next: StoredHomeLayout, updatedBy: string): Promise<StoredHomeLayout> {
  const now = new Date();
  await db
    .insert(appSettings)
    .values({ key: KEY, value: next, updatedAt: now, updatedBy })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: next, updatedAt: now, updatedBy } });
  return next;
}

/**
 * Which layout the app should use for one user. The switch (experience.homeLayout) is the gate:
 * off for the user means the built-in order. When it is on for everyone, everyone gets the
 * published layout. When it is on only for an admin user group, those testers get the draft (if
 * there is one), so the owner can try an order before publishing it.
 */
export function pickLayoutForUser(
  stored: StoredHomeLayout,
  on: boolean,
  onGlobally: boolean,
): { layout: HomeLayoutDoc | null; source: 'published' | 'draft' | null } {
  if (!on) return { layout: null, source: null };
  if (!onGlobally && stored.draft) return { layout: stored.draft, source: 'draft' };
  if (stored.published) return { layout: stored.published, source: 'published' };
  return { layout: null, source: null };
}

export async function layoutForUser(userId: string) {
  const on = await isFeatureOn(userId, SWITCH);
  if (!on) return { layout: null, source: null } as const;
  const [stored, onGlobally] = await Promise.all([readStoredLayout(), isFeatureOnGlobally(SWITCH)]);
  return pickLayoutForUser(stored, on, onGlobally);
}

export async function saveDraft(doc: HomeLayoutDoc, by: string): Promise<StoredHomeLayout> {
  const stored = await readStoredLayout();
  return writeStoredLayout({ ...stored, draft: doc }, by);
}

export async function discardDraft(by: string): Promise<StoredHomeLayout> {
  const stored = await readStoredLayout();
  return writeStoredLayout({ ...stored, draft: null }, by);
}

/** The draft becomes the published layout; what was published is kept for Undo. */
export function publishStored(stored: StoredHomeLayout): StoredHomeLayout | null {
  if (!stored.draft) return null;
  return { draft: stored.draft, published: stored.draft, previous: stored.published };
}

export async function publishDraft(by: string): Promise<StoredHomeLayout | null> {
  const next = publishStored(await readStoredLayout());
  return next ? writeStoredLayout(next, by) : null;
}

/** Back to the layout published before the last publish. */
export function undoStored(stored: StoredHomeLayout): StoredHomeLayout | null {
  if (!stored.previous) return null;
  return { draft: stored.draft, published: stored.previous, previous: null };
}

export async function undoPublish(by: string): Promise<StoredHomeLayout | null> {
  const next = undoStored(await readStoredLayout());
  return next ? writeStoredLayout(next, by) : null;
}
