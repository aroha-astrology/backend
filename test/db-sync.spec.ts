import { describe, expect, it } from 'vitest';
import {
  appSchemas,
  compareFingerprints,
  totalRows,
  type Fingerprint,
} from '../scripts/db/lib/fingerprint.js';
import {
  checkUrls,
  filesToPrune,
  forbiddenDumpLine,
  lockDownSql,
  parseDbUrl,
} from '../scripts/db/lib/guards.js';

const SOURCE = 'postgres://atulgoel:pw@localhost:5432/aroha_astrology_dev';
const TARGET =
  'postgresql://postgres.abcd:secret@aws-0-ap-south-1.pooler.supabase.com:5432/postgres';

function fp(overrides: Partial<Fingerprint> = {}): Fingerprint {
  return {
    tables: {
      'public.users': { rows: 3, hash: 'aaa' },
      'drizzle.__drizzle_migrations': { rows: 86, hash: 'mmm' },
    },
    sequences: { 'drizzle.__drizzle_migrations_id_seq': '86' },
    enums: { 'public.plan_tier': ['silver', 'gold', 'platinum'] },
    columns: { 'public.users.id': 'uuid | uuid | NO | gen_random_uuid() | ' },
    indexes: { 'public.users_pkey': 'CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)' },
    constraints: { 'public.users.users_pkey': 'PRIMARY KEY (id)' },
    migrations: 86,
    ...overrides,
  };
}

describe('parseDbUrl', () => {
  it('reads every part, decoding the password', () => {
    expect(parseDbUrl('postgres://u%40x:p%23w@Host.Example:6543/db')).toEqual({
      host: 'host.example',
      port: 6543,
      user: 'u@x',
      password: 'p#w',
      database: 'db',
    });
  });

  it('defaults the port and database', () => {
    expect(parseDbUrl('postgresql://u:p@h')).toMatchObject({ port: 5432, database: 'postgres' });
  });

  it('rejects non-postgres URLs', () => {
    expect(() => parseDbUrl('mysql://u:p@h/db')).toThrow(/not a postgres URL/);
  });
});

describe('checkUrls', () => {
  it('accepts the box database copied to the Supabase session pooler', () => {
    expect(checkUrls(SOURCE, TARGET)).toEqual([]);
  });

  it('refuses once the live app no longer uses the box database (after the switch)', () => {
    const problems = checkUrls(TARGET.replace(':5432', ':6543'), TARGET);
    expect(problems.join(' ')).toMatch(/production may already have moved/);
  });

  it('refuses a target that is not Supabase', () => {
    expect(checkUrls(SOURCE, 'postgres://u:p@db.example.com:5432/x').join(' ')).toMatch(
      /not a Supabase host/,
    );
  });

  it('refuses the transaction pooler as the target', () => {
    expect(checkUrls(SOURCE, TARGET.replace(':5432', ':6543')).join(' ')).toMatch(
      /transaction pooler/,
    );
  });

  it('refuses when either URL is missing or broken', () => {
    expect(checkUrls('', TARGET).join(' ')).toMatch(/DATABASE_URL is not usable/);
    expect(checkUrls(SOURCE, '').join(' ')).toMatch(/SUPABASE_SYNC_URL is not usable/);
  });

  it('refuses copying a database onto itself', () => {
    expect(checkUrls(SOURCE, SOURCE).join(' ')).toMatch(/same database|not a Supabase host/);
  });
});

describe('forbiddenDumpLine', () => {
  it.each([
    ['DROP SCHEMA IF EXISTS "public";', 'drops schema public'],
    ['DROP SCHEMA public CASCADE;', 'drops schema public'],
    ['DROP EXTENSION IF EXISTS "plpgsql";', 'drops an extension'],
    ['CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "public";', 'creates an extension'],
    ['ALTER ROLE postgres SUPERUSER;', 'touches a role'],
    ['DROP DATABASE "postgres";', 'drops a database'],
  ])('blocks %s', (line, reason) => {
    expect(forbiddenDumpLine(line)).toBe(reason);
  });

  it.each([
    'DROP SCHEMA IF EXISTS "drizzle";',
    'CREATE SCHEMA "drizzle";',
    'DROP TABLE IF EXISTS "public"."users";',
    'DROP TYPE IF EXISTS "public"."plan_tier";',
    'COPY "public"."users" ("id", "note") FROM stdin;',
    'abc\tDROP SCHEMA public; in user data\t2026-10-17',
  ])('lets ordinary dump lines through: %s', (line) => {
    expect(forbiddenDumpLine(line)).toBeNull();
  });
});

