import { beforeAll, describe, expect, it, vi } from 'vitest';

// The endpoint is exercised end to end through the real Hono app and the real
// ephemeris engine. Only what would need live infrastructure is stubbed: the
// Redis counter behind per-person pacing, and the panchang cache table.
const counters = new Map<string, number>();
vi.mock('../src/config/redis.js', () => ({
  getRedis: () => ({
    eval: (_script: string, _numKeys: number, key: string, windowMs: number) => {
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      return Promise.resolve([count, Number(windowMs)] as [number, number]);
    },
  }),
  closeRedis: () => Promise.resolve(),
}));
vi.mock('../src/modules/astro/panchang-cache.repo.js', () => ({
  findCachedPanchang: () => Promise.resolve(null),
  upsertCachedPanchang: () => Promise.resolve(),
}));

const { mcpRouter } = await import('../src/modules/mcp/mcp.routes.js');
const { PLAY_STORE_URL, WEB_APP_URL } = await import('../src/modules/mcp/mcp.context.js');

type Json = Record<string, any>;

interface ToolListing {
  name: string;
  title: string;
  description: string;
  annotations: Json;
  inputSchema: { type: string };
  outputSchema: { type: string };
  securitySchemes: unknown[];
  _meta: Record<string, string> & { ui?: { resourceUri?: string } };
}

let nextId = 1;
async function rpc(method: string, params: Json = {}): Promise<Json> {
  const res = await mcpRouter.request('/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as Json;
}

async function call(name: string, args: Json, meta?: Json): Promise<Json> {
  const body = await rpc('tools/call', { name, arguments: args, ...(meta ? { _meta: meta } : {}) });
  expect(body.error).toBeUndefined();
  return body.result as Json;
}

const PUNE_BIRTH = { birth_date: '1990-04-17', birth_time: '14:30', birth_place: 'Pune, India' };

describe('ChatGPT plugin endpoint: protocol', () => {
  it('answers initialize with the server name and instructions', async () => {
    const body = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    });
    expect(body.result.serverInfo.name).toBe('aroha-astrology');
    expect(body.result.instructions).toContain('Vedic');
    expect(body.result.instructions.slice(0, 512)).toContain('never guess');
  });

  it('refuses GET, which would open a stream this stateless endpoint does not have', async () => {
    const res = await mcpRouter.request('/mcp', { method: 'GET' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('serves the chart card as an MCP Apps resource with a closed content policy', async () => {
    const body = await rpc('resources/read', { uri: 'ui://aroha/birth-chart-v1.html' });
    const [content] = body.result.contents;
    expect(content.mimeType).toBe('text/html;profile=mcp-app');
    expect(content.text).toContain('<');
    expect(content._meta.ui.csp).toEqual({ connectDomains: [], resourceDomains: [] });
    expect(content._meta['openai/widgetCSP'].redirect_domains).toEqual([
      'https://play.google.com',
      'https://app.arohaastrology.in',
    ]);
  });
});

describe('ChatGPT plugin endpoint: tool listing', () => {
  let tools: ToolListing[];
  beforeAll(async () => {
    tools = (await rpc('tools/list')).result.tools as ToolListing[];
  });

  it('lists the tools', () => {
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'check_kundli_match',
        'find_auspicious_dates',
        'find_moon_sign',
        'generate_birth_chart',
        'get_moon_sign_horoscope',
        'get_numerology_numbers',
        'get_panchang',
        'show_birth_chart',
      ].sort(),
    );
  });

  it('gives every tool what OpenAI review requires', () => {
    for (const tool of tools) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.description.length, tool.name).toBeGreaterThan(40);
      // All three hints must be explicit booleans.
      expect(tool.annotations, tool.name).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      });
      expect(tool.inputSchema.type, tool.name).toBe('object');
      expect(tool.outputSchema.type, tool.name).toBe('object');
      expect(Array.isArray(tool.securitySchemes), tool.name).toBe(true);
      expect(tool._meta['openai/toolInvocation/invoking']!.length, tool.name).toBeLessThanOrEqual(64);
      expect(tool._meta['openai/toolInvocation/invoked']!.length, tool.name).toBeLessThanOrEqual(64);
    }
  });

  it('needs no sign-in for any tool', () => {
    for (const tool of tools) {
      expect(tool.securitySchemes, tool.name).toEqual([{ type: 'noauth' }]);
    }
  });

  it('links only the drawing tool to the chart card', () => {
    const withUi = tools.filter((t) => Boolean(t._meta.ui?.resourceUri));
    expect(withUi.map((t) => t.name)).toEqual(['show_birth_chart']);
  });

  it('never asks for coordinates, a transcript or the user location', () => {
    const text = JSON.stringify(tools.map((t) => t.inputSchema));
    expect(text).not.toMatch(/latitude|longitude|conversation|history|"lat"|"lon"/i);
  });
});

