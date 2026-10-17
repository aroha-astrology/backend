import { beforeEach, describe, expect, it, vi } from 'vitest';

interface State {
  free: string[];
  paid: string[];
  paid2: string | null;
  rows: Record<string, unknown>[];
  dbFails: boolean;
}

// Filled in by beforeEach.
const state = vi.hoisted(
  (): State => ({ free: [], paid: [], paid2: null, rows: [], dbFails: false }),
);

vi.mock('../src/config/env.js', () => ({
  env: { LOG_LEVEL: 'silent' },
  get GEMINI_KEY_POOL() {
    return state.free;
  },
  get GEMINI_PAID_KEY_POOL() {
    return state.paid;
  },
  get GEMINI_PAID_KEY2() {
    return state.paid2;
  },
  isProduction: false,
  isTest: true,
}));

vi.mock('../src/modules/admin/gemini-keys.repo.js', () => ({
  listGeminiKeyRows: vi.fn(() =>
    state.dbFails ? Promise.reject(new Error('db down')) : Promise.resolve(state.rows),
  ),
}));

// "Encrypted" = 'enc:' + key, so a test can read what was stored.
vi.mock('../src/lib/crypto/field-encryption.js', () => ({
  decryptField: (value: string | null) => {
    if (value === 'broken') throw new Error('bad auth tag');
    return value?.startsWith('enc:') ? value.slice(4) : value;
  },
}));

const keys = await import('../src/lib/llm/gemini-keys.js');

function row(overrides: Record<string, unknown>) {
  return {
    id: 'row-id',
    source: 'admin',
    name: 'pasted',
    tier: 'free',
    secret: null,
    enabled: true,
    paidRank: 100,
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  state.free = ['free-key-aaaaaaaaaaaaaaaa1', 'free-key-aaaaaaaaaaaaaaaa2'];
  state.paid = ['paid-key-1719-aaaaaaaaaaaa'];
  state.paid2 = 'paid-key-2-aaaaaaaaaaaaaaa';
  state.rows = [];
  state.dbFails = false;
  keys.invalidateGeminiKeys();
});

describe('envGeminiKeys', () => {
  it('names the .env keys and puts subir2 ahead of subir1719', () => {
    const list = keys.envGeminiKeys();
    expect(list.map((k) => [k.name, k.tier])).toEqual([
      ['free-1', 'free'],
      ['free-2', 'free'],
      ['subir2', 'paid'],
      ['subir1719', 'paid'],
    ]);
    const subir2 = list.find((k) => k.name === 'subir2')!;
    const subir1719 = list.find((k) => k.name === 'subir1719')!;
    expect(subir2.paidRank).toBeLessThan(subir1719.paidRank);
  });

  it('leaves subir2 out when GEMINI_PAID_API_KEY2 is not set', () => {
    state.paid2 = null;
    expect(keys.envGeminiKeys().map((k) => k.name)).not.toContain('subir2');
  });
});

describe('loadGeminiKeys', () => {
  it('applies a table row to the .env key with the same fingerprint', async () => {
    const fp = keys.fingerprintOf('free-key-aaaaaaaaaaaaaaaa2');
    state.rows = [row({ source: 'env', fingerprint: fp, name: 'renamed', enabled: false })];
    const list = await keys.loadGeminiKeys();
    const key = list.find((k) => k.fingerprint === fp)!;
    expect(key).toMatchObject({
      name: 'renamed',
      enabled: false,
      key: 'free-key-aaaaaaaaaaaaaaaa2',
    });
  });

  it('adds pasted keys with their decrypted secret', async () => {
    state.rows = [
      row({
        fingerprint: 'fp-new',
        name: 'extra-paid',
        tier: 'paid',
        secret: 'enc:new-key-bbbbbbbbbbbbbbbbbbb',
        paidRank: 5,
      }),
    ];
    const list = await keys.loadGeminiKeys();
    expect(list.at(-1)).toMatchObject({
      name: 'extra-paid',
      tier: 'paid',
      key: 'new-key-bbbbbbbbbbbbbbbbbbb',
      source: 'admin',
      paidRank: 5,
    });
  });

  it('skips a stored key it cannot decrypt instead of failing every pick', async () => {
    state.rows = [row({ fingerprint: 'fp-bad', secret: 'broken' })];
    const list = await keys.loadGeminiKeys();
    expect(list).toHaveLength(4);
  });

  it('ignores an env row whose key was removed from .env', async () => {
    state.rows = [row({ source: 'env', fingerprint: 'fp-gone', name: 'old' })];
    const list = await keys.loadGeminiKeys();
    expect(list.map((k) => k.name)).not.toContain('old');
  });

  it('falls back to the .env keys when the table cannot be read', async () => {
    state.dbFails = true;
    const list = await keys.loadGeminiKeys();
    expect(list.map((k) => k.name)).toEqual(['free-1', 'free-2', 'subir2', 'subir1719']);
  });

  it('caches, and invalidateGeminiKeys makes the next read see a change', async () => {
    await keys.loadGeminiKeys();
    state.rows = [row({ fingerprint: 'fp-new', secret: 'enc:new-key-ccccccccccccccccccc' })];
    expect(await keys.loadGeminiKeys()).toHaveLength(4);
    keys.invalidateGeminiKeys();
    expect(await keys.loadGeminiKeys()).toHaveLength(5);
  });
});
