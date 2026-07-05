import { describe, it, expect } from 'vitest';
import { classifyTithiForCalendar } from '../src/modules/astro/astro.service';

describe('classifyTithiForCalendar', () => {
  it('flags tithi 15 as full moon', () => {
    expect(classifyTithiForCalendar(15)).toEqual({
      isFullMoon: true,
      isNewMoon: false,
      isEkadashi: false,
    });
  });
  it('flags tithi 30 as new moon', () => {
    expect(classifyTithiForCalendar(30)).toEqual({
      isFullMoon: false,
      isNewMoon: true,
      isEkadashi: false,
    });
  });
  it('flags tithi 11 and 26 as Ekadashi', () => {
    expect(classifyTithiForCalendar(11).isEkadashi).toBe(true);
    expect(classifyTithiForCalendar(26).isEkadashi).toBe(true);
  });
  it('flags an ordinary tithi as none of the above', () => {
    expect(classifyTithiForCalendar(3)).toEqual({
      isFullMoon: false,
      isNewMoon: false,
      isEkadashi: false,
    });
  });
});
