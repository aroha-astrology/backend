import { describe, expect, it } from 'vitest';
import {
  computeSphuta,
  computePutraTithi,
} from '../src/lib/astro-engine/reports/progeny-sphuta.js';

function chartWith(planets: Record<string, number>): Record<string, unknown> {
  return {
    planets: Object.entries(planets).map(([planet, longitude]) => ({ planet, longitude })),
  };
}

describe('computeSphuta', () => {
  it('returns null when a required planet longitude is missing', () => {
    const chart = chartWith({ Sun: 0, Venus: 0 }); // Jupiter missing
    expect(computeSphuta(chart, 'beeja')).toBeNull();
  });

  it('Beeja Sphuta: Sun+Venus+Jupiter=0 lands in Aries (odd) rasi AND odd navamsa -> strong', () => {
    const chart = chartWith({ Sun: 0, Venus: 0, Jupiter: 0 });
    const fact = computeSphuta(chart, 'beeja');
    expect(fact).not.toBeNull();
    expect(fact!.longitude).toBe(0);
    expect(fact!.rasi).toBe('Aries');
    expect(fact!.rasiPolarityOk).toBe(true);
    expect(fact!.navamsaPolarityOk).toBe(true);
    expect(fact!.strength).toBe('strong');
    expect(fact!.provenance).toBe('TEXTUAL');
  });

  it('Kshetra Sphuta: Moon+Mars+Jupiter=30 lands in Taurus (even) rasi AND even navamsa -> strong', () => {
    const chart = chartWith({ Moon: 10, Mars: 10, Jupiter: 10 });
    const fact = computeSphuta(chart, 'kshetra');
    expect(fact).not.toBeNull();
    expect(fact!.longitude).toBe(30);
    expect(fact!.rasi).toBe('Taurus');
    expect(fact!.navamsa).toBe('Capricorn');
    expect(fact!.rasiPolarityOk).toBe(true);
    expect(fact!.navamsaPolarityOk).toBe(true);
    expect(fact!.strength).toBe('strong');
  });

  it('wraps correctly past 360 degrees and can land fully wrong-polarity (weak)', () => {
    // Sun=Venus=Jupiter=350 -> sum=1050 -> mod 360 = 330 (Pisces, even) for Beeja (wants odd).
    const chart = chartWith({ Sun: 350, Venus: 350, Jupiter: 350 });
    const fact = computeSphuta(chart, 'beeja');
    expect(fact).not.toBeNull();
    expect(fact!.longitude).toBe(330);
    expect(fact!.rasi).toBe('Pisces');
    expect(fact!.rasiPolarityOk).toBe(false);
    expect(fact!.navamsaPolarityOk).toBe(false);
    expect(fact!.strength).toBe('weak');
  });

  it('one-polarity match yields moderate strength', () => {
    // Sun+Venus+Jupiter=30 (Taurus, even) for Beeja (wants odd rasi) -> rasi mismatches.
    // Navamsa of 30 is Capricorn (even, index 9) -> also mismatches wantOdd... so instead pick a
    // longitude whose rasi is odd but navamsa is even to force exactly one match.
    // Longitude 40 -> Taurus (even) rasi; skip. Use 5 degrees into Aries's 5th navamsa part
    // instead: longitude 20 -> Aries (odd) rasi, navamsa: signIndex=0, part=floor(20/3.333)=6 ->
    // startSigns[Fire=0]=0 + 6 = index 6 (Libra, odd) -> both would match, not what we want.
    // Longitude 25 -> Aries rasi (odd), part=floor(25/3.333)=7 -> index 7 (Scorpio, even) ->
    // rasi odd (matches wantOdd=true), navamsa even (mismatches) -> exactly one match -> moderate.
    const chart = chartWith({ Sun: 25, Venus: 0, Jupiter: 0 }); // sums to exactly 25
    const fact = computeSphuta(chart, 'beeja');
    expect(fact).not.toBeNull();
    expect(fact!.rasi).toBe('Aries');
    expect(fact!.navamsa).toBe('Scorpio');
    expect(fact!.rasiPolarityOk).toBe(true);
    expect(fact!.navamsaPolarityOk).toBe(false);
    expect(fact!.strength).toBe('moderate');
  });
});

describe('computePutraTithi', () => {
  it('returns null when Sun or Moon longitude is missing', () => {
    expect(computePutraTithi(chartWith({ Sun: 0 }))).toBeNull();
  });

  it('flags a Chidra tithi (e.g. tithi 4) as an obstruction indication', () => {
    // 5*(Moon-Sun) = 40 -> arc 40 -> index floor(40/12)+1 = 4 (Chidra).
    const chart = chartWith({ Sun: 0, Moon: 8 });
    const fact = computePutraTithi(chart);
    expect(fact).not.toBeNull();
    expect(fact!.index).toBe(4);
    expect(fact!.paksha).toBe('shukla');
    expect(fact!.numberInPaksha).toBe(4);
    expect(fact!.isChidra).toBe(true);
    expect(fact!.isAmavasya).toBe(false);
  });

  it('flags Amavasya (tithi 30) as isAmavasya and as a Chidra-equivalent obstruction', () => {
    // 5*(Moon-Sun) = 350 -> arc 350 -> index floor(350/12)+1 = 30 (Amavasya).
    const chart = chartWith({ Sun: 0, Moon: 70 });
    const fact = computePutraTithi(chart);
    expect(fact).not.toBeNull();
    expect(fact!.index).toBe(30);
    expect(fact!.paksha).toBe('krishna');
    expect(fact!.isAmavasya).toBe(true);
    expect(fact!.isChidra).toBe(true);
  });

  it('a non-Chidra tithi in the bright fortnight is not flagged', () => {
    // 5*(Moon-Sun) = 12 -> arc 12 -> index floor(12/12)+1 = 2 (not Chidra).
    const chart = chartWith({ Sun: 0, Moon: 2.4 });
    const fact = computePutraTithi(chart);
    expect(fact).not.toBeNull();
    expect(fact!.index).toBe(2);
    expect(fact!.isChidra).toBe(false);
    expect(fact!.isAmavasya).toBe(false);
  });
});
