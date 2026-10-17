/**
 * Safety checks for the nightly Supabase copy. Pure functions, unit-tested in
 * test/db-sync-guards.spec.ts — they are what stands between a typo in .env
 * and overwriting the wrong database.
 */

export interface ParsedDbUrl {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function parseDbUrl(raw: string): ParsedDbUrl {
  const url = new URL(raw.trim());
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(`not a postgres URL (protocol ${url.protocol})`);
  }
  return {
    host: url.hostname.toLowerCase(),
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres',
  };
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isLocalHost(host: string): boolean {
  return LOCAL_HOSTS.has(host);
}

export function isSupabaseHost(host: string): boolean {
  return host.endsWith('.supabase.com') || host.endsWith('.supabase.co');
}

/**
 * Refuse unless: the source is the database on this box, the target is a
 * Supabase host, and the live app (DATABASE_URL) still uses the source. The
 * last rule switches the job off by itself once production moves to
 * Supabase — after that, copying EC2 over Supabase would destroy live data.
 */
export function checkUrls(sourceRaw: string, targetRaw: string): string[] {
  const problems: string[] = [];
  let source: ParsedDbUrl | undefined;
  let target: ParsedDbUrl | undefined;
  try {
    source = parseDbUrl(sourceRaw);
  } catch (err) {
    problems.push(`DATABASE_URL is not usable: ${(err as Error).message}`);
  }
  try {
    target = parseDbUrl(targetRaw);
  } catch (err) {
    problems.push(`SUPABASE_SYNC_URL is not usable: ${(err as Error).message}`);
  }
  if (!source || !target) return problems;

  if (!isLocalHost(source.host)) {
    problems.push(
      `the live app's DATABASE_URL points at ${source.host}, not the database on this box — ` +
        'production may already have moved; the nightly copy must not run',
    );
  }
  if (!isSupabaseHost(target.host)) {
    problems.push(`SUPABASE_SYNC_URL host ${target.host} is not a Supabase host`);
  }
  if (target.port === 6543) {
    problems.push(
      'SUPABASE_SYNC_URL uses the transaction pooler (6543); the copy needs the session pooler (5432)',
    );
  }
  if (source.host === target.host && source.port === target.port && source.database === target.database) {
    problems.push('source and target are the same database');
  }
  return problems;
}

/**
 * Lines of the dump that must never reach Supabase. A whole-database plain
 * dump with --clean drops and recreates only the app's own schemas; anything
 * that drops `public`, an extension, or a role means pg_dump's output is not
 * what we reviewed, so the load is aborted before it commits.
 */
const FORBIDDEN_DUMP_LINES: { pattern: RegExp; reason: string }[] = [
  { pattern: /^\s*DROP\s+SCHEMA\s+(IF\s+EXISTS\s+)?"?public"?\s*(;|CASCADE)/i, reason: 'drops schema public' },
  { pattern: /^\s*DROP\s+EXTENSION\b/i, reason: 'drops an extension' },
  { pattern: /^\s*CREATE\s+EXTENSION\b/i, reason: 'creates an extension' },
  { pattern: /^\s*(DROP|CREATE|ALTER)\s+ROLE\b/i, reason: 'touches a role' },
  { pattern: /^\s*DROP\s+DATABASE\b/i, reason: 'drops a database' },
  { pattern: /^\s*CREATE\s+DATABASE\b/i, reason: 'creates a database' },
];

/** The reason a dump line is forbidden, or null when it is fine. */
export function forbiddenDumpLine(line: string): string | null {
  for (const { pattern, reason } of FORBIDDEN_DUMP_LINES) {
    if (pattern.test(line)) return reason;
  }
  return null;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * SQL appended to the load, inside the same transaction: Supabase serves every
 * table in `public` over its REST API to anyone holding the public anon key
 * unless Row Level Security is on. RLS with no policies blocks those roles;
 * the copy is loaded and later used by the `postgres` role, which owns the
 * tables and so is not affected.
 */
export function lockDownSql(schemas: string[]): string {
  const list = schemas.map(quoteLiteral).join(', ');
  return `
-- Lock the copy down (appended by scripts/db/sync-to-supabase.ts)
DO $lockdown$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN (${list}) LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schemaname, r.tablename);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    FOR r IN SELECT nspname FROM pg_namespace WHERE nspname IN (${list}) LOOP
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM anon, authenticated', r.nspname);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM anon, authenticated', r.nspname);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA %I FROM anon, authenticated', r.nspname);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM anon, authenticated', r.nspname);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON SEQUENCES FROM anon, authenticated', r.nspname);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON FUNCTIONS FROM anon, authenticated', r.nspname);
    END LOOP;
  END IF;
END
$lockdown$;
`;
}

/** Newest-first file names to delete so only the `keep` newest remain. */
export function filesToPrune(names: string[], keep: number): string[] {
  return [...names].sort().reverse().slice(keep);
}
