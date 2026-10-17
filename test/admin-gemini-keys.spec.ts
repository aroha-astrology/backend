import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory gemini_keys table behind the repo functions the service uses.
const state = vi.hoisted(() => ({
  rows: [] as Record<string, any>[],
  nextId: 1,
  coolingDown: new Set<string>(),
  audit: [] as { route: string; params: any }[],
}));

const ENV_FREE = 'envfreekey-aaaaaaaaaaaaaaaa';
const ENV_1719 = 'envpaid1719-aaaaaaaaaaaaaaa';
const ENV_2 = 'envpaid2-aaaaaaaaaaaaaaaaaaa';

vi.mock('../src/config/env.js', () => ({
  env: {
    LOG_LEVEL: 'silent',
    GEMINI_BASE_URL: 'https://gemini.test/v1beta/openai',
    GEMINI_MODEL: 'gemini-test-flash',
  },
  GEMINI_KEY_POOL: [ENV_FREE],
  GEMINI_PAID_KEY_POOL: [ENV_1719],
  GEMINI_PAID_KEY2: ENV_2,
  isProduction: false,
  isTest: true,
}));

vi.mock('../src/lib/crypto/field-encryption.js', () => ({
  encryptField: (value: string | null) => (value == null ? null : `enc:${value}`),
  decryptField: (value: string | null) => (value?.startsWith('enc:') ? value.slice(4) : value),
}));

vi.mock('../src/lib/llm/gemini-key-pool.js', () => ({
  isCoolingDown: (fingerprint: string) => Promise.resolve(state.coolingDown.has(fingerprint)),
}));

vi.mock('../src/modules/admin/admin.repo.js', () => ({
  logAdminAction: (_phone: string, route: string, params: unknown) => {
    state.audit.push({ route, params });
    return Promise.resolve();
  },
}));

vi.mock('../src/modules/admin/gemini-keys.repo.js', () => ({
  listGeminiKeyRows: () => Promise.resolve([...state.rows]),
  findGeminiKeyRow: (id: string) => Promise.resolve(state.rows.find((r) => r.id === id)),
  insertMissingGeminiKeyRows: (rows: Record<string, any>[]) => {
    for (const r of rows) {
      if (state.rows.some((x) => x.fingerprint === r.fingerprint)) continue;
      state.rows.push({ ...base(), ...r });
    }
    return Promise.resolve();
  },
  insertGeminiKeyRow: (r: Record<string, any>) => {
    if (state.rows.some((x) => x.fingerprint === r.fingerprint)) return Promise.resolve(null);
    const inserted = { ...base(), ...r };
    state.rows.push(inserted);
    return Promise.resolve(inserted);
  },
  updateGeminiKeyRow: (id: string, patch: Record<string, any>) => {
    const r = state.rows.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
    return Promise.resolve(r);
  },
  recordGeminiKeyTest: (id: string, ok: boolean, message: string) => {
    const r = state.rows.find((x) => x.id === id);
    if (r) Object.assign(r, { lastTestOk: ok, lastTestMessage: message, lastTestedAt: new Date() });
    return Promise.resolve();
  },
  deleteGeminiKeyRow: (id: string) => {
    state.rows = state.rows.filter((x) => x.id !== id);
    return Promise.resolve();
  },
}));

