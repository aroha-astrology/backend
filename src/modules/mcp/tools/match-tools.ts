import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { matchmake } from '../../astro/astro.service.js';
import { birthInputShape, placeLabel, resolveBirth, type BirthMoment } from '../birth.js';
import { textResult, type ToolContext } from '../mcp.context.js';
import { appLink, appLinkShape, registerTool } from '../mcp.tools.js';

const personShape = z.object(birthInputShape);

function toEngineBirth(birth: BirthMoment) {
  return {
    date: birth.date,
    time: birth.time,
    latitude: birth.place.lat,
    longitude: birth.place.lon,
    // The offset in force at that place on that date, so historic daylight time is honoured.
    timezone: String(birth.tzOffsetHours),
    timeAccuracy: birth.timeKnown ? ('exact' as const) : ('unknown' as const),
  };
}

/**
 * What each of the eight kootas compares, in neutral words. The engine's own
 * per-koota text is written for the app's match report and speaks in the
 * tradition's blunt terms ("incompatible", "inauspicious", boy/girl). Here the
 * points and a plain description of the measure are enough; ChatGPT explains
 * them under the skill's tone rules.
 */
const KOOTAS: Record<string, { name: string; measures: string }> = {
  Varna: { name: 'Varna', measures: 'Outlook and approach to work' },
  Vashya: { name: 'Vashya', measures: 'Mutual influence between the two moon signs' },
  Tara: { name: 'Tara', measures: 'Harmony between the two birth stars' },
  Yoni: { name: 'Yoni', measures: 'Temperament and closeness' },
  GrahaMaitri: {
    name: 'Graha Maitri',
    measures: 'Friendship between the lords of the two moon signs',
  },
  Gana: { name: 'Gana', measures: 'Nature and temperament' },
  Bhakoot: { name: 'Bhakoot', measures: 'How the two moon signs are placed from each other' },
  Nadi: { name: 'Nadi', measures: 'Constitution; the koota with the most points' },
};

/** Where the total falls on the traditional scale, as a description rather than a verdict. */
const SCORE_BANDS: Record<string, string> = {
  excellent: 'high (28 to 36)',
  good: 'good (21 to 27)',
  average: 'middle (18 to 20)',
  below_average: 'below the traditional minimum of 18 (14 to 17)',
  poor: 'low (under 14)',
};

const ABOUT =
  'A traditional astrological compatibility score, offered for reflection. It is not advice on whether two people should marry, and it says nothing about health, children or how a relationship will turn out.';

export function registerMatchTools(server: McpServer, base: ToolContext): void {
  registerTool(
    server,
    base,
    {
      name: 'check_kundli_match',
      title: 'Check kundli match',
      description:
        'Use this when the user asks for a kundli match (kundli milan, guna milan), the traditional Vedic astrology compatibility score between two people, and has given the birth date, time and place of both. ' +
        'Calculates the 36-point Ashtakoota score with its eight parts, and notes whether Nadi, Bhakoot or Mangal Dosha appears in the traditional system. ' +
        'It only calculates from the details given: nothing is saved and no one is contacted. ' +
        'The result is a traditional score for reflection, not advice on whether to marry. Use it only with birth details the user is entitled to share.',
      input: {
        first_person: personShape.describe(
          'Birth details of the first person. The traditional method counts from one chart to the other, so the order matters: by convention the groom is first.',
        ),
        second_person: personShape.describe(
          'Birth details of the second person. By convention the bride is second.',
        ),
      },
      output: {
        total_score: z.number(),
        max_score: z.number(),
        score_band: z.string().describe('Where the total falls on the traditional scale'),
        kootas: z.array(
          z.object({
            name: z.string(),
            obtained: z.number(),
            maximum: z.number(),
            measures: z.string().describe('What this part of the score compares'),
          }),
        ),
        nadi_dosha: z.boolean().describe('Nadi koota scored 0 of 8'),
        bhakoot_dosha: z.boolean().describe('Bhakoot koota scored 0 of 7'),
        mangal_dosha: z.object({
          first_person: z.string().describe('none, partial, full or cancelled'),
          second_person: z.string().describe('none, partial, full or cancelled'),
          matched: z.boolean().describe('In effect in both charts, or in neither'),
        }),
        notes: z.array(z.string()).describe('What the traditional system notes about this pair'),
        about: z.string().describe('What this score is and is not'),
        places: z.object({ first_person: z.string(), second_person: z.string() }),
        caveat: z.string().optional(),
        ...appLinkShape,
      },
      invoking: 'Matching the two charts',
      invoked: 'Match ready',
    },
    async (args, ctx) => {
      const first = resolveBirth(args.first_person);
      if ('problem' in first) return first.problem;
      const second = resolveBirth(args.second_person);
      if ('problem' in second) return second.problem;

      const match = await matchmake('chatgpt', {
        person1: toEngineBirth(first.birth),
        person2: toEngineBirth(second.birth),
        locale: 'en',
        consent: true,
      });

      const nadi = match.flags?.nadiDosha ?? false;
      const bhakoot = match.flags?.bhakootDosha ?? false;
      const mangalMatched = match.mangalDosha?.matched ?? true;
      const notes = [
        ...(!nadi && !bhakoot && mangalMatched
          ? ['No Nadi, Bhakoot or Mangal Dosha mismatch appears.']
          : []),
        ...(nadi ? ['Nadi koota scored 0 of 8, which the tradition calls Nadi Dosha.'] : []),
        ...(bhakoot
          ? ['Bhakoot koota scored 0 of 7, which the tradition calls Bhakoot Dosha.']
          : []),
        mangalMatched
          ? 'Mangal Dosha is in the same state in both charts, which the tradition treats as balanced.'
          : 'Mangal Dosha is in effect in one chart and not the other, which the tradition suggests talking over with an astrologer.',
      ];
      const band = SCORE_BANDS[match.compatibility] ?? match.compatibility;

      const structured = {
        total_score: match.totalScore,
        max_score: match.maxScore,
        score_band: band,
        kootas: match.kutaDetails.map((k) => ({
          name: KOOTAS[k.name]?.name ?? k.name,
          obtained: k.obtained,
          maximum: k.maximum,
          measures: KOOTAS[k.name]?.measures ?? '',
        })),
        nadi_dosha: nadi,
        bhakoot_dosha: bhakoot,
        mangal_dosha: {
          first_person: match.mangalDosha?.type1 ?? 'none',
          second_person: match.mangalDosha?.type2 ?? 'none',
          matched: mangalMatched,
        },
        notes,
        about: ABOUT,
        places: {
          first_person: placeLabel(first.birth.place),
          second_person: placeLabel(second.birth.place),
        },
        ...(match.lagnaCaveat ? { caveat: match.lagnaCaveat } : {}),
        ...appLink(
          ctx,
          'For a detailed reading of this match, use the Aroha app: its Kundli Milan report covers each area of married life.',
        ),
      };
      return textResult(
        structured,
        `Guna Milan score ${match.totalScore} of ${match.maxScore}, ${band}. ${notes.join(' ')} ${ABOUT}`,
      );
    },
  );
}
