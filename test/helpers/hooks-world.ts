// An in-memory stand-in for the hooks repo and the wallet, shared by the hook service specs.
// Use it as: vi.mock('../src/modules/hooks/hooks.repo', async () => (await import('./helpers/hooks-world')).hooksRepoMock)

export interface Row {
  userId: string;
  hook: string;
  profileKey: string;
  localDate: string;
  data: Record<string, unknown>;
}

export const world = {
  progress: new Map<string, Row>(),
  unlocks: new Set<string>(),
  pushLog: [] as { userId: string; localDate: string; hook: string }[],
  alarms: [] as Record<string, any>[],
  sleep: new Map<string, Record<string, any>>(),
  settings: {} as Record<string, unknown>,
  wallet: [] as { delta: number; reason: string; key?: string }[],
  balancePaise: 100_000,
  features: new Set<string>(),
  prices: {} as Record<string, number>,
  pass: null as null | { tier: string | null },
  pushes: [] as { type: string; title: string; body: string; link?: string }[],
};

export function resetWorld(): void {
  world.progress = new Map();
  world.unlocks = new Set();
  world.pushLog = [];
  world.alarms = [];
  world.sleep = new Map();
  world.settings = {};
  world.wallet = [];
  world.balancePaise = 100_000;
  world.features = new Set();
  world.prices = {};
  world.pass = null;
  world.pushes = [];
}

const pk = (u: string, h: string, p: string, d: string): string => `${u}|${h}|${p}|${d}`;

export const hooksRepoMock = {
  getProgress: async (u: string, h: string, p: string, d: string) => {
    const r = world.progress.get(pk(u, h, p, d));
    return r ? { ...r, id: pk(u, h, p, d) } : undefined;
  },
  mergeProgress: async (u: string, h: string, p: string, d: string, patch: Record<string, unknown>) => {
    const k = pk(u, h, p, d);
    const cur = world.progress.get(k);
    const row: Row = { userId: u, hook: h, profileKey: p, localDate: d, data: { ...(cur?.data ?? {}), ...patch } };
    world.progress.set(k, row);
    return { ...row, id: k };
  },
  createProgressOnce: async (u: string, h: string, p: string, d: string, data: Record<string, unknown>) => {
    const k = pk(u, h, p, d);
    if (world.progress.has(k)) return false;
    world.progress.set(k, { userId: u, hook: h, profileKey: p, localDate: d, data });
    return true;
  },
  listProgress: async (u: string, h: string, p: string, from: string, to: string) =>
    [...world.progress.values()]
      .filter((r) => r.userId === u && r.hook === h && r.profileKey === p && r.localDate >= from && r.localDate <= to)
      .sort((a, b) => a.localDate.localeCompare(b.localDate))
      .map((r) => ({ ...r, id: pk(r.userId, r.hook, r.profileKey, r.localDate) })),
  countProgress: async (h: string, d: string) =>
    [...world.progress.values()].filter((r) => r.hook === h && r.localDate === d).length,
  insertUnlock: async (u: string, h: string, ref: string) => {
    const k = `${u}|${h}|${ref}`;
    if (world.unlocks.has(k)) return false;
    world.unlocks.add(k);
    return true;
  },
  hasUnlock: async (u: string, h: string, ref: string) => world.unlocks.has(`${u}|${h}|${ref}`),
  deleteUnlock: async (u: string, h: string, ref: string) => {
    world.unlocks.delete(`${u}|${h}|${ref}`);
  },
  pushCountOn: async (u: string, d: string) => world.pushLog.filter((x) => x.userId === u && x.localDate === d).length,
  logPush: async (userId: string, localDate: string, hook: string) => {
    world.pushLog.push({ userId, localDate, hook });
  },
  insertAlarm: async (v: Record<string, any>) => {
    if (world.alarms.some((a) => a.userId === v.userId && a.hook === v.hook && a.ref === v.ref)) return false;
    world.alarms.push({ id: `a${world.alarms.length + 1}`, sentAt: null, ...v });
    return true;
  },
  dueAlarms: async (now: Date) => world.alarms.filter((a) => !a.sentAt && a.fireAt <= now),
  claimAlarm: async (id: string, now: Date) => {
    const a = world.alarms.find((x) => x.id === id);
    if (!a || a.sentAt) return false;
    a.sentAt = now;
    return true;
  },
  listAlarms: async (u: string, h: string, from: Date) =>
    world.alarms.filter((a) => a.userId === u && a.hook === h && a.fireAt >= from),
  upsertSleep: async (v: Record<string, any>) => {
    world.sleep.set(`${v.userId}|${v.localDate}`, v);
  },
  listSleep: async (u: string) =>
    [...world.sleep.values()].filter((r) => r.userId === u).sort((a, b) => b.localDate.localeCompare(a.localDate)),
  readSettings: async () => world.settings,
  writeSettings: async (value: Record<string, unknown>) => {
    world.settings = value;
  },
};

/** For vi.mock('../src/modules/users/users.repo'): a wallet that keeps its ledger in `world`. */
export const usersRepoMock = {
  deductWalletBalance: async (_u: string, paise: number, reason: string, opts?: { idempotencyKey?: string }) => {
    const key = opts?.idempotencyKey;
    if (key && world.wallet.some((w) => w.key === key)) return true;
    if (world.balancePaise < paise) return false;
    world.balancePaise -= paise;
    world.wallet.push({ delta: -paise, reason, key });
    return true;
  },
  addWalletBalance: async (_u: string, paise: number, reason: string, opts?: { idempotencyKey?: string }) => {
    const key = opts?.idempotencyKey;
    if (key && world.wallet.some((w) => w.key === key)) return false;
    world.balancePaise += paise;
    world.wallet.push({ delta: paise, reason, key });
    return true;
  },
  refundKeyFor: (k: string) => `refund:${k}`,
};

export const featuresServiceMock = {
  isFeatureOn: async (_u: string, key: string) => world.features.has(key),
  isFeatureOnGlobally: async (key: string) => world.features.has(key),
  priceOf: async (_u: string, key: string, fallback: number) => world.prices[key] ?? fallback,
  payoutOf: async (_u: string, key: string, fallback: number) => world.prices[key] ?? fallback,
};
