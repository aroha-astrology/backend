import { describe, expect, it } from 'vitest';
import { skyUpdateFrom } from '../src/modules/sky-context/sky-context.routes.js';

const place = { name: 'Dallas', lat: 32.78, lon: -96.8, tz: 'America/Chicago' };

describe('skyUpdateFrom', () => {
  it('a home place also sets the home zone, and the two cannot disagree', () => {
    expect(skyUpdateFrom({ homeLocation: place, homeTimezone: 'Asia/Kolkata' })).toEqual({
      homeLocation: place,
      homeTimezone: 'America/Chicago',
    });
  });

  it('a home zone alone is stored as it is', () => {
    expect(skyUpdateFrom({ homeTimezone: 'Europe/Berlin' })).toEqual({ homeTimezone: 'Europe/Berlin' });
  });

  it('clearing the home place leaves the zone alone', () => {
    expect(skyUpdateFrom({ homeLocation: null })).toEqual({ homeLocation: null });
  });

  it('going back to HOME forgets the keep-home answer; syncing keeps what was said', () => {
    expect(skyUpdateFrom({ skyMode: 'HOME' })).toEqual({ skyMode: 'HOME', skyDismissedTz: null });
    expect(skyUpdateFrom({ skyMode: 'TRAVEL_SYNCED' })).toEqual({ skyMode: 'TRAVEL_SYNCED' });
  });

  it('dismissing records the zone that was dismissed', () => {
    expect(skyUpdateFrom({ skyMode: 'TRAVEL_DISMISSED', skyDismissedTz: 'America/New_York' })).toEqual({
      skyMode: 'TRAVEL_DISMISSED',
      skyDismissedTz: 'America/New_York',
    });
  });

  it('NRI mode is its own flag', () => {
    expect(skyUpdateFrom({ isNri: true })).toEqual({ isNri: true });
  });

  it('an empty body changes nothing', () => {
    expect(skyUpdateFrom({})).toEqual({});
  });
});
