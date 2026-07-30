// Standalone (no app imports, no TS) — runs ON the EC2 box, one process per
// sample tick. Prints a single JSON line with everything monitor.ts needs.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

function meminfoField(text, name) {
  const m = text.match(new RegExp(`^${name}:\\s+(\\d+)\\s+kB`, 'm'));
  return m ? Number(m[1]) : null;
}

const loadavg = readFileSync('/proc/loadavg', 'utf8').trim().split(/\s+/).slice(0, 3).map(Number);
const meminfo = readFileSync('/proc/meminfo', 'utf8');
const statLine = readFileSync('/proc/stat', 'utf8').split('\n')[0];
// cpu  user nice system idle iowait irq softirq steal guest guest_nice
const cpuStat = statLine.trim().split(/\s+/).slice(1, 9).map(Number);

let pm2 = [];
try {
  const jlist = JSON.parse(execSync('pm2 jlist', { encoding: 'utf8' }));
  pm2 = jlist
    .filter((p) => p.name === 'aroha-api')
    .map((p) => ({
      restartTime: p.pm2_env?.restart_time,
      unstableRestarts: p.pm2_env?.unstable_restarts,
      memRss: p.monit?.memory,
      cpu: p.monit?.cpu,
    }));
} catch {
  // leave empty on parse failure — don't let a pm2 hiccup kill the sample
}

let pgConn = null;
try {
  const cmd =
    'cd /home/ec2-user/aroha-backend && export $(grep -E "^DATABASE_URL=" .env | xargs) && ' +
    'psql "$DATABASE_URL" -tAc "select count(*) from pg_stat_activity"';
  pgConn = Number(execSync(cmd, { encoding: 'utf8', shell: '/bin/bash' }).trim());
} catch {
  // Postgres/psql hiccup — leave null rather than aborting the sample
}

process.stdout.write(
  JSON.stringify({
    ts: Date.now(),
    loadavg,
    memAvailableKb: meminfoField(meminfo, 'MemAvailable'),
    swapFreeKb: meminfoField(meminfo, 'SwapFree'),
    cpuStat, // [user,nice,system,idle,iowait,irq,softirq,steal] jiffies, cumulative
    pm2,
    pgConn,
  }) + '\n',
);
