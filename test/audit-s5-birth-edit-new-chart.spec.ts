import { describe, expect, it } from 'vitest';
import { birthInputsForProfile } from '../src/modules/kundli/kundli.service.js';
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { makeProfileContext, makeUserRow } from './helpers/mocks.js';

// Audit Sprint 5, M16, the chain a birth-time edit relies on (real engine, no mocks, no database):
// the edited time gives a different birthHash (so the chart is claimed and rebuilt), and the chart
// built from the edited inputs differs from the old one (so the horoscope, chat and reports that
// read it afterwards use the new time).

const MUMBAI = { name: 'Mumbai', lat: 19.076, lon: 72.8777, tz: 'Asia/Kolkata' };
const user = makeUserRow({ id: 'u1' });

function inputsAt(timeOfBirth: string) {
  const profile = makeProfileContext({
    dateOfBirth: '1990-05-20',
    timeOfBirth,
    placeOfBirth: MUMBAI,
    birthTimeAccuracy: 'exact',
  });
  const inputs = birthInputsForProfile(profile, user);
  if (!inputs) throw new Error('inputs should be complete');
  return inputs;
}

async function chartFor(i: ReturnType<typeof inputsAt>) {
  return calculateChart(
    i.year,
    i.month,
    i.day,
    i.hour,
    i.minute,
    i.tzOffset,
    i.lat,
    i.lng,
    i.ayanamsa,
    i.houseSystem,
    i.lunarNode,
  );
}

describe('M16: a birth-time edit leads to a different chart', () => {
  it('the hash changes, and so does the Ascendant of the chart built from the new time', async () => {
    const morning = inputsAt('06:30:00'); // the typo: AM
    const evening = inputsAt('18:30:00'); // the correction: PM
    expect(evening.birthHash).not.toBe(morning.birthHash);

    const [before, after] = await Promise.all([chartFor(morning), chartFor(evening)]);
    expect(after.ascendant.signIndex).not.toBe(before.ascendant.signIndex);
    // The Moon moves about 6.5 degrees in 12 hours: the chart is really recomputed, not copied.
    const moonOf = (c: typeof before) => c.planets.find((p) => p.planet === 'Moon')!.longitude;
    expect(moonOf(after)).not.toBeCloseTo(moonOf(before), 1);
  });

  it('saving the same time again keeps the hash, so nothing is rebuilt', () => {
    expect(inputsAt('06:30:00').birthHash).toBe(inputsAt('06:30:00').birthHash);
  });
});
