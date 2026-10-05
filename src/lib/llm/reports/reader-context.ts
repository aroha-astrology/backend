// =============================================================================
// The reader's real situation, as fact lines for a report narrative prompt
// =============================================================================
// See astro-engine/reports/reader-situation.ts for where these answers come from
// and why they exist. Every line starts with "What the reader told us", which is
// the phrase REALITY_RULE (report-facts-message.ts, sent with every report call)
// tells the model to treat as true and never contradict.
// =============================================================================

import type {
  ReaderChildren,
  ReaderIncome,
  ReaderRelationship,
  ReaderSituation,
  ReaderWork,
} from '../../astro-engine/reports/reader-situation.js';

const INCOME_LABEL: Record<ReaderIncome, string> = {
  salaried: 'a salary / a job',
  business: 'their own business',
  self_employed: 'freelance or self-employed work',
  property: 'rent or property',
  not_earning: 'not earning right now (student, homemaker, between jobs or retired)',
};

const WORK_LABEL: Record<ReaderWork, string> = {
  job: 'employed in a job',
  business: 'runs their own business',
  self_employed: 'freelance or self-employed',
  student: 'a student, not yet working',
  not_working: 'not working right now (homemaker, between jobs or retired)',
};

const RELATIONSHIP_LABEL: Record<ReaderRelationship, string> = {
  single: 'single',
  in_relationship: 'in a relationship, not married',
  married: 'married',
  previously_married: 'previously married (separated, divorced or widowed), not married now',
};

const CHILDREN_LABEL: Record<ReaderChildren, string> = {
  none: 'they have NO children',
  one: 'they have one child',
  two_or_more: 'they have two or more children',
};

/** Empty when the reader answered nothing — the prompt then simply carries no such line. */
export function readerContextLines(reader: ReaderSituation | null | undefined): string[] {
  if (!reader) return [];
  const lines: string[] = [];
  if (reader.earnsBy) {
    lines.push(`What the reader told us — how they earn today: ${INCOME_LABEL[reader.earnsBy]}.`);
  }
  if (reader.ownsProperty) {
    lines.push(
      reader.ownsProperty === 'yes'
        ? 'What the reader told us — they own a house or land.'
        : 'What the reader told us — they do NOT own any house or land, so nothing has come to them from property so far.',
    );
  }
  if (reader.worksAs) {
    lines.push(`What the reader told us — work today: ${WORK_LABEL[reader.worksAs]}.`);
  }
  if (reader.relationship) {
    lines.push(
      `What the reader told us — relationship status today: ${RELATIONSHIP_LABEL[reader.relationship]}.`,
    );
  }
  if (reader.children) {
    lines.push(`What the reader told us — children today: ${CHILDREN_LABEL[reader.children]}.`);
  }
  return lines;
}

/** The status saved on the account at sign-up. No screen can change it afterwards, so it is
 * offered to the model as a weaker hint than anything the reader said at purchase. */
export function savedStatusLine(status: string | null | undefined): string | null {
  return status
    ? `Relationship status saved on the reader's profile at sign-up (may be out of date — lean on it lightly, and never write anything that would be wrong if it has changed): ${status}.`
    : null;
}
