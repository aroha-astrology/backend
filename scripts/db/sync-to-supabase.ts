/**
 * Nightly copy of the production database (EC2 Postgres) into Supabase.
 * Production keeps running on EC2; the copy is refreshed whole every night and
 * proven identical before the run reports OK. Runbook: README "Supabase copy".
 *
 *   npx tsx scripts/db/sync-to-supabase.ts              full run: dump, load, verify
 *   npx tsx scripts/db/sync-to-supabase.ts --dry-run    dump to a file and check it; Supabase untouched
 *   npx tsx scripts/db/sync-to-supabase.ts --verify-only  compare source and copy as they are now
 *
 * Run from the backend root on the EC2 box (needs pg_dump/psql and .env with
 * DATABASE_URL + SUPABASE_SYNC_URL). Wired into cron by scripts/cron-db-sync-supabase.sh.
 *
 * How a full run stays exact and safe:
 *  1. checkUrls() refuses unless source = this box's database, target = Supabase
 *     session pooler, and the live app still uses the source.
 *  2. One REPEATABLE READ transaction on the source exports a snapshot; the
 *     source fingerprint and pg_dump both read that same snapshot.
 *  3. One transaction on Supabase: empty the app schemas, load the dump, lock
 *     the copy down (RLS), COMMIT — written only after pg_dump succeeded, so a
 *     cut-off stream rolls back and last night's copy stays. Forbidden dump
 *     lines (dropping public, extensions, roles) abort it. A size check first
 *     keeps the load under the Supabase Free 500 MB limit.
 *  4. The copy is fingerprinted and compared; any data difference fails the run.
 *     --verify-only compares live data, so rows written since the copy are
 *     expected differences there.
 */
import 'dotenv/config';
import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createGzip } from 'node:zlib';
import postgres from 'postgres';
import {
  SESSION_SETTINGS,
  appSchemas,
  compareFingerprints,
  listSchemas,
  takeFingerprint,
  totalRows,
  type Comparison,
  type Fingerprint,
} from './lib/fingerprint.js';
import {
  checkUrls,
  clearSchemasSql,
  clipMessage,
  diskBudgetProblem,
  filesToPrune,
  forbiddenDumpLine,
  lockDownSql,
  parseDbUrl,
} from './lib/guards.js';

type Mode = 'full' | 'dry-run' | 'verify-only';

const KEEP_DUMPS = 7;
const KEEP_REPORTS = 60;
const BACKUP_DIR = process.env.DB_SYNC_BACKUP_DIR || join(homedir(), 'db-backups');
const REPORT_DIR = join(BACKUP_DIR, 'reports');
const ALLOWLIST_PATH = join(process.cwd(), 'scripts', 'db', 'schema-text-allowlist.json');
// Peak size allowed during a load (old + new copy until COMMIT). Supabase Free
// turns the database read-only past 500 MB; keep a margin below that.
const MAX_BYTES = Number(process.env.SUPABASE_SYNC_MAX_MB || 450) * 1048576;

interface Report {
  mode: Mode;
  startedAt: string;
  finishedAt?: string;
  seconds?: number;
  ok: boolean;
  error?: string;
  schemas?: string[];
  tables?: number;
  rows?: number;
  dumpFile?: string;
  dumpBytes?: number;
  comparison?: Comparison;
  /** Not failures: things worth knowing (stray Supabase schemas, tables removed from the copy). */
  notes: string[];
  sourceBytes?: number;
  targetBytesBefore?: number;
  source?: Fingerprint;
}

function modeFromArgs(argv: string[]): Mode {
  if (argv.includes('--dry-run')) return 'dry-run';
  if (argv.includes('--verify-only')) return 'verify-only';
  return 'full';
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/** libpq environment for pg_dump/psql, so passwords never appear in `ps`. */
function libpqEnv(rawUrl: string, sslmode: 'disable' | 'prefer' | 'require'): NodeJS.ProcessEnv {
  const u = parseDbUrl(rawUrl);
  return {
    ...process.env,
    PGHOST: u.host,
    PGPORT: String(u.port),
    PGUSER: u.user,
    PGPASSWORD: u.password,
    PGDATABASE: u.database,
    PGSSLMODE: sslmode,
    PGCONNECT_TIMEOUT: '15',
    PGAPPNAME: 'aroha-supabase-copy',
  };
}

async function applySessionSettings(sql: postgres.ReservedSql): Promise<void> {
  for (const stmt of SESSION_SETTINGS) await sql.unsafe(stmt);
}

function waitForExit(child: ChildProcess, name: string, stderr: () => string): Promise<void> {
  return new Promise((resolve, reject) => {
    child.on('error', (err) => reject(new Error(`${name} could not start: ${err.message}`)));
    child.on('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${name} exited with ${code ?? signal}: ${stderr().trim().slice(-800)}`));
    });
  });
}

