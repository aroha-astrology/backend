/**
 * Database fingerprints for the nightly Supabase copy (scripts/db/sync-to-supabase.ts).
 *
 * A fingerprint is everything needed to prove two databases hold the same data:
 * per-table row count and content hash, sequence positions, enum labels, the
 * drizzle migration count, and the text of every column, index and constraint
 * definition. Hashes are computed inside Postgres so only 32-character digests
 * cross the network — the Supabase Free plan meters egress.
 *
 * The content hash is order-independent on purpose: rows are hashed one by
 * one and the row hashes are sorted with the "C" collation before being
 * hashed together. Ordering by primary key instead would compare text keys
 * under each server's own collation, and EC2 (glibc) and Supabase can sort
 * text differently — the same data would then hash differently.
 *
 * Row text depends on session settings (time zone, float digits, ...), so
 * SESSION_SETTINGS must be applied to both sides before fingerprinting.
 */
import type postgres from 'postgres';

export const SESSION_SETTINGS = [
  "SET TimeZone = 'UTC'",
  "SET DateStyle = 'ISO, YMD'",
  "SET IntervalStyle = 'postgres'",
  'SET extra_float_digits = 1',
  "SET bytea_output = 'hex'",
];

/** Schemas that belong to Postgres itself, never to the app. */
const SYSTEM_SCHEMAS = ['pg_catalog', 'information_schema', 'pg_toast'];

/**
 * Schemas Supabase creates and manages in every project. They exist only on
 * the target side and are never compared or touched.
 */
export const SUPABASE_MANAGED_SCHEMAS = [
  'auth',
  'storage',
  'extensions',
  'graphql',
  'graphql_public',
  'realtime',
  'supabase_functions',
  'supabase_migrations',
  'vault',
  'pgbouncer',
  'pgsodium',
  'pgsodium_masks',
  'net',
  'cron',
  '_realtime',
  '_analytics',
];

export interface TableFingerprint {
  rows: number;
  hash: string;
}

export interface Fingerprint {
  /** Keyed by "schema.table". */
  tables: Record<string, TableFingerprint>;
  /** Keyed by "schema.sequence"; null when the sequence was never used. */
  sequences: Record<string, string | null>;
  /** Keyed by "schema.type"; labels in sort order. */
  enums: Record<string, string[]>;
  /** Keyed by "schema.table.column". */
  columns: Record<string, string>;
  /** Keyed by "schema.index". */
  indexes: Record<string, string>;
  /** Keyed by "schema.table.constraint". */
  constraints: Record<string, string>;
  /** Rows in drizzle.__drizzle_migrations, or null when the table is missing. */
  migrations: number | null;
}

export interface Comparison {
  /** Data differences: the copy is wrong. */
  errors: string[];
  /** Definition text differs but the object exists on both sides (e.g. PG 17 prints a default differently). */
  warnings: string[];
}

function isSystemSchema(name: string): boolean {
  return SYSTEM_SCHEMAS.includes(name) || name.startsWith('pg_temp') || name.startsWith('pg_toast_temp');
}

/** App schemas: every schema that is neither a Postgres system schema nor Supabase-managed. */
export function appSchemas(all: string[]): string[] {
  return all
    .filter((s) => !isSystemSchema(s) && !SUPABASE_MANAGED_SCHEMAS.includes(s))
    .sort();
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export async function listSchemas(sql: postgres.Sql | postgres.ReservedSql): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`select nspname as name from pg_namespace`;
  return rows.map((r) => r.name);
}

/**
 * Fingerprint the given schemas. Run it on a connection that already has
 * SESSION_SETTINGS applied (and, on the source, inside the snapshot
 * transaction, so the fingerprint matches exactly what pg_dump copies).
 */
