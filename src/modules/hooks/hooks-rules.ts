// =============================================================================
// Daily-return hooks — shared rules (v7 spec, Sprint 6)
// =============================================================================
// Plain functions with no database: the push cap, the reader's local-day maths, the ids used for
// idempotency and the push types. The services around them do the reading and writing.
// =============================================================================

export const HOOKS = [
  'kundliRahasya',
  'shubhLabh',
  'gharKavach',
  'sankalpDiya',
  'cosmicReceipts',
  'textTiming',
  'sleepSync',
  'mysteryDrop',
] as const;
export type HookName = (typeof HOOKS)[number];

/** The admin switch of each hook. */
export const hookSwitch = (hook: HookName): string => `hooks.${hook}`;

/** Push `type` per hook. All of them are one notification category, "hooks". */
export const HOOK_PUSH_TYPE: Record<HookName, string> = {
  kundliRahasya: 'hook_rahasya',
  shubhLabh: 'hook_shubh_labh',
  gharKavach: 'hook_kavach',
  sankalpDiya: 'hook_diya',
  cosmicReceipts: 'hook_receipts',
  textTiming: 'hook_text_peak',
  sleepSync: 'hook_sleep',
  mysteryDrop: 'hook_mystery',
};

/** At most this many hook pushes reach one reader in a local day unless the owner changes it. */
export const DEFAULT_PUSH_CAP = 3;
export const MAX_PUSH_CAP = 8;

export function clampPushCap(value: unknown): number {
  const n = typeof value === 'number' ? Math.floor(value) : Number.NaN;
  return Number.isFinite(n) && n >= 0 && n <= MAX_PUSH_CAP ? n : DEFAULT_PUSH_CAP;
}

/** True while another hook push still fits under the cap. */
export function underCap(sentToday: number, cap: number): boolean {
  return sentToday < cap;
}

/** Idempotency id of one unlock or one earn: "<hook>:<profile>:<local date>[:<extra>]". */
export function refFor(hook: HookName, profileKey: string, localDate: string, extra?: string): string {
  return [hook, profileKey || 'self', localDate, ...(extra ? [extra] : [])].join(':');
}

/** Wallet key of a hook charge or gift: scoped to the feature, profile and local date. */
export function walletKeyFor(ref: string): string {
  return `hook:${ref}`;
}

/** YYYY-MM-DD plus `days`, calendar arithmetic only (no zone involved). */
export function addDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (both YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  const ms = (s: string): number => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

/** Length of the run of consecutive dates ending on `endDate` (0 when `endDate` is not in the set). */
export function runEndingOn(dates: ReadonlySet<string>, endDate: string): number {
  let run = 0;
  for (let d = endDate; dates.has(d); d = addDays(d, -1)) run++;
  return run;
}

/** Minutes after local midnight from "HH:MM". */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function toClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** A real count is only shown from this many people (a tiny number looks fake and says little). */
export const MIN_PUBLIC_COUNT = 20;

export function publicCount(n: number): number | null {
  return n >= MIN_PUBLIC_COUNT ? n : null;
}

/** The three equal parts of a local day the Receipts use. */
export const DAY_PARTS = ['morning', 'afternoon', 'evening'] as const;
export type DayPart = (typeof DAY_PARTS)[number];
