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

export function registerMatchTools(server: McpServer, base: ToolContext): void {
  registerTool(
    server,
    base,
    {
      name: 'check_kundli_match',
      title: 'Check kundli match',
      description:
        'Use this when the user wants a Vedic marriage compatibility check (kundli milan, guna milan) between two people and has given both sets of birth details. ' +
        'Returns the 36-point Ashtakoota score with each of the eight kootas, Nadi and Bhakoot dosha flags, and Mangal Dosha for both. Nothing is saved. ' +
        'For a traditional match give the groom as the first person and the bride as the second.',
      input: {
        first_person: personShape.describe('Birth details of the first person (the groom in a traditional match)'),
        second_person: personShape.describe('Birth details of the second person (the bride in a traditional match)'),
      },
      output: {
        total_score: z.number(),
        max_score: z.number(),
        verdict: z.string(),
        kootas: z.array(
          z.object({
            name: z.string(),
            obtained: z.number(),
            maximum: z.number(),
            meaning: z.string(),
          }),
        ),
        nadi_dosha: z.boolean().describe('Nadi koota scored 0 of 8'),
        bhakoot_dosha: z.boolean().describe('Bhakoot koota scored 0 of 7'),
        mangal_dosha: z.object({
          first_person: z.string().describe('none, partial, full or cancelled'),
          second_person: z.string().describe('none, partial, full or cancelled'),
          matched: z.boolean().describe('Both effectively Manglik, or both not'),
        }),
        recommendation: z.string(),
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

      const structured = {
        total_score: match.totalScore,
        max_score: match.maxScore,
        verdict: match.compatibility,
        kootas: match.kutaDetails.map((k) => ({
          name: k.name,
          obtained: k.obtained,
          maximum: k.maximum,
          meaning: k.description ?? '',
        })),
        nadi_dosha: match.flags?.nadiDosha ?? false,
        bhakoot_dosha: match.flags?.bhakootDosha ?? false,
        mangal_dosha: {
          first_person: match.mangalDosha?.type1 ?? 'none',
          second_person: match.mangalDosha?.type2 ?? 'none',
          matched: match.mangalDosha?.matched ?? true,
        },
        recommendation: match.recommendation ?? '',
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
        `Guna Milan score ${match.totalScore} of ${match.maxScore} (${match.compatibility}). ${match.recommendation ?? ''}`.trim(),
      );
    },
  );
}
