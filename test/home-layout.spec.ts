import { describe, expect, it } from 'vitest';
import {
  HomeLayoutDocSchema,
  type HomeLayoutDoc,
  type StoredHomeLayout,
} from '../src/modules/home-layout/home-layout.schemas.js';
import { pickLayoutForUser, publishStored, undoStored } from '../src/modules/home-layout/home-layout.service.js';

const look = (order: string[], hero: string | null = null) => ({
  order,
  heroBySlot: { morning: hero, midday: null, evening: null, night: null },
});

const doc = (vedicOrder: string[], hero: string | null = null): HomeLayoutDoc => ({
  vedic: look(vedicOrder, hero),
  cosmic: look(['stories', 'panchang']),
  slots: { morning: '05:00', midday: '11:30', evening: '18:00', night: '20:30' },
});

describe('HomeLayoutDocSchema', () => {
  it('accepts a well-formed layout', () => {
    expect(HomeLayoutDocSchema.safeParse(doc(['stories', 'ritual', 'panchang'], 'ritual')).success).toBe(true);
  });

  it('rejects a card listed twice', () => {
    expect(HomeLayoutDocSchema.safeParse(doc(['stories', 'stories'])).success).toBe(false);
  });

  it('rejects a hero that is not in the order', () => {
    expect(HomeLayoutDocSchema.safeParse(doc(['stories'], 'ritual')).success).toBe(false);
  });

  it('rejects a card id with odd characters', () => {
    expect(HomeLayoutDocSchema.safeParse(doc(['Stories!'])).success).toBe(false);
  });

  it('rejects slot times that are not in order, or not HH:MM', () => {
    const bad = doc(['stories']);
    expect(HomeLayoutDocSchema.safeParse({ ...bad, slots: { ...bad.slots, midday: '04:00' } }).success).toBe(false);
    expect(HomeLayoutDocSchema.safeParse({ ...bad, slots: { ...bad.slots, night: '8pm' } }).success).toBe(false);
  });
});

describe('pickLayoutForUser', () => {
  const draft = doc(['a', 'b']);
  const published = doc(['b', 'a']);
  const stored: StoredHomeLayout = { draft, published, previous: null };

  it('keeps the built-in order while the switch is off for the user', () => {
    expect(pickLayoutForUser(stored, false, false)).toEqual({ layout: null, source: null });
  });

  it('on for everyone: everyone gets the published layout, never the draft', () => {
    expect(pickLayoutForUser(stored, true, true)).toEqual({ layout: published, source: 'published' });
  });

  it('on only for a test group: the group sees the draft', () => {
    expect(pickLayoutForUser(stored, true, false)).toEqual({ layout: draft, source: 'draft' });
  });

  it('a test group with no draft sees the published layout; with neither, the built-in order', () => {
    expect(pickLayoutForUser({ ...stored, draft: null }, true, false).source).toBe('published');
    expect(pickLayoutForUser({ draft: null, published: null, previous: null }, true, false)).toEqual({
      layout: null,
      source: null,
    });
  });
});

describe('publish and undo', () => {
  const first = doc(['a']);
  const second = doc(['b']);

  it('publishing moves the draft to published and keeps the old one for undo', () => {
    const next = publishStored({ draft: second, published: first, previous: null });
    expect(next).toEqual({ draft: second, published: second, previous: first });
  });

  it('publishing with no draft is refused', () => {
    expect(publishStored({ draft: null, published: first, previous: null })).toBeNull();
  });

  it('undo brings the previous layout back, once', () => {
    const undone = undoStored({ draft: second, published: second, previous: first });
    expect(undone).toEqual({ draft: second, published: first, previous: null });
    expect(undoStored(undone!)).toBeNull();
  });
});
