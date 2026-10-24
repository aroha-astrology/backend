// The reader's own hook push settings: each hook's push can be switched off on its own, on top of
// the "hooks" category toggle in Settings -> Notifications. Stored as one small row per reader.

import type { UserRow } from '../../db/schema.js';
import { HOOKS, type HookName } from './hooks-rules.js';
import { getProgress, mergeProgress } from './hooks.repo.js';

export interface HookPrefs {
  /** Hooks whose push the reader switched off. */
  off: HookName[];
}

export async function getHookPrefs(user: UserRow): Promise<HookPrefs> {
  const row = await getProgress(user.id, '_prefs', '', '-');
  const off = ((row?.data as { off?: string[] } | undefined)?.off ?? []).filter((h): h is HookName => (HOOKS as readonly string[]).includes(h));
  return { off };
}

export async function setHookPref(user: UserRow, hook: HookName, push: boolean): Promise<HookPrefs> {
  const { off } = await getHookPrefs(user);
  const next = push ? off.filter((h) => h !== hook) : [...new Set([...off, hook])];
  await mergeProgress(user.id, '_prefs', '', '-', { off: next });
  return { off: next };
}