describe('lockDownSql', () => {
  const sql = lockDownSql(['drizzle', 'public']);

  it('enables row level security on every table of the copied schemas', () => {
    expect(sql).toContain("schemaname IN ('drizzle', 'public')");
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('removes the public API roles and their default grants', () => {
    expect(sql).toContain('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM anon, authenticated');
    expect(sql).toContain('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES');
  });

  it('quotes schema names as literals', () => {
    expect(lockDownSql(["we'ird"])).toContain("'we''ird'");
  });
});

describe('appSchemas', () => {
  it('keeps app schemas and drops Postgres and Supabase ones', () => {
    expect(
      appSchemas([
        'public',
        'drizzle',
        'pg_catalog',
        'information_schema',
        'pg_toast',
        'pg_temp_3',
        'auth',
        'storage',
        'extensions',
        'realtime',
      ]),
    ).toEqual(['drizzle', 'public']);
  });
});

describe('compareFingerprints', () => {
  it('passes identical fingerprints', () => {
    expect(compareFingerprints(fp(), fp())).toEqual({ errors: [], warnings: [] });
  });

  it('fails on a row count difference', () => {
    const copy = fp({ tables: { ...fp().tables, 'public.users': { rows: 2, hash: 'bbb' } } });
    expect(compareFingerprints(fp(), copy).errors).toEqual([
      'table public.users: 3 rows in source, 2 in copy',
    ]);
  });

  it('fails when counts match but content differs', () => {
    const copy = fp({ tables: { ...fp().tables, 'public.users': { rows: 3, hash: 'zzz' } } });
    expect(compareFingerprints(fp(), copy).errors[0]).toMatch(/same row count \(3\) but different content/);
  });

  it('fails on a missing or extra table', () => {
    const { ['public.users']: _gone, ...rest } = fp().tables;
    expect(compareFingerprints(fp(), fp({ tables: rest })).errors).toContain(
      'table missing in copy: public.users',
    );
    const extra = fp({ tables: { ...fp().tables, 'public.stray': { rows: 0, hash: 'x' } } });
    expect(compareFingerprints(fp(), extra).errors).toContain(
      'table only in copy (not in source): public.stray',
    );
  });

  it('fails on sequence, enum and migration differences', () => {
    const copy = fp({
      sequences: { 'drizzle.__drizzle_migrations_id_seq': null },
      enums: { 'public.plan_tier': ['silver', 'gold'] },
      migrations: 85,
    });
    const { errors } = compareFingerprints(fp(), copy);
    expect(errors).toContain('sequence drizzle.__drizzle_migrations_id_seq: 86 in source, unused in copy');
    expect(errors.some((e) => e.startsWith('enum public.plan_tier'))).toBe(true);
    expect(errors).toContain('drizzle migrations: 86 in source, 85 in copy');
  });

  it('only warns when a definition exists on both sides but prints differently', () => {
    const copy = fp({ columns: { 'public.users.id': 'uuid | uuid | NO | gen_random_uuid() | x' } });
    const result = compareFingerprints(fp(), copy);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });

  it('hides warnings that were reviewed and accepted', () => {
    const copy = fp({ columns: { 'public.users.id': 'uuid | uuid | NO | gen_random_uuid() | x' } });
    const [warning] = compareFingerprints(fp(), copy).warnings;
    expect(compareFingerprints(fp(), copy, new Set([warning!])).warnings).toEqual([]);
  });

  it('fails when an index or constraint is missing entirely', () => {
    const { errors } = compareFingerprints(fp(), fp({ indexes: {}, constraints: {} }));
    expect(errors).toContain('index missing in copy: public.users_pkey');
    expect(errors).toContain('constraint missing in copy: public.users.users_pkey');
  });
});

describe('totalRows', () => {
  it('adds up rows across tables', () => {
    expect(totalRows(fp())).toBe(89);
  });
});

describe('filesToPrune', () => {
  it('keeps the newest N by timestamped name', () => {
    const names = [
      'aroha-20261015T173300Z.sql.gz',
      'aroha-20261017T173300Z.sql.gz',
      'aroha-20261016T173300Z.sql.gz',
    ];
    expect(filesToPrune(names, 2)).toEqual(['aroha-20261015T173300Z.sql.gz']);
    expect(filesToPrune(names, 7)).toEqual([]);
  });
});