/**
 * Stream pg_dump (pinned to `snapshot`) into a gzip file and, unless dry-run,
 * into psql on the target inside one transaction, followed by the lock-down SQL.
 */
async function dumpAndLoad(opts: {
  sourceUrl: string;
  targetUrl: string;
  snapshot: string;
  schemas: string[];
  dumpPath: string;
  load: boolean;
}): Promise<number> {
  const partial = `${opts.dumpPath}.partial`;
  const dump = spawn(
    'pg_dump',
    [
      '--format=plain',
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--quote-all-identifiers',
      // Fail fast instead of queueing behind a migration's exclusive lock.
      '--lock-wait-timeout=60s',
      `--snapshot=${opts.snapshot}`,
    ],
    { env: libpqEnv(opts.sourceUrl, 'prefer'), stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let dumpErr = '';
  dump.stderr.on('data', (d) => (dumpErr += d));

  let psql: ChildProcess | undefined;
  let psqlErr = '';
  if (opts.load) {
    // Not --single-transaction: psql commits that at end of input even when the
    // input was cut short (pg_dump died, this process crashed). With an explicit
    // BEGIN and a COMMIT written only after pg_dump succeeded, a truncated
    // stream just closes the session and Postgres rolls the load back.
    psql = spawn('psql', ['--no-psqlrc', '--quiet', '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
      env: libpqEnv(opts.targetUrl, 'require'),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    psql.stdout!.resume();
    psql.stderr!.on('data', (d) => (psqlErr += d));
    psql.stdin!.on('error', () => undefined); // psql exiting early is reported via its exit code
  }

  const gzip = createGzip({ level: 6 });
  const file = createWriteStream(partial, { mode: 0o600 });
  gzip.pipe(file);
  const fileDone = new Promise<void>((resolve, reject) => {
    file.on('finish', resolve);
    file.on('error', reject);
  });

  const dumpExit = waitForExit(dump, 'pg_dump', () => dumpErr);
  const psqlExit = psql ? waitForExit(psql, 'psql', () => psqlErr) : Promise.resolve();
  // A rejected exit promise is awaited below; keep Node from flagging it early.
  dumpExit.catch(() => undefined);
  psqlExit.catch(() => undefined);

  // psql stops at the first SQL error (ON_ERROR_STOP); after that its stdin
  // never drains again, so every wait also ends when psql has exited.
  let psqlClosed = false;
  const psqlGone = new Promise<void>((resolve) =>
    psql ? psql.on('close', () => ((psqlClosed = true), resolve())) : undefined,
  );
  const write = async (stream: NodeJS.WritableStream, chunk: string | Buffer) => {
    if (stream === psql?.stdin && psqlClosed) throw new Error(`psql stopped: ${psqlErr.trim().slice(-800)}`);
    if (!stream.write(chunk)) await Promise.race([new Promise((r) => stream.once('drain', r)), psqlGone]);
  };

  // Any failure from here until COMMIT is written: kill psql (its open
  // transaction rolls back), stop pg_dump, drop the partial file.
  const abort = async (reason: string): Promise<never> => {
    psql?.kill('SIGKILL');
    dump.kill('SIGTERM');
    gzip.end();
    await Promise.allSettled([dumpExit, psqlExit, fileDone]);
    rmSync(partial, { force: true });
    throw new Error(`load aborted, nothing changed in Supabase — ${reason}`);
  };

  // pg_dump's bytes are passed on untouched; lines are only split off on the
  // side to be checked (re-joining split lines could alter a stray \r in data).
  let carry = '';
  const check = (text: string) => {
    for (const line of text.split('\n')) {
      const reason = forbiddenDumpLine(line);
      if (reason) throw new Error(`dump ${reason}: ${line.trim().slice(0, 200)}`);
    }
  };

  try {
    if (psql) await write(psql.stdin!, `BEGIN;\n${clearSchemasSql(opts.schemas)}`);
    for await (const chunk of dump.stdout as AsyncIterable<Buffer>) {
      const text = carry + chunk.toString('utf8');
      const cut = text.lastIndexOf('\n');
      // A line is checked once complete, before the chunk that ends it is
      // forwarded; the unfinished tail waits for the next chunk.
      check(cut === -1 ? '' : text.slice(0, cut));
      carry = cut === -1 ? text : text.slice(cut + 1);
      await write(gzip, chunk);
      if (psql) await write(psql.stdin!, chunk);
    }
    check(carry);
    await dumpExit;
    // pg_dump finished cleanly: only now may the transaction be committed.
    if (psql) await write(psql.stdin!, lockDownSql(opts.schemas));
  } catch (err) {
    return await abort((err as Error).message);
  }

  gzip.end();
  await fileDone;
  if (psql) {
    try {
      await write(psql.stdin!, 'COMMIT;\n');
      psql.stdin!.end();
      await psqlExit;
    } catch (err) {
      psql.kill('SIGKILL');
      rmSync(partial, { force: true });
      throw new Error(`load failed and was rolled back, Supabase unchanged — ${(err as Error).message}`);
    }
  }
  renameSync(partial, opts.dumpPath);
  return statSync(opts.dumpPath).size;
}

/** A run killed mid-dump leaves a .partial file behind; never a usable backup. */
function removePartials(dir: string): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.partial')) rmSync(join(dir, name), { force: true });
  }
}

function prune(dir: string, prefix: string, keep: number): void {
  if (!existsSync(dir)) return;
  const names = readdirSync(dir).filter((n) => n.startsWith(prefix) && !n.endsWith('.partial'));
  for (const name of filesToPrune(names, keep)) rmSync(join(dir, name), { force: true });
}

function loadAllowlist(): Set<string> {
  if (!existsSync(ALLOWLIST_PATH)) return new Set();
  const parsed = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8')) as { accepted?: string[] };
  return new Set(parsed.accepted ?? []);
}

/** True when Telegram accepted the message. */
async function notify(title: string, message: string): Promise<boolean> {
  try {
    const { sendAlert } = await import('../../src/lib/notifications/telegram.js');
    return await sendAlert(title, clipMessage(message));
  } catch (err) {
    console.error('telegram alert failed:', (err as Error).message);
    return false;
  }
}

function summarise(report: Report): string {
  const lines: string[] = [];
  if (report.tables !== undefined) {
    lines.push(`${report.tables} tables, ${report.rows} rows`);
  }
  if (report.dumpBytes !== undefined) lines.push(`dump ${(report.dumpBytes / 1048576).toFixed(1)} MB (gzip)`);
  if (report.seconds !== undefined) lines.push(`${report.seconds} s`);
  const warnings = report.comparison?.warnings.length ?? 0;
  if (warnings) lines.push(`${warnings} definition-text warning(s), see report`);
  for (const n of report.notes) lines.push(`note: ${n}`);
  if (report.error) lines.push(report.error);
  for (const e of report.comparison?.errors.slice(0, 10) ?? []) lines.push(`- ${e}`);
  const more = (report.comparison?.errors.length ?? 0) - 10;
  if (more > 0) lines.push(`... and ${more} more`);
  return lines.join('\n');
}

async function main(): Promise<number> {
  const mode = modeFromArgs(process.argv.slice(2));
  const started = new Date();
  const report: Report = { mode, startedAt: started.toISOString(), ok: false, notes: [] };
  mkdirSync(REPORT_DIR, { recursive: true, mode: 0o700 });
  removePartials(BACKUP_DIR);

  const sourceUrl = process.env.DATABASE_URL ?? '';
  const targetUrl = process.env.SUPABASE_SYNC_URL ?? '';

  let source: postgres.Sql | undefined;
  let target: postgres.Sql | undefined;
  try {
    const problems = checkUrls(sourceUrl, targetUrl);
    if (problems.length) throw new Error(`refused: ${problems.join('; ')}`);

    source = postgres(sourceUrl, { max: 1, prepare: false, ssl: false, connect_timeout: 15, onnotice: () => undefined });
    target = postgres(targetUrl, { max: 1, prepare: false, ssl: 'require', connect_timeout: 15, onnotice: () => undefined });

    const schemas = appSchemas(await listSchemas(source));
    report.schemas = schemas;

    // Schemas only Supabase has are never touched by the load or compared;
    // they are only worth a mention (e.g. a new Supabase-managed schema).
    const strays = appSchemas(await listSchemas(target)).filter((s) => !schemas.includes(s));
    if (strays.length) report.notes.push(`Supabase has extra schemas, left untouched: ${strays.join(', ')}`);

    const allow = loadAllowlist();
    const src = await source.reserve();
    const dst = await target.reserve();
    try {
      await src.unsafe('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await applySessionSettings(src);
      const [{ snapshot }] = (await src.unsafe('SELECT pg_export_snapshot() AS snapshot')) as unknown as [{ snapshot: string }];

      const sourceFp = await takeFingerprint(src, schemas);
      report.source = sourceFp;
      report.tables = Object.keys(sourceFp.tables).length;
      report.rows = totalRows(sourceFp);

      if (mode !== 'verify-only') {
        const sizeSql = 'SELECT pg_database_size(current_database())::text AS bytes';
        const [srcSize] = (await src.unsafe(sizeSql)) as unknown as [{ bytes: string }];
        const [dstSize] = (await dst.unsafe(sizeSql)) as unknown as [{ bytes: string }];
        report.sourceBytes = Number(srcSize.bytes);
        report.targetBytesBefore = Number(dstSize.bytes);
        if (mode === 'full') {
          const tooBig = diskBudgetProblem(report.targetBytesBefore, report.sourceBytes, MAX_BYTES);
          if (tooBig) throw new Error(`refused, copy not made: ${tooBig}`);
        }

        // Tables the source no longer has (dropped by a migration) are removed
        // from the copy by the load; name them so it's never a surprise.
        const copyTables = await dst<{ name: string }[]>`
          select schemaname || '.' || tablename as name from pg_tables where schemaname in ${dst(schemas)}`;
        const removed = copyTables.map((t) => t.name).filter((t) => !(t in sourceFp.tables));
        if (removed.length && mode === 'full') {
          report.notes.push(`removed from the copy (no longer in production): ${removed.join(', ')}`);
        }

        const dumpPath = join(BACKUP_DIR, `aroha-${stamp(started)}.sql.gz`);
        report.dumpFile = dumpPath;
        report.dumpBytes = await dumpAndLoad({
          sourceUrl,
          targetUrl,
          snapshot,
          schemas,
          dumpPath,
          load: mode === 'full',
        });
        prune(BACKUP_DIR, 'aroha-', KEEP_DUMPS);
      }
      await src.unsafe('COMMIT');

      if (mode !== 'dry-run') {
        await applySessionSettings(dst);
        const targetFp = await takeFingerprint(dst, schemas);
        report.comparison = compareFingerprints(sourceFp, targetFp, allow);
        if (report.comparison.errors.length) {
          throw new Error(
            mode === 'verify-only'
              ? `${report.comparison.errors.length} difference(s) between production now and the copy (rows written since the last copy are expected)`
              : `copy does NOT match the source: ${report.comparison.errors.length} difference(s)`,
          );
        }
      }
      report.ok = true;
    } finally {
      src.release();
      dst.release();
    }
  } catch (err) {
    report.error = (err as Error).message;
  } finally {
    await Promise.allSettled([source?.end({ timeout: 5 }), target?.end({ timeout: 5 })]);
  }

  const finished = new Date();
  report.finishedAt = finished.toISOString();
  report.seconds = Math.round((finished.getTime() - started.getTime()) / 1000);
  const reportPath = join(REPORT_DIR, `report-${stamp(started)}-${mode}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
  prune(REPORT_DIR, 'report-', KEEP_REPORTS);

  const label = mode === 'full' ? 'DB copy to Supabase' : `DB copy (${mode})`;
  const title = report.ok ? `${label}: OK` : `${label}: FAILED`;
  const body = `${summarise(report)}\nreport: ${reportPath}`;
  console.log(`${title}\n${body}`);
  const sent = await notify(title, body);
  // Exit codes for cron-db-sync-supabase.sh: 0 OK and reported, 2 FAILED and
  // reported, 10 OK but Telegram didn't take it, 11 FAILED and not reported.
  // Anything else means the script itself crashed. The wrapper alerts for
  // everything except 0 and 2.
  if (report.ok) return sent ? 0 : 10;
  return sent ? 2 : 11;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
