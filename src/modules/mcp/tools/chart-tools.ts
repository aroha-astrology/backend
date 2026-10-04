import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { computeMoonSign } from '../../public/public.service.js';
import { birthInputShape, placeLabel, resolveBirth } from '../birth.js';
import {
  birthChartShape,
  chartSummary,
  computeBirthChart,
  UNKNOWN_TIME_CAVEAT,
} from '../chart.service.js';
import { spaced } from '../format.js';
import { BIRTH_CHART_WIDGET_URI, textResult, type ToolContext } from '../mcp.context.js';
import { appLink, appLinkShape, registerTool } from '../mcp.tools.js';

export const SIGNS = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
] as const;

const PLANETS = [
  'Sun',
  'Moon',
  'Mars',
  'Mercury',
  'Jupiter',
  'Venus',
  'Saturn',
  'Rahu',
  'Ketu',
] as const;

const CHART_NOTE =
  'For a detailed reading of this chart, use the Aroha app: it keeps the chart saved and adds the divisional charts, a reading for each house, the full dasha timeline and daily guidance.';

export function registerChartTools(server: McpServer, base: ToolContext): void {
  registerTool(
    server,
    base,
    {
      name: 'generate_birth_chart',
      title: 'Generate birth chart',
      description:
        'Use this when the user wants their Vedic birth chart (kundli, janam kundali) or asks about their ascendant, planets, houses, dasha, doshas or yogas and has given birth details. ' +
        'Calculates the chart from the birth date, time and place with the Lahiri ayanamsa and whole-sign houses. Nothing is saved. ' +
        'If the birth time is unknown the chart is cast for noon and the result says which parts are unreliable.',
      input: birthInputShape,
      output: { ...birthChartShape, ...appLinkShape },
      invoking: 'Calculating the birth chart',
      invoked: 'Birth chart ready',
    },
    async (args, ctx) => {
      const resolved = resolveBirth(args);
      if ('problem' in resolved) return resolved.problem;
      const chart = await computeBirthChart(resolved.birth);
      return textResult({ ...chart, ...appLink(ctx, CHART_NOTE) }, chartSummary(chart));
    },
  );

  registerTool(
    server,
    base,
    {
      name: 'find_moon_sign',
      title: 'Find moon sign',
      description:
        'Use this when the user only wants their Vedic moon sign (rashi) or birth star (nakshatra). ' +
        'Calculates where the Moon was at birth from the birth date, time and place. Nothing is saved. ' +
        'For a full chart use generate_birth_chart instead.',
      input: birthInputShape,
      output: {
        moon_sign: z.string(),
        degree: z.number().describe('Degrees within the sign, 0-30'),
        nakshatra: z.string(),
        pada: z.number(),
        nakshatra_lord: z.string(),
        place: z.string().describe('The place the birth place was matched to'),
        time_known: z.boolean(),
        caveat: z.string().optional(),
        ...appLinkShape,
      },
      invoking: 'Finding the moon sign',
      invoked: 'Moon sign found',
    },
    async (args, ctx) => {
      const resolved = resolveBirth(args);
      if ('problem' in resolved) return resolved.problem;
      const { birth } = resolved;
      const moon = await computeMoonSign({
        date: birth.date,
        time: birth.time,
        tzOffsetMinutes: Math.round(birth.tzOffsetHours * 60),
      });
      const caveat = birth.timeKnown
        ? undefined
        : 'No birth time was given, so noon was used. The Moon changes sign about every two and a quarter days, so the sign can be off if the person was born on a day it changed.';
      return textResult(
        {
          moon_sign: moon.sign,
          degree: moon.degree,
          nakshatra: spaced(moon.nakshatra),
          pada: moon.pada,
          nakshatra_lord: moon.nakshatraLord,
          place: placeLabel(birth.place),
          time_known: birth.timeKnown,
          ...(caveat ? { caveat } : {}),
          ...appLink(
            ctx,
            'For a detailed reading, use the Aroha app: it gives the full birth chart and a daily, weekly, monthly and yearly reading.',
          ),
        },
        `Moon sign ${moon.sign}, nakshatra ${spaced(moon.nakshatra)} pada ${moon.pada} (lord ${moon.nakshatraLord}).` +
          (caveat ? ` Note: ${caveat}` : ''),
      );
    },
  );

  registerTool(
    server,
    base,
    {
      name: 'show_birth_chart',
      title: 'Show birth chart',
      description:
        'Use this to display a birth chart as a North Indian diamond chart card. It only draws: first get the chart from generate_birth_chart, then pass its ascendant sign and each planet with its house. ' +
        'Do not call it with made-up placements.',
      input: {
        ascendant_sign: z.enum(SIGNS).describe('Sign of the ascendant (lagna), from the chart'),
        planets: z
          .array(
            z.object({
              planet: z.enum(PLANETS),
              house: z.number().int().min(1).max(12).describe('House from the ascendant'),
              retrograde: z.boolean().optional(),
            }),
          )
          .min(1)
          .max(9)
          .describe('Each planet with its house, from the chart'),
        time_known: z
          .boolean()
          .optional()
          .describe('Pass false when the chart was cast without a birth time'),
      },
      output: {
        ascendant_sign: z.string(),
        planets: z.array(
          z.object({ planet: z.string(), house: z.number(), retrograde: z.boolean() }),
        ),
        caveat: z.string().optional(),
        ...appLinkShape,
      },
      invoking: 'Drawing the chart',
      invoked: 'Chart shown',
      widgetUri: BIRTH_CHART_WIDGET_URI,
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- handlers share one async signature
    async (args, ctx) =>
      textResult(
        {
          ascendant_sign: args.ascendant_sign,
          planets: args.planets.map((p) => ({
            planet: p.planet,
            house: p.house,
            retrograde: p.retrograde ?? false,
          })),
          ...(args.time_known === false ? { caveat: UNKNOWN_TIME_CAVEAT } : {}),
          ...appLink(ctx, CHART_NOTE),
        },
        `Showing the birth chart with ${args.ascendant_sign} ascendant.`,
      ),
  );
}
