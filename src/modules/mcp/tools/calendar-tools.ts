import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { PanchangData } from '@aroha-astrology/shared';
import { MUHURTA_SPECS, type MuhurtaCategory } from '../../../lib/astro-tools/muhurta-rules.js';
import type { WhyFactor } from '../../../lib/intelligence/types.js';
import { getPanchang } from '../../astro/astro.service.js';
import { buildResult, daySkies, MAX_RANGE_DAYS, MIN_RANGE_DAYS } from '../../decisions/decisions.service.js';
import { tzOffsetHours } from '../../kundli/kundli.service.js';
import { dateField, placeLabel, resolvePlaceOrProblem, todayIn } from '../birth.js';
import { spaced, tithiName } from '../format.js';
import { textResult, type ToolContext } from '../mcp.context.js';
import { appLink, appLinkShape, registerTool } from '../mcp.tools.js';
import { resolvePlace, type ResolvedPlace } from '../place-resolver.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MS_PER_DAY = 86_400_000;

const DEFAULT_PLACE: ResolvedPlace = {
  name: 'New Delhi',
  region: 'Delhi',
  country: 'India',
  lat: 28.6139,
  lon: 77.209,
  timezone: 'Asia/Kolkata',
};

const placeField = z
  .string()
  .min(2)
  .max(120)
  .optional()
  .describe(
    'City to calculate for, with state or country when known, e.g. "Varanasi, India". Only pass a place the user named. Leave it out to use their approximate location.',
  );

type LocationSource = 'named_place' | 'approximate_location' | 'default_new_delhi';

/** The place a calendar answer is for: the one named, else ChatGPT's coarse location hint, else New Delhi. */
function locate(
  ctx: ToolContext,
  named: string | undefined,
): { place: ResolvedPlace; source: LocationSource } | { problem: CallToolResult } {
  if (named) {
    const found = resolvePlaceOrProblem(named, 'place');
    return 'problem' in found ? found : { place: found.place, source: 'named_place' };
  }
  const hint = ctx.meta.location;
  if (hint?.city) {
    const found = resolvePlace([hint.city, hint.region, hint.country].filter(Boolean).join(', '));
    if (found.status === 'resolved') return { place: found.place, source: 'approximate_location' };
  }
  return { place: DEFAULT_PLACE, source: 'default_new_delhi' };
}

const SOURCE_NOTE: Record<LocationSource, string> = {
  named_place: '',
  approximate_location: " This is for the user's approximate location; tell them which city was used.",
  default_new_delhi:
    ' No place was given, so New Delhi was used; tell the user and offer to redo it for their city.',
};

const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]!;
const localNoon = (date: string) => new Date(`${date}T12:00:00Z`);
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);

const span = z.object({ start: z.string(), end: z.string() });

/** English for the engine's reason codes (the app renders the same codes through its own translations). */
function reasonText(why: WhyFactor): string | null {
  const p = why.params ?? {};
  switch (why.textKey) {
    case 'decide.why.eclipseLunar':
      return 'Lunar eclipse';
    case 'decide.why.eclipseSolar':
      return 'Solar eclipse';
    case 'decide.why.mercuryRetro':
      return 'Mercury is retrograde';
    case 'decide.why.kharmas':
      return 'Kharmas, the month traditionally avoided for new beginnings';
    case 'decide.why.combust':
      return `${p.planet} is combust (too close to the Sun)`;
    case 'decide.why.nakshatraGood':
      return `${spaced(String(p.nakshatra))} nakshatra suits this occasion`;
    case 'decide.why.nakshatraBad':
      return `${spaced(String(p.nakshatra))} nakshatra is avoided for this occasion`;
    case 'decide.why.amavasya':
      return 'Amavasya (new moon)';
    case 'decide.why.tithiGood':
      return `${tithiName(Number(p.tithi))} tithi is favourable`;
    case 'decide.why.tithiBad':
      return `${tithiName(Number(p.tithi))} tithi is avoided for new starts`;
    case 'decide.why.weekdayGood':
      return `${WEEKDAYS[Number(p.weekday)] ?? 'The weekday'} is favourable for this occasion`;
    case 'decide.why.weekdayBad':
      return `${WEEKDAYS[Number(p.weekday)] ?? 'The weekday'} is not favoured for this occasion`;
    case 'decide.why.chandrashtama':
      return 'The Moon is in the 8th from your moon sign (Chandrashtama)';
    case 'decide.why.chandra':
      return `The Moon is in house ${p.house} from your moon sign`;
    case 'why.tara':
      return `Tara bala: ${p.tara}`;
    default:
      return null;
  }
}