describe('ChatGPT plugin endpoint: tools (real ephemeris engine)', () => {
  it('generate_birth_chart returns a full chart that matches its declared schema', async () => {
    const result = await call('generate_birth_chart', PUNE_BIRTH);
    expect(result.isError).toBeFalsy();
    const chart = result.structuredContent;
    expect(chart.birth).toMatchObject({
      date: '1990-04-17',
      time: '14:30',
      time_known: true,
      place: 'Pune, Maharashtra, India',
      timezone: 'Asia/Kolkata',
    });
    expect(chart.planets).toHaveLength(9);
    expect(chart.houses).toHaveLength(12);
    expect(chart.ascendant.sign).toBeTruthy();
    expect(chart.dasha.current_mahadasha.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((chart.doshas as { name: string }[]).map((d) => d.name)).toContain('Mangal Dosha');
    expect(chart.caveat).toBeUndefined();
    expect(result.content[0].text).toContain('Ascendant');
    // Nothing internal leaks out.
    expect(JSON.stringify(chart)).not.toMatch(/julianDay|longitude|requestId|userId/);
  }, 30_000);

  it('generate_birth_chart without a birth time uses noon and says what is unreliable', async () => {
    const result = await call('generate_birth_chart', {
      birth_date: '1990-04-17',
      birth_place: 'Pune',
    });
    expect(result.structuredContent.birth).toMatchObject({ time: '12:00', time_known: false });
    expect(result.structuredContent.caveat).toContain('ascendant');
  }, 30_000);

  it('asks for clarification when the birth place is ambiguous', async () => {
    const result = await call('generate_birth_chart', {
      ...PUNE_BIRTH,
      birth_place: 'Springfield, USA',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('more than one place');
    expect(result.content[0].text).toContain('Illinois');
  });

  it('says so when the birth place is unknown', async () => {
    const result = await call('find_moon_sign', { ...PUNE_BIRTH, birth_place: 'Qqqqzzzz' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('was not found');
  });

  it('rejects an impossible date before it reaches the engine', async () => {
    const result = await call('generate_birth_chart', { ...PUNE_BIRTH, birth_date: '2024-02-30' });
    expect(result.isError).toBe(true);
  });

  it('find_moon_sign agrees with the full chart', async () => {
    const moon = (await call('find_moon_sign', PUNE_BIRTH)).structuredContent;
    const chart = (await call('generate_birth_chart', PUNE_BIRTH)).structuredContent;
    expect(moon.moon_sign).toBe(chart.moon_sign);
    expect(moon.nakshatra).toBe(chart.birth_nakshatra);
  }, 30_000);

  it('honours the timezone of a birth outside India', async () => {
    const result = await call('generate_birth_chart', {
      birth_date: '1985-07-04',
      birth_time: '09:15',
      birth_place: 'New York, USA',
    });
    expect(result.structuredContent.birth.timezone).toBe('America/New_York');
    expect(result.structuredContent.planets).toHaveLength(9);
  }, 30_000);

  it('check_kundli_match returns the 36-point table', async () => {
    const result = await call('check_kundli_match', {
      first_person: PUNE_BIRTH,
      second_person: { birth_date: '1992-11-03', birth_time: '06:10', birth_place: 'Jaipur' },
    });
    expect(result.isError).toBeFalsy();
    const match = result.structuredContent;
    expect(match.max_score).toBe(36);
    expect(match.total_score).toBeGreaterThanOrEqual(0);
    expect(match.total_score).toBeLessThanOrEqual(36);
    expect(match.kootas).toHaveLength(8);
    expect(match.places.second_person).toContain('Jaipur');

    // 8.5 of 36 for this pair, with Nadi and Bhakoot at zero.
    expect(match.total_score).toBe(8.5);
    expect(match.score_band).toBe('low (under 14)');
    expect(match.nadi_dosha).toBe(true);
    expect(match.bhakoot_dosha).toBe(true);
    expect(match.notes).toContain('Nadi koota scored 0 of 8, which the tradition calls Nadi Dosha.');
    expect(match.about).toContain('not advice on whether two people should marry');

    // The answer describes the tradition; it does not judge the couple, speak of
    // health or children, or carry the engine's blunt report wording.
    expect(JSON.stringify(result)).not.toMatch(
      /red flag|progeny|incompatible|inauspicious|\bboy\b|\bgirl\b|"poor"|\(poor\)/i,
    );
  }, 30_000);

  it('get_panchang uses the named city and its timezone', async () => {
    const result = await call('get_panchang', { date: '2026-10-20', place: 'Varanasi, India' });
    expect(result.isError).toBeFalsy();
    const p = result.structuredContent;
    expect(p).toMatchObject({
      date: '2026-10-20',
      weekday: 'Tuesday',
      place: 'Varanasi, Uttar Pradesh, India',
      location_source: 'named_place',
    });
    expect(p.sunrise).toMatch(/^\d{2}:\d{2}$/);
    expect(p.rahu_kaal.start).toMatch(/^\d{2}:\d{2}$/);
    expect(p.choghadiya_day).toHaveLength(8);
  }, 30_000);

  it('get_panchang falls back to the location hint, then to New Delhi', async () => {
    const hinted = await call(
      'get_panchang',
      { date: '2026-10-20' },
      { 'openai/userLocation': { city: 'Mumbai', region: 'Maharashtra', country: 'India' } },
    );
    expect(hinted.structuredContent.location_source).toBe('approximate_location');
    expect(hinted.structuredContent.place).toContain('Mumbai');

    const fallback = await call('get_panchang', { date: '2026-10-20' });
    expect(fallback.structuredContent.location_source).toBe('default_new_delhi');
    expect(fallback.content[0].text).toContain('New Delhi');
  }, 30_000);

  it('find_auspicious_dates gives general dates for the place', async () => {
    const result = await call('find_auspicious_dates', {
      occasion: 'housewarming_or_property',
      place: 'Pune',
      from: '2026-11-01',
      days: 30,
    });
    expect(result.isError).toBeFalsy();
    const d = result.structuredContent;
    expect(d).toMatchObject({ from: '2026-11-01', to: '2026-11-30' });
    expect(d.best_dates.length).toBeGreaterThan(0);
    expect(d.best_dates[0].reasons.length).toBeGreaterThan(0);
    expect(d.best_dates[0].weekday).toMatch(/day$/);
  }, 60_000);

  it('get_moon_sign_horoscope returns a reading for the sign', async () => {
    const result = await call('get_moon_sign_horoscope', { moon_sign: 'Leo' });
    expect(result.isError).toBeFalsy();
    const h = result.structuredContent;
    expect(h).toMatchObject({ moon_sign: 'Leo', period: 'daily' });
    expect((h.areas as { area: string }[]).map((a) => a.area)).toContain('career');
    expect(h.headline).toBeTruthy();
  }, 30_000);

  it('get_numerology_numbers returns the numbers', async () => {
    const result = await call('get_numerology_numbers', {
      full_name: 'Asha Rao',
      birth_date: '1990-04-17',
    });
    const n = result.structuredContent;
    expect(n.mulank).toBe(8);
    expect(n.life_path).toBeGreaterThan(0);
    expect(n.meanings.life_path).toBeTruthy();
  });

  it('show_birth_chart echoes the placements for the card', async () => {
    const result = await call('show_birth_chart', {
      ascendant_sign: 'Leo',
      planets: [
        { planet: 'Sun', house: 9 },
        { planet: 'Saturn', house: 6, retrograde: true },
      ],
    });
    expect(result.structuredContent.planets).toEqual([
      { planet: 'Sun', house: 9, retrograde: false },
      { planet: 'Saturn', house: 6, retrograde: true },
    ]);
  });
});

describe('ChatGPT plugin endpoint: link to Aroha and pacing', () => {
  const numbers = { full_name: 'Asha Rao', birth_date: '1990-04-17' };

  it('sends Android users to the Play Store and everyone else to the web app', async () => {
    const android = await call('get_numerology_numbers', numbers, {
      'openai/userAgent': 'ChatGPT/1.2026 (Android 15; Pixel 9)',
    });
    expect(android.structuredContent.more_in_aroha.url).toBe(PLAY_STORE_URL);

    const iphone = await call('get_numerology_numbers', numbers, {
      'openai/userAgent': 'ChatGPT/1.2026 (iOS 19; iPhone)',
    });
    expect(iphone.structuredContent.more_in_aroha.url).toBe(WEB_APP_URL);

    const unknown = await call('get_numerology_numbers', numbers);
    expect(unknown.structuredContent.more_in_aroha.url).toBe(WEB_APP_URL);
  });

  it('says with every result that the figures are calculated, without claiming accuracy', async () => {
    const chart = await call('generate_birth_chart', PUNE_BIRTH);
    const numbers = await call('get_numerology_numbers', {
      full_name: 'Asha Rao',
      birth_date: '1990-04-17',
    });
    for (const result of [chart, numbers]) {
      const { calculated, more_in_aroha } = result.structuredContent as {
        calculated: string;
        more_in_aroha: { note: string };
      };
      expect(calculated).toContain('Calculated by Aroha');
      expect(calculated).toContain('not generated text');
      expect(more_in_aroha.note).toContain('Aroha app');
      // OpenAI rejects unverifiable claims and comparisons with other products.
      expect(`${calculated} ${more_in_aroha.note}`).not.toMatch(
        /accurate|guarantee|\bAI\b|better than|only we/i,
      );
    }
  }, 30_000);

  it('never mentions money', async () => {
    const result = await call('generate_birth_chart', PUNE_BIRTH);
    expect(JSON.stringify(result)).not.toMatch(/₹|rupee|price|credit|subscri|upgrade|buy /i);
  }, 30_000);

  it('paces one ChatGPT user without slowing another', async () => {
    const as = (subject: string) =>
      call('get_numerology_numbers', numbers, { 'openai/subject': subject });
    let limited = 0;
    for (let i = 0; i < 45; i++) if ((await as('user-a')).isError) limited++;
    expect(limited).toBe(5);
    expect((await as('user-b')).isError).toBeFalsy();
  });
});