function base() {
  const n = state.nextId++;
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`,
    secret: null,
    enabled: true,
    paidRank: 100,
    lastTestedAt: null,
    lastTestOk: null,
    lastTestMessage: null,
    createdAt: new Date(Date.UTC(2026, 9, 17, 0, 0, n)),
    updatedAt: new Date(),
    updatedBy: null,
  };
}

const svc = await import('../src/modules/admin/gemini-keys.service.js');
const PHONE = '+910000000000';
const NEW_KEY = 'AIzaNewPastedKey_aaaaaaaaaaaa1234';

beforeEach(() => {
  state.rows = [];
  state.nextId = 1;
  state.coolingDown = new Set();
  state.audit = [];
  vi.unstubAllGlobals();
});

async function byName(name: string) {
  return (await svc.listGeminiKeys()).find((k) => k.name === name)!;
}

describe('listGeminiKeys', () => {
  it('lists the .env keys by name, free first, then subir2 before subir1719', async () => {
    const list = await svc.listGeminiKeys();
    expect(list.map((k) => [k.name, k.tier, k.paidPosition])).toEqual([
      ['free-1', 'free', null],
      ['subir2', 'paid', 1],
      ['subir1719', 'paid', 2],
    ]);
  });

  it('shows only the last 4 characters of a key', async () => {
    const list = await svc.listGeminiKeys();
    expect(list[0]!.last4).toBe(ENV_FREE.slice(-4));
    expect(JSON.stringify(list)).not.toContain(ENV_FREE);
  });
});

describe('addGeminiKey', () => {
  it('stores a pasted key encrypted and lists it, a paid one at the end of the order', async () => {
    const added = await svc.addGeminiKey({ name: 'subir3', tier: 'paid', key: NEW_KEY }, PHONE);
    expect(added).toMatchObject({
      name: 'subir3',
      tier: 'paid',
      source: 'admin',
      paidPosition: 3,
      last4: '1234',
    });
    expect(state.rows.find((r) => r.name === 'subir3')!.secret).toBe(`enc:${NEW_KEY}`);
    // The audit log names the key, never its secret.
    expect(JSON.stringify(state.audit)).not.toContain(NEW_KEY);
  });

  it('refuses a key that is already in the list', async () => {
    await expect(
      svc.addGeminiKey({ name: 'dup', tier: 'free', key: ENV_1719 }, PHONE),
    ).rejects.toThrow(/already in the list, as "subir1719"/);
  });

  it('refuses a name that is already taken', async () => {
    await expect(
      svc.addGeminiKey({ name: 'SUBIR2', tier: 'free', key: NEW_KEY }, PHONE),
    ).rejects.toThrow(/already called/);
  });

  it('refuses text that is not a key', async () => {
    await expect(
      svc.addGeminiKey({ name: 'x', tier: 'free', key: 'not a key at all, has spaces' }, PHONE),
    ).rejects.toThrow(/does not look like a Gemini API key/);
  });
});

describe('updateGeminiKey', () => {
  it('switches a key off and on', async () => {
    const free = await byName('free-1');
    expect((await svc.updateGeminiKey(free.id, { enabled: false }, PHONE)).enabled).toBe(false);
    expect((await svc.updateGeminiKey(free.id, { enabled: true }, PHONE)).enabled).toBe(true);
  });

  it('refuses to switch off the last key that is on', async () => {
    const list = await svc.listGeminiKeys();
    await svc.updateGeminiKey(list[0]!.id, { enabled: false }, PHONE);
    await svc.updateGeminiKey(list[1]!.id, { enabled: false }, PHONE);
    await expect(svc.updateGeminiKey(list[2]!.id, { enabled: false }, PHONE)).rejects.toThrow(
      /no Gemini key switched on/,
    );
  });

  it('moves a free key into the paid tier at the end of the paid order', async () => {
    const free = await byName('free-1');
    const moved = await svc.updateGeminiKey(free.id, { tier: 'paid' }, PHONE);
    expect(moved).toMatchObject({ tier: 'paid', paidPosition: 3 });
  });
});

describe('useGeminiKeyFirst', () => {
  it('puts the chosen paid key first and keeps the rest in order', async () => {
    await svc.addGeminiKey({ name: 'subir3', tier: 'paid', key: NEW_KEY }, PHONE);
    const subir1719 = await byName('subir1719');
    const list = await svc.useGeminiKeyFirst(subir1719.id, PHONE);
    expect(list.filter((k) => k.tier === 'paid').map((k) => k.name)).toEqual([
      'subir1719',
      'subir2',
      'subir3',
    ]);
  });

  it('refuses a free key', async () => {
    const free = await byName('free-1');
    await expect(svc.useGeminiKeyFirst(free.id, PHONE)).rejects.toThrow(/Only a paid key/);
  });
});

describe('deleteGeminiKey', () => {
  it('deletes a pasted key', async () => {
    const added = await svc.addGeminiKey({ name: 'temp', tier: 'free', key: NEW_KEY }, PHONE);
    await svc.deleteGeminiKey(added.id, PHONE);
    expect((await svc.listGeminiKeys()).map((k) => k.name)).not.toContain('temp');
  });

  it('refuses to delete a key that comes from .env', async () => {
    const subir2 = await byName('subir2');
    await expect(svc.deleteGeminiKey(subir2.id, PHONE)).rejects.toThrow(
      /Switch it off here instead/,
    );
  });
});

describe('testGeminiKey', () => {
  it('reports a working key and records the result', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{"choices":[]}', { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    const subir2 = await byName('subir2');

    const result = await svc.testGeminiKey(subir2.id, PHONE);

    expect(result.ok).toBe(true);
    expect(result.message).toContain('gemini-test-flash');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://gemini.test/v1beta/openai/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${ENV_2}`);
    expect((await byName('subir2')).lastTestOk).toBe(true);
  });

  it('explains a quota failure in plain words', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response('[{"error":{"code":429,"message":"Quota exceeded for metric X"}}]', {
            status: 429,
          }),
        ),
      ),
    );
    const free = await byName('free-1');
    const result = await svc.testGeminiKey(free.id, PHONE);
    expect(result).toMatchObject({ ok: false, status: 429 });
    expect(result.message).toBe('Out of quota or rate limited (429): Quota exceeded for metric X');
  });

  it('says a rejected key is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response('{"error":{"message":"API key not valid."}}', { status: 400 }),
        ),
      ),
    );
    const added = await svc.addGeminiKey({ name: 'bad', tier: 'free', key: NEW_KEY }, PHONE);
    const result = await svc.testGeminiKey(added.id, PHONE);
    expect(result.message).toBe('Key rejected (400): API key not valid.');
  });

  it('reports a network failure without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('ECONNRESET'))),
    );
    const free = await byName('free-1');
    const result = await svc.testGeminiKey(free.id, PHONE);
    expect(result).toMatchObject({
      ok: false,
      status: null,
      message: 'Could not reach Gemini: ECONNRESET',
    });
  });
});