const reasons = (why: WhyFactor[]) =>
  why.map(reasonText).filter((text): text is string => text !== null);

/** Occasion names the model picks from, mapped to the engine's categories. */
const OCCASIONS = {
  housewarming_or_property: 'house',
  vehicle_purchase: 'vehicle',
  marriage: 'marriage',
  business_launch: 'businessLaunch',
  signing_an_agreement: 'agreement',
  travel: 'travel',
  product_launch: 'productLaunch',
  puja: 'puja',
} as const satisfies Record<string, MuhurtaCategory>;
type Occasion = keyof typeof OCCASIONS;
const OCCASION_NAMES = Object.keys(OCCASIONS) as [Occasion, ...Occasion[]];

export function registerCalendarTools(server: McpServer, base: ToolContext): void {
  registerTool(
    server,
    base,
    {
      name: 'get_panchang',
      title: 'Get panchang',
      description:
        "Use this when the user asks for the Hindu calendar details of a day: tithi, nakshatra, yoga, karana, sunrise and sunset, Rahu Kaal, Abhijit Muhurta or choghadiya. " +
        'Calculates the panchang for one date at one place. Times are local to that place. Defaults to today.',
      input: {
        date: dateField('Date to calculate for').optional(),
        place: placeField,
      },
      output: {
        date: z.string(),
        weekday: z.string(),
        place: z.string(),
        location_source: z.enum(['named_place', 'approximate_location', 'default_new_delhi']),
        tithi: z.object({
          name: z.string(),
          paksha: z.string(),
          ends_at: z.string().optional(),
        }),
        nakshatra: z.object({
          name: z.string(),
          lord: z.string(),
          ends_at: z.string().optional(),
        }),
        yoga: z.object({ name: z.string(), auspicious: z.boolean() }),
        karana: z.string(),
        sunrise: z.string(),
        sunset: z.string(),
        moonrise: z.string().optional(),
        moonset: z.string().optional(),
        rahu_kaal: span,
        gulika_kaal: span,
        yamaganda_kaal: span,
        abhijit_muhurta: span,
        choghadiya_day: z.array(
          z.object({ name: z.string(), quality: z.string(), start: z.string(), end: z.string() }),
        ),
        ...appLinkShape,
      },
      invoking: 'Calculating the panchang',
      invoked: 'Panchang ready',
    },
    async (args, ctx) => {
      const located = locate(ctx, args.place);
      if ('problem' in located) return located.problem;
      const { place, source } = located;
      const date = args.date ?? todayIn(place.timezone);

      const panchang = (await getPanchang(place.lat, place.lon, date, {
        timezoneOffsetHours: tzOffsetHours(place.timezone, localNoon(date)),
      })) as PanchangData & { date: string };

      const structured = {
        date,
        weekday: weekdayOf(date),
        place: placeLabel(place),
        location_source: source,
        tithi: {
          name: panchang.tithi.name,
          paksha: panchang.tithi.paksha,
          ...(panchang.tithi.endsAt ? { ends_at: panchang.tithi.endsAt } : {}),
        },
        nakshatra: {
          name: spaced(panchang.nakshatra.name),
          lord: panchang.nakshatra.lord,
          ...(panchang.nakshatra.endsAt ? { ends_at: panchang.nakshatra.endsAt } : {}),
        },
        yoga: { name: panchang.yoga.name, auspicious: panchang.yoga.isAuspicious },
        karana: panchang.karana.name,
        sunrise: panchang.sunriseTime,
        sunset: panchang.sunsetTime,
        ...(panchang.moonriseTime ? { moonrise: panchang.moonriseTime } : {}),
        ...(panchang.moonsetTime ? { moonset: panchang.moonsetTime } : {}),
        rahu_kaal: panchang.rahuKaal,
        gulika_kaal: panchang.gulikaKaal,
        yamaganda_kaal: panchang.yamagandaKaal,
        abhijit_muhurta: panchang.abhijitMuhurta,
        choghadiya_day: (panchang.choghadiya?.day ?? []).map((c) => ({
          name: c.name,
          quality: c.type,
          start: c.startTime,
          end: c.endTime,
        })),
        ...appLink(
          ctx,
          'The Aroha app has the daily panchang with the month view, festivals, hora and night choghadiya.',
        ),
      };
      return textResult(
        structured,
        `Panchang for ${weekdayOf(date)} ${date} at ${placeLabel(place)}: ${panchang.tithi.paksha} ${panchang.tithi.name}, ${panchang.nakshatra.name} nakshatra, ${panchang.yoga.name} yoga. ` +
          `Sunrise ${panchang.sunriseTime}, sunset ${panchang.sunsetTime}, Rahu Kaal ${panchang.rahuKaal.start}-${panchang.rahuKaal.end}.` +
          SOURCE_NOTE[source],
      );
    },
  );

  registerTool(
    server,
    base,
    {
      name: 'find_auspicious_dates',
      title: 'Find auspicious dates',
      description:
        'Use this when the user wants good dates (a muhurta) for an occasion such as a housewarming, wedding, vehicle purchase, business or product launch, signing an agreement, travel or a puja. ' +
        'Scores every day in a date range at one place from the panchang and returns the best dates with the best time of day, and the dates to avoid. ' +
        "These are general dates for the place, from the day's panchang; they do not use anyone's birth chart.",
      input: {
        occasion: z.enum(OCCASION_NAMES).describe('What the date is for'),
        place: placeField,
        from: dateField('First day of the range').optional().describe('First day of the range, YYYY-MM-DD. Defaults to today.'),
        days: z
          .number()
          .int()
          .min(MIN_RANGE_DAYS)
          .max(MAX_RANGE_DAYS)
          .optional()
          .describe(`How many days to look at, ${MIN_RANGE_DAYS}-${MAX_RANGE_DAYS}. Defaults to 30.`),
      },
      output: {
        occasion: z.string(),
        place: z.string(),
        location_source: z.enum(['named_place', 'approximate_location', 'default_new_delhi']),
        from: z.string(),
        to: z.string(),
        best_dates: z.array(
          z.object({
            date: z.string(),
            weekday: z.string(),
            score: z.number(),
            reasons: z.array(z.string()),
            best_time: z
              .object({ start: z.string(), end: z.string(), name: z.string() })
              .optional(),
            rahu_kaal: span.optional(),
          }),
        ),
        dates_to_avoid: z.array(
          z.object({ date: z.string(), weekday: z.string(), reasons: z.array(z.string()) }),
        ),
        ...appLinkShape,
      },
      invoking: 'Looking for good dates',
      invoked: 'Dates ready',
    },
    async (args, ctx) => {
      const located = locate(ctx, args.place);
      if ('problem' in located) return located.problem;
      const { place, source } = located;
      const from = args.from ?? todayIn(place.timezone);
      const days = args.days ?? 30;
      const tzHours = tzOffsetHours(place.timezone, localNoon(from));

      // General dates only: the day's panchang at the place, with no birth chart.
      // (Matching dates to a person's own chart is Find My Date in the app.)
      const skies = await daySkies(from, days, tzHours, null);
      const result = buildResult({
        mode: 'muhurta',
        spec: MUHURTA_SPECS[OCCASIONS[args.occasion]],
        skies,
        place,
        tzHours,
        approximateBirthTime: false,
      });

      const structured = {
        occasion: args.occasion,
        place: placeLabel(place),
        location_source: source,
        from,
        to: addDays(from, days - 1),
        best_dates: result.best.map((d) => ({
          date: d.date,
          weekday: weekdayOf(d.date),
          score: d.score,
          reasons: reasons(d.why),
          ...(d.time ? { best_time: d.time } : {}),
          ...(d.rahuKaal ? { rahu_kaal: d.rahuKaal } : {}),
        })),
        dates_to_avoid: result.caution.map((d) => ({
          date: d.date,
          weekday: weekdayOf(d.date),
          reasons: reasons(d.why),
        })),
        ...appLink(
          ctx,
          'The Aroha app has Find My Date with a day-by-day calendar for the whole range.',
        ),
      };
      const top = structured.best_dates
        .slice(0, 3)
        .map((d) => `${d.weekday} ${d.date}`)
        .join(', ');
      return textResult(
        structured,
        `Best dates for ${args.occasion.replace(/_/g, ' ')} at ${placeLabel(place)} between ${from} and ${structured.to}: ${top || 'none stood out'}.` +
          SOURCE_NOTE[source],
      );
    },
  );
}