export async function takeFingerprint(
  sql: postgres.Sql | postgres.ReservedSql,
  schemas: string[],
): Promise<Fingerprint> {
  const fp: Fingerprint = {
    tables: {},
    sequences: {},
    enums: {},
    columns: {},
    indexes: {},
    constraints: {},
    migrations: null,
  };
  if (schemas.length === 0) return fp;

  const tables = await sql<{ schema: string; name: string }[]>`
    select n.nspname as schema, c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and n.nspname in ${sql(schemas)}
    order by 1, 2`;
  for (const t of tables) {
    const rel = `${quoteIdent(t.schema)}.${quoteIdent(t.name)}`;
    const [row] = await sql.unsafe<{ rows: string; hash: string }[]>(
      `select count(*)::text as rows,
              md5(coalesce(string_agg(h, '' order by h collate "C"), '')) as hash
       from (select md5(t::text) as h from ${rel} t) x`,
    );
    fp.tables[`${t.schema}.${t.name}`] = { rows: Number(row!.rows), hash: row!.hash };
  }

  const seqs = await sql<{ schema: string; name: string }[]>`
    select n.nspname as schema, c.relname as name
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'S' and n.nspname in ${sql(schemas)}
    order by 1, 2`;
  for (const s of seqs) {
    const rel = `${quoteIdent(s.schema)}.${quoteIdent(s.name)}`;
    const [row] = await sql.unsafe<{ last_value: string; is_called: boolean }[]>(
      `select last_value::text, is_called from ${rel}`,
    );
    fp.sequences[`${s.schema}.${s.name}`] = row!.is_called ? row!.last_value : null;
  }

  const enums = await sql<{ schema: string; name: string; labels: string[] }[]>`
    select n.nspname as schema, t.typname as name,
           array_agg(e.enumlabel order by e.enumsortorder) as labels
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join pg_enum e on e.enumtypid = t.oid
    where n.nspname in ${sql(schemas)}
    group by 1, 2`;
  for (const e of enums) fp.enums[`${e.schema}.${e.name}`] = e.labels;

  const columns = await sql<{ key: string; def: string }[]>`
    select table_schema || '.' || table_name || '.' || column_name as key,
           concat_ws(' | ', data_type, udt_name, is_nullable,
                     coalesce(column_default, ''), coalesce(character_maximum_length::text, '')) as def
    from information_schema.columns
    where table_schema in ${sql(schemas)}`;
  for (const c of columns) fp.columns[c.key] = c.def;

  const indexes = await sql<{ key: string; def: string }[]>`
    select schemaname || '.' || indexname as key, indexdef as def
    from pg_indexes where schemaname in ${sql(schemas)}`;
  for (const i of indexes) fp.indexes[i.key] = i.def;

  const constraints = await sql<{ key: string; def: string }[]>`
    select n.nspname || '.' || c.relname || '.' || k.conname as key,
           pg_get_constraintdef(k.oid) as def
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ${sql(schemas)}`;
  for (const k of constraints) fp.constraints[k.key] = k.def;

  if (fp.tables['drizzle.__drizzle_migrations']) {
    fp.migrations = fp.tables['drizzle.__drizzle_migrations'].rows;
  }
  return fp;
}

function compareKeyed<T>(
  label: string,
  source: Record<string, T>,
  target: Record<string, T>,
  equal: (a: T, b: T) => boolean,
  describe: (key: string, a: T, b: T) => string,
  onDiff: 'error' | 'warning',
  out: Comparison,
  allow: Set<string>,
): void {
  for (const key of Object.keys(source).sort()) {
    if (!(key in target)) {
      out.errors.push(`${label} missing in copy: ${key}`);
      continue;
    }
    const a = source[key] as T;
    const b = target[key] as T;
    if (!equal(a, b)) {
      const msg = describe(key, a, b);
      if (onDiff === 'error') out.errors.push(msg);
      else if (!allow.has(msg)) out.warnings.push(msg);
    }
  }
  for (const key of Object.keys(target).sort()) {
    if (!(key in source)) out.errors.push(`${label} only in copy (not in source): ${key}`);
  }
}

/**
 * Compare a source fingerprint with the copy's. Any data difference is an
 * error. A definition that exists on both sides but prints differently is a
 * warning, unless its exact message is in `allow` (reviewed once, then
 * accepted — see scripts/db/schema-text-allowlist.json).
 */
export function compareFingerprints(
  source: Fingerprint,
  target: Fingerprint,
  allow: Set<string> = new Set(),
): Comparison {
  const out: Comparison = { errors: [], warnings: [] };
  const same = <T>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

  compareKeyed(
    'table',
    source.tables,
    target.tables,
    same,
    (k, a, b) =>
      a.rows !== b.rows
        ? `table ${k}: ${a.rows} rows in source, ${b.rows} in copy`
        : `table ${k}: same row count (${a.rows}) but different content`,
    'error',
    out,
    allow,
  );
  compareKeyed(
    'sequence',
    source.sequences,
    target.sequences,
    same,
    (k, a, b) => `sequence ${k}: ${a ?? 'unused'} in source, ${b ?? 'unused'} in copy`,
    'error',
    out,
    allow,
  );
  compareKeyed(
    'enum',
    source.enums,
    target.enums,
    same,
    (k, a, b) => `enum ${k}: [${a.join(', ')}] in source, [${b.join(', ')}] in copy`,
    'error',
    out,
    allow,
  );
  compareKeyed(
    'column',
    source.columns,
    target.columns,
    same,
    (k, a, b) => `column ${k}: "${a}" in source, "${b}" in copy`,
    'warning',
    out,
    allow,
  );
  compareKeyed(
    'index',
    source.indexes,
    target.indexes,
    same,
    (k, a, b) => `index ${k}: "${a}" in source, "${b}" in copy`,
    'warning',
    out,
    allow,
  );
  compareKeyed(
    'constraint',
    source.constraints,
    target.constraints,
    same,
    (k, a, b) => `constraint ${k}: "${a}" in source, "${b}" in copy`,
    'warning',
    out,
    allow,
  );
  if (source.migrations !== target.migrations) {
    out.errors.push(
      `drizzle migrations: ${source.migrations ?? 'missing'} in source, ${target.migrations ?? 'missing'} in copy`,
    );
  }
  return out;
}

export function totalRows(fp: Fingerprint): number {
  return Object.values(fp.tables).reduce((sum, t) => sum + t.rows, 0);
}
