import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  calculateBhagyank,
  calculateFullNumerology,
  calculateMulank,
} from '../../../lib/astro-engine/index.js';
import type {
  MoonSignPrediction,
  PeriodicMoonSignPrediction,
} from '../../../lib/astro-tools/daily-synthesis.js';
import { moonSignForecast } from '../../astro/astro.service.js';
import { birthDateField } from '../birth.js';
import { textResult, type ToolContext } from '../mcp.context.js';
import { appLink, appLinkShape, registerTool } from '../mcp.tools.js';
import { SIGNS } from './chart-tools.js';

const AREAS = ['overall', 'health', 'career', 'marriage', 'finance', 'education'] as const;

export function registerReadingTools(server: McpServer, base: ToolContext): void {
  registerTool(
    server,
    base,
    {
      name: 'get_moon_sign_horoscope',
      title: 'Get moon sign horoscope',
      description:
        'Use this when the user asks for a horoscope (rashifal) for today, this week, this month or this year and their Vedic moon sign (rashi) is known. ' +
        "Returns the reading for that moon sign from the current planetary transits. It is a general reading for everyone with that sign, not a personal one. " +
        'Vedic readings go by moon sign, not the Western sun sign; if only the sun sign is known, use find_moon_sign first.',
      input: {
        moon_sign: z.enum(SIGNS).describe('The Vedic moon sign (rashi)'),
        period: z
          .enum(['daily', 'weekly', 'monthly', 'yearly'])
          .optional()
          .describe('Defaults to daily'),
      },
      output: {
        moon_sign: z.string(),
        period: z.string(),
        from: z.string().describe('First day the reading covers, YYYY-MM-DD'),
        to: z.string().describe('Last day the reading covers, YYYY-MM-DD'),
        quality: z.string(),
        score: z.number().describe('1 (hard) to 5 (very good)'),
        headline: z.string(),
        description: z.string(),
        advice: z.string(),
        lucky_colour: z.string(),
        lucky_number: z.number(),
        areas: z.array(
          z.object({
            area: z.string(),
            score: z.number(),
            headline: z.string(),
            description: z.string(),
            advice: z.string(),
          }),
        ),
        transits: z.array(
          z.object({
            planet: z.string(),
            sign: z.string(),
            house: z.number().describe('House counted from the moon sign'),
            theme: z.string(),
          }),
        ),
        ...appLinkShape,
      },
      invoking: 'Reading the transits',
      invoked: 'Horoscope ready',
    },
    async (args, ctx) => {
      const period = args.period ?? 'daily';
      const forecast: MoonSignPrediction | PeriodicMoonSignPrediction = await moonSignForecast(
        SIGNS.indexOf(args.moon_sign),
        period,
        'en',
      );
      const range =
        forecast.period === 'daily'
          ? { from: forecast.date, to: forecast.date }
          : { from: forecast.periodStart.slice(0, 10), to: forecast.periodEnd.slice(0, 10) };

      const structured = {
        moon_sign: args.moon_sign,
        period,
        ...range,
        quality: forecast.quality,
        score: forecast.score,
        headline: forecast.hook,
        description: forecast.description,
        advice: forecast.advice,
        lucky_colour: forecast.luckyColor,
        lucky_number: forecast.luckyNumber,
        areas: AREAS.map((area) => ({
          area,
          score: forecast.categories[area].score,
          headline: forecast.categories[area].hook,
          description: forecast.categories[area].description,
          advice: forecast.categories[area].advice,
        })),
        transits: forecast.keyTransits.map((t) => ({
          planet: t.planet,
          sign: t.sign,
          house: t.house,
          theme: t.influence,
        })),
        ...appLink(
          ctx,
          'The Aroha app gives a personal reading from your own birth chart, not only your moon sign.',
        ),
      };
      return textResult(
        structured,
        `${args.moon_sign} ${period} horoscope (${range.from}${range.to !== range.from ? ` to ${range.to}` : ''}): ${forecast.hook} ${forecast.advice}`,
      );
    },
  );

  registerTool(
    server,
    base,
    {
      name: 'get_numerology_numbers',
      title: 'Get numerology numbers',
      description:
        "Use this when the user asks for their numerology numbers. Calculates the life path, Mulank (psychic number), Bhagyank (destiny number) and the name numbers (expression, soul urge, personality) from a full name and a date of birth. Nothing is saved.",
      input: {
        full_name: z
          .string()
          .min(2)
          .max(100)
          .describe('Full name as the person uses it, in Latin letters'),
        birth_date: birthDateField,
      },
      output: {
        life_path: z.number(),
        mulank: z.number().describe('Psychic number, from the day of birth'),
        bhagyank: z.number().describe('Destiny number, from the full date of birth'),
        expression: z.number(),
        soul_urge: z.number(),
        personality: z.number(),
        lucky_numbers: z.array(z.number()),
        meanings: z.object({
          life_path: z.string(),
          expression: z.string(),
          soul_urge: z.string(),
          personality: z.string(),
        }),
        ...appLinkShape,
      },
      invoking: 'Working out the numbers',
      invoked: 'Numbers ready',
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- handlers share one async signature
    async (args, ctx) => {
      const numbers = calculateFullNumerology(args.birth_date, args.full_name);
      const dob = new Date(`${args.birth_date}T00:00:00Z`);
      const structured = {
        life_path: numbers.lifePath,
        mulank: calculateMulank(dob),
        bhagyank: calculateBhagyank(dob),
        expression: numbers.expression,
        soul_urge: numbers.soulUrge,
        personality: numbers.personality,
        lucky_numbers: numbers.luckyNumbers,
        meanings: {
          life_path: numbers.analysis.lifePath ?? '',
          expression: numbers.analysis.expression ?? '',
          soul_urge: numbers.analysis.soulUrge ?? '',
          personality: numbers.analysis.personality ?? '',
        },
        ...appLink(
          ctx,
          'The Aroha app has the full numerology report, including name and phone number checks.',
        ),
      };
      return textResult(
        structured,
        `Life path ${structured.life_path}, Mulank ${structured.mulank}, Bhagyank ${structured.bhagyank}, expression ${structured.expression}, soul urge ${structured.soul_urge}, personality ${structured.personality}.`,
      );
    },
  );
}
