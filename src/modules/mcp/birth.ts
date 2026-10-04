import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { tzOffsetHours } from '../kundli/kundli.service.js';
import { errorResult } from './mcp.context.js';
import { resolvePlace, type ResolvedPlace } from './place-resolver.js';

function isRealCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export const dateField = (what: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
    .refine(isRealCalendarDate, 'is not a real calendar date')
    .refine((v) => {
      const year = Number(v.slice(0, 4));
      return year >= 1800 && year <= 2100;
    }, 'year must be between 1800 and 2100')
    .describe(`${what}, as YYYY-MM-DD.`);

export const birthDateField = dateField('Date of birth');

export const birthTimeField = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'must be 24-hour HH:mm')
  .optional()
  .describe(
    'Time of birth on the local clock at the birth place, 24-hour HH:mm. Leave out only when the person does not know it.',
  );

export const birthPlaceField = z
  .string()
  .min(2)
  .max(120)
  .describe(
    'Town or city of birth, with state or country when known, e.g. "Pune, Maharashtra, India". This is where the person was born, not where the user is now.',
  );

export const birthInputShape = {
  birth_date: birthDateField,
  birth_time: birthTimeField,
  birth_place: birthPlaceField,
};

export interface BirthInput {
  birth_date: string;
  birth_time?: string | undefined;
  birth_place: string;
}

/** One birth, pinned to a place and an instant, ready for the chart engine. */
export interface BirthMoment {
  date: string;
  time: string;
  /** False when no time was given; the chart is then cast for local noon. */
  timeKnown: boolean;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  tzOffsetHours: number;
  place: ResolvedPlace;
  /** The birth instant in UTC. */
  instant: Date;
}

export function placeLabel(place: ResolvedPlace): string {
  return [place.name, place.region, place.country].filter(Boolean).join(', ');
}

/** The model-readable reply when a typed place could not be pinned to one spot. */
export function placeProblem(input: string, what = 'birth place'): CallToolResult | null {
  const found = resolvePlace(input);
  if (found.status === 'resolved') return null;
  if (found.status === 'ambiguous') {
    const options = found.candidates.map((c) => `- ${placeLabel(c)}`).join('\n');
    return errorResult(
      `The ${what} "${input}" could mean more than one place:\n${options}\n` +
        'Ask the user which one they mean, then call the tool again with the full name including state and country.',
    );
  }
  return errorResult(
    `The ${what} "${input}" was not found. Ask the user for the nearest larger town or city, with its state and country, and call the tool again.`,
  );
}

export function resolvePlaceOrProblem(
  input: string,
  what = 'birth place',
): { place: ResolvedPlace } | { problem: CallToolResult } {
  const found = resolvePlace(input);
  if (found.status === 'resolved') return { place: found.place };
  return { problem: placeProblem(input, what)! };
}

export function resolveBirth(input: BirthInput): { birth: BirthMoment } | { problem: CallToolResult } {
  const located = resolvePlaceOrProblem(input.birth_place);
  if ('problem' in located) return located;

  const time = input.birth_time ?? '12:00';
  const [year, month, day] = input.birth_date.split('-').map(Number) as [number, number, number];
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  const wallClock = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = tzOffsetHours(located.place.timezone, wallClock);

  return {
    birth: {
      date: input.birth_date,
      time,
      timeKnown: input.birth_time !== undefined,
      year,
      month,
      day,
      hour,
      minute,
      tzOffsetHours: offset,
      place: located.place,
      instant: new Date(wallClock.getTime() - offset * 3_600_000),
    },
  };
}

/** Today's calendar date at a place. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
