// =============================================================================
// Varshik Rashifal 2027: who may buy it, and what the pre-purchase answers may be
// =============================================================================
// Everything here runs BEFORE the wallet is touched (see purchaseReport), so a refused purchase
// never takes money.
//
//   1. The window. The report is on sale through 31 Dec 2027 and refused after (the row's
//      validity window itself is ReportDef.fixedWindow).
//   2. Birth time. The Varsha Lagna swings a whole sign in about two hours, so the time must be
//      one the reader gave with confidence: the same confidence figure the Birth Time card shows
//      (lib/intelligence/birth-time-confidence.ts). Medium or high passes; a remembered
//      ("approximate") time, a part-of-day window or no time at all is refused. A time the
//      reader rectified passes.
//   3. Birth place. Latitude, longitude and zone must all be there: the solar return is cast for
//      the birth place and the calendar year is cut in its zone.
//   4. The ten answers. ALL of them are required, with only these keys and values: the report is
//      written from what the reader told us and never from a guess, and the scorer's decision table
//      (config/varshik-weights.ts) and the persona check in verify-claims.ts read the same values.
// =============================================================================

import { getReportDef } from '../../config/reports.js';
import { Errors } from '../../lib/errors.js';
import { baselineBirthTimeConfidence } from '../../lib/intelligence/birth-time-confidence.js';
import type { UserRow } from '../../db/schema.js';
import type { ProfileContext } from '../birth-profiles/profile-context.js';

export const VARSHIK_KEY = 'varshik_rashifal_2027';

/** The ten pre-purchase questions and every value each may take (the frontend lists the same). */
export const VARSHIK_ANSWER_VALUES = {
  relationship: ['single', 'partnered', 'married', 'previously_married'],
  occupation: ['student', 'working', 'business', 'seeking_work', 'homemaker', 'retired'],
  children: ['none', 'planning', 'have'],
  mainDecision: [
    'job_change',
    'start_business',
    'relationship',
    'move_or_travel',
    'money',
    'health',
    'study',
    'nothing_specific',
  ],
  livingWith: ['alone', 'partner', 'parents', 'joint_family', 'friends_or_others'],
  home: ['own', 'rented', 'family_home', 'buying_or_building'],
  moneyFocus: ['saving', 'investing', 'clearing_debt', 'earning_more', 'big_purchase', 'nothing_specific'],
  travelPlan: ['abroad', 'within_india', 'none'],
  studyPlan: ['exam', 'course', 'none'],
  practice: ['daily', 'sometimes', 'never'],
} as const;

export type VarshikAnswerKey = keyof typeof VARSHIK_ANSWER_VALUES;
export const VARSHIK_ANSWER_KEYS = Object.keys(VARSHIK_ANSWER_VALUES) as VarshikAnswerKey[];

/** The first reason a profile cannot buy, or null when it can. Pure, so it is easy to test. */
export function varshikBirthDataProblem(
  profile: Pick<
    ProfileContext,
    'timeOfBirth' | 'birthTimeAccuracy' | 'birthTimeSource' | 'placeOfBirth' | 'birthProfileId'
  >,
  user: Pick<UserRow, 'birthTimeRectified'>,
): 'BIRTH_TIME_NOT_CONFIRMED' | 'BIRTH_PLACE_MISSING' | null {
  const confidence = baselineBirthTimeConfidence({
    timeOfBirth: profile.timeOfBirth,
    birthTimeAccuracy: profile.birthTimeAccuracy,
    birthTimeSource: profile.birthTimeSource,
  });
  // Rectification is stored on the account owner's own row only.
  const rectified = profile.birthProfileId === null && user.birthTimeRectified === true;
  if (!profile.timeOfBirth || (confidence.level === 'low' && !rectified)) {
    return 'BIRTH_TIME_NOT_CONFIRMED';
  }
  const place = profile.placeOfBirth;
  const ok =
    !!place &&
    Number.isFinite(place.lat) &&
    Number.isFinite(place.lon) &&
    Math.abs(place.lat) <= 90 &&
    Math.abs(place.lon) <= 180 &&
    typeof place.tz === 'string' &&
    place.tz.length > 0;
  return ok ? null : 'BIRTH_PLACE_MISSING';
}

/**
 * Throws a 400 for an answer key or value outside the lists above. With `requireAll` (every purchase)
 * it also throws for any of the ten answers that is missing: nothing about the reader's life is guessed.
 */
export function assertVarshikAnswersValid(answers: Record<string, string> | undefined, requireAll = false): void {
  if (requireAll) {
    for (const key of VARSHIK_ANSWER_KEYS) {
      if (!answers?.[key]) throw Errors.badRequest(`Missing answer for ${VARSHIK_KEY}.${key}`);
    }
  }
  if (!answers) return;
  for (const [key, value] of Object.entries(answers)) {
    const allowed = (VARSHIK_ANSWER_VALUES as Record<string, readonly string[]>)[key];
    if (!allowed) throw Errors.badRequest(`Unexpected answer key for ${VARSHIK_KEY}: ${key}`);
    if (!allowed.includes(value)) {
      throw Errors.badRequest(`Unexpected answer for ${VARSHIK_KEY}.${key}`);
    }
  }
}

/**
 * The report must be written on the chart as the birth details stand NOW. When the reader has just
 * filled in or confirmed a birth detail, the Kundli is rebuilt in the background; until that rebuild is
 * saved the stored chart is the old one (its birthHash no longer matches). Pure, so it is easy to test.
 *   BIRTH_DETAILS_MISSING: no chart can be cast at all (date, time, place or zone missing or unreadable).
 *   CHART_UPDATING: a chart can be cast, but the saved one is missing, still building or built from older details.
 */
export function varshikChartProblem(
  kundli: { status: string; birthHash: string | null } | null | undefined,
  currentBirthHash: string | null,
): 'BIRTH_DETAILS_MISSING' | 'CHART_UPDATING' | null {
  if (!currentBirthHash) return 'BIRTH_DETAILS_MISSING';
  if (!kundli || kundli.status !== 'ready' || kundli.birthHash !== currentBirthHash) return 'CHART_UPDATING';
  return null;
}

export function assertVarshikPurchaseAllowed(args: {
  profile: ProfileContext;
  user: UserRow;
  answers: Record<string, string> | undefined;
  /** Today in the app's zone, 'YYYY-MM-DD'. */
  today: string;
}): void {
  const window = getReportDef(VARSHIK_KEY)?.fixedWindow;
  if (window && args.today >= window.endExclusive) {
    throw Errors.badRequest('REPORT_WINDOW_CLOSED');
  }
  const problem = varshikBirthDataProblem(args.profile, args.user);
  if (problem) throw Errors.badRequest(problem);
  assertVarshikAnswersValid(args.answers, true);
}
