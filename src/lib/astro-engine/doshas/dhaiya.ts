import type { Dhaiya, ZodiacSign } from '@aroha-astrology/shared';
import { ZODIAC_SIGNS } from '@aroha-astrology/shared';
import { istDateString } from '../../astro-tools/transit-events.js';
import { getCurrentSaturnLongitude, breaksSentence } from './sadeSati.js';
import { detectRealDhaiya, type DhaiyaWindow } from './saturnPhaseTimeline.js';

/**
 * Shani Dhaiya (Shani ki Dhaiya, small panoti)
 *
 * Saturn transiting the 4th or the 8th sign from the natal Moon, about two
 * and a half years each:
 * - 4th: Kantaka Shani (Ardhashtama Shani in the south, small panoti)
 * - 8th: Ashtama Shani, the harder of the two
 *
 * Like Sade Sati it is a TRANSIT condition, so it is always read from where
 * Saturn is on the day asked about, never from the birth chart. Dates are
 * Saturn's real sign changes, retrograde breaks included (see
 * detectRealDhaiya), and are written as India's calendar date, as almanacs
 * list them.
 */

const NAMES: Record<'4th' | '8th', string> = {
  '4th': 'Kantaka Shani',
  '8th': 'Ashtama Shani',
};

const AREAS: Record<'4th' | '8th', string> = {
  '4th': 'home, mother, property and peace of mind',
  '8th': 'health, sudden obstacles and long-held plans',
};

function houseOf(phase: DhaiyaWindow['phase']): '4th' | '8th' {
  return phase === 'dhaiya-4th' ? '4th' : '8th';
}

function signFromMoon(moonSignIndex: number, house: '4th' | '8th'): ZodiacSign {
  return ZODIAC_SIGNS[(moonSignIndex + (house === '4th' ? 3 : 7)) % 12]!;
}

/** Dhaiya as of `asOf` (now by default) for a natal Moon sign. */
export async function detectCurrentDhaiya(moonSign: ZodiacSign, asOf?: Date): Promise<Dhaiya> {
  const moonSignIndex = ZODIAC_SIGNS.indexOf(moonSign);
  const saturnSign = ZODIAC_SIGNS[Math.floor((await getCurrentSaturnLongitude(asOf)) / 30) % 12]!;

  // Same day-start scan as detectCurrentSadeSati, so both share one ephemeris
  // pass. 24 years ahead reaches the whole next Dhaiya for every Moon sign
  // (after the 8th, Saturn needs seven signs, about 17.5 years, to reach the
  // 4th, which then lasts up to about 3).
  const at = asOf ?? new Date();
  const day = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const real = await detectRealDhaiya(moonSignIndex, day, 9, 24);

  // Saturn's live sign decides "active", as for Sade Sati; the scan from the
  // start of the day only supplies the dates. On an ingress day the two can
  // differ for a few hours, so the window is matched to the live sign.
  const liveHouse = ((ZODIAC_SIGNS.indexOf(saturnSign) - moonSignIndex + 12) % 12) + 1;
  const live = liveHouse === 4 ? '4th' : liveHouse === 8 ? '8th' : null;
  let window = real.window;
  if (live && (!window || houseOf(window.phase) !== live) && real.next && houseOf(real.next.phase) === live) {
    window = real.next; // entered later today
  }
  const active = window !== null && live === houseOf(window.phase);
  if (window && !active && !real.resumesOn) window = null; // left earlier today
  const house = window ? houseOf(window.phase) : null;

  const base = {
    saturnSign,
    moonSign,
    startDate: window?.startDate ?? null,
    endDate: window?.endDate ?? null,
    stays: window?.stays ?? [],
    resumesOn: active ? null : real.resumesOn,
  };

  if (window && house && active) {
    return {
      ...base,
      active: true,
      phase: house,
      name: NAMES[house],
      severity: house === '8th' ? 'moderate' : 'mild',
      next: null,
      description:
        `Saturn is transiting ${saturnSign}, the ${house} sign from your Moon in ${moonSign}: ` +
        `Shani's Dhaiya (${NAMES[house]}), traditionally a time of pressure around ${AREAS[house]}. ` +
        `It runs from ${istDateString(window.startDate)} to ${istDateString(window.endDate)}.` +
        breaksSentence(window.stays, 'the Dhaiya'),
    };
  }

  if (window && house && real.resumesOn) {
    return {
      ...base,
      active: false,
      phase: 'none',
      name: '',
      severity: 'none',
      next: null,
      description:
        `Shani's Dhaiya (${NAMES[house]}) is on a break: Saturn has moved into ${saturnSign} for now ` +
        `and returns to ${signFromMoon(moonSignIndex, house)}, the ${house} sign from your Moon in ${moonSign}, ` +
        `on ${istDateString(real.resumesOn)}. The whole Dhaiya runs from ${istDateString(window.startDate)} ` +
        `to ${istDateString(window.endDate)}.`,
    };
  }

  const upcoming = real.next && real.next !== window ? real.next : null;
  const next = upcoming
    ? { phase: houseOf(upcoming.phase), startDate: upcoming.startDate, endDate: upcoming.endDate }
    : null;
  return {
    ...base,
    active: false,
    phase: 'none',
    name: '',
    severity: 'none',
    resumesOn: null,
    next,
    description: '',
  };
}
