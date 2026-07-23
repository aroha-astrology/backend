import { describe, expect, it } from 'vitest';
import { getPoojaRecommendations } from '../src/lib/astro-engine/poojaRecommendations.js';

describe('getPoojaRecommendations', () => {
  it('returns the 2 general poojas when doshas is null', () => {
    const recs = getPoojaRecommendations(null);
    expect(recs.map((r) => r.name)).toEqual(['Satyanarayan Pooja', 'Navgraha Shanti Pooja']);
  });

  it('returns the 2 general poojas when no dosha is present/active', () => {
    const recs = getPoojaRecommendations({
      mangal: { present: false },
      sadeSati: { active: false },
    });
    expect(recs.map((r) => r.name)).toEqual(['Satyanarayan Pooja', 'Navgraha Shanti Pooja']);
  });

  it('recommends Mangal Shanti Pooja when Mangal Dosha is present', () => {
    const recs = getPoojaRecommendations({ mangal: { present: true } });
    expect(recs.map((r) => r.name)).toContain('Mangal Shanti Pooja');
    expect(recs.map((r) => r.name)).not.toContain('Satyanarayan Pooja');
  });

  it('recommends Shani Shanti Pooja when Sade Sati is active', () => {
    const recs = getPoojaRecommendations({ sadeSati: { active: true } });
    expect(recs.map((r) => r.name)).toContain('Shani Shanti Pooja');
  });

  it('stacks multiple recommendations when multiple doshas are present', () => {
    const recs = getPoojaRecommendations({
      mangal: { present: true },
      kaalSarp: { present: true },
      pitra: { present: true },
    });
    const names = recs.map((r) => r.name);
    expect(names).toContain('Mangal Shanti Pooja');
    expect(names).toContain('Kaal Sarp Dosha Nivaran Pooja');
    expect(names).toContain('Pitra Dosha Nivaran Pooja (Shraadh)');
    expect(names).toHaveLength(3);
  });
});
