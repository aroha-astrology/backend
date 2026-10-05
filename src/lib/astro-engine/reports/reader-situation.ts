// =============================================================================
// What the reader told us about their real life — shared by every report that asks
// =============================================================================
// A chart can say which way a life leans. It cannot know that the reader holds a
// job and owns no property, is already married, runs a shop, or has two children.
// Reports that guessed got it wrong and were called rubbish: the Wealth report told
// a salaried reader with no property that property is their wealth path.
//
// So the reports that need it ask, through the optional pre-purchase questions
// (frontend's lib/report-questions.ts), and this module turns those raw answers
// into one validated shape. Each report asks only the questions that matter to it,
// so every field is optional — a report never sees an answer nobody gave.
//
// Carried on `scores` as `readerSituation`: enums only, never free text, so the
// Final Verdict card (which never sees `userAnswers`) still knows the reader's real
// situation, and the narrative prompt gets it through `readerContextLines`
// (llm/reports/reader-context.ts).
// =============================================================================

/** How the reader earns today — `incomeToday` (wealth, finance_monthly). */
export type ReaderIncome = 'salaried' | 'business' | 'self_employed' | 'property' | 'not_earning';
/** What the reader does for work today — `workNow` (career_monthly). */
export type ReaderWork = 'job' | 'business' | 'self_employed' | 'student' | 'not_working';
/** The reader's relationship status today — `relationshipNow` (true_love,
 * relationship_monthly). `previously_married` covers separated, divorced and widowed. */
export type ReaderRelationship = 'single' | 'in_relationship' | 'married' | 'previously_married';
/** How many children the reader has today — `children` (progeny). */
export type ReaderChildren = 'none' | 'one' | 'two_or_more';

export interface ReaderSituation {
  earnsBy?: ReaderIncome;
  ownsProperty?: 'yes' | 'no';
  worksAs?: ReaderWork;
  relationship?: ReaderRelationship;
  children?: ReaderChildren;
}

const INCOMES: readonly string[] = [
  'salaried',
  'business',
  'self_employed',
  'property',
  'not_earning',
];
const WORKS: readonly string[] = ['job', 'business', 'self_employed', 'student', 'not_working'];
const RELATIONSHIPS: readonly string[] = [
  'single',
  'in_relationship',
  'married',
  'previously_married',
];
const CHILDREN: readonly string[] = ['none', 'one', 'two_or_more'];
const YES_NO: readonly string[] = ['yes', 'no'];

function pick<T extends string>(value: string | undefined, allowed: readonly string[]): T | null {
  return value !== undefined && allowed.includes(value) ? (value as T) : null;
}

/**
 * Null when the reader answered none of the questions (and for every report bought before they
 * were asked). Anything outside the offered option values is dropped rather than trusted —
 * `answers` is an open string map straight from the purchase request.
 */
export function readerSituationFromAnswers(
  answers: Record<string, string> | null | undefined,
): ReaderSituation | null {
  const situation: ReaderSituation = {};
  const earnsBy = pick<ReaderIncome>(answers?.incomeToday, INCOMES);
  if (earnsBy) situation.earnsBy = earnsBy;
  const ownsProperty = pick<'yes' | 'no'>(answers?.ownsProperty, YES_NO);
  if (ownsProperty) situation.ownsProperty = ownsProperty;
  const worksAs = pick<ReaderWork>(answers?.workNow, WORKS);
  if (worksAs) situation.worksAs = worksAs;
  const relationship = pick<ReaderRelationship>(answers?.relationshipNow, RELATIONSHIPS);
  if (relationship) situation.relationship = relationship;
  const children = pick<ReaderChildren>(answers?.children, CHILDREN);
  if (children) situation.children = children;
  return Object.keys(situation).length > 0 ? situation : null;
}

/**
 * The marriage report's status, once the reader's own "Are you currently married?" answer is
 * taken into account. The account's `relationship_status` is written once at sign-up and no
 * screen can change it, so the answer given at purchase is the fresher of the two:
 *   - "yes" always means married.
 *   - "no" over a saved "married" means the saved value is out of date; what replaced it is
 *     unknown, so the status becomes null rather than a guess. A saved divorced/widowed/single
 *     status is consistent with "no" and is kept.
 */
export function marriageStatusFromAnswer(
  accountStatus: string | null | undefined,
  answers: Record<string, string> | null | undefined,
): string | null {
  const saved = accountStatus ?? null;
  if (answers?.isMarried === 'yes') return 'married';
  if (answers?.isMarried === 'no' && saved === 'married') return null;
  return saved;
}
