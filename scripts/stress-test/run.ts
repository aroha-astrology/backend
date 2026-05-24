#!/usr/bin/env tsx
/**
 * Stress test Phase 2: run 3 concurrent rounds against production and emit
 * a full detailed report (latency breakdown, DB verification, credit accounting,
 * per-user timelines, cross-round comparison, bottleneck verdict).
 *
 * Usage:
 *   npx tsx scripts/stress-test/run.ts --prod            (all 3 rounds)
 *   npx tsx scripts/stress-test/run.ts --prod --round3   (round 3 only)
 */

import './config';
import * as fs from 'fs';
import * as path from 'path';
import { signIn } from './lib/auth';
import { createUserClient } from './lib/httpClient';
import { ResultStore, p, avg, ms, fmt, UserResult, ReportResult, ChatResult, PollEntry } from './lib/metrics';
import { confirm } from './lib/confirm';
import { assertEnv } from './lib/env';
import { createAdmin } from './lib/supabaseAdmin';
import { BASE_URL, ROUNDS, POLL_INTERVAL_MS, MAX_WAIT_MS, CHAT_QUESTIONS } from './config';
import type { SeededUser } from './seed';

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function loadUsers(): SeededUser[] {
  const usersPath = path.join(__dirname, 'results', 'users.json');
  if (!fs.existsSync(usersPath)) {
    console.error('[run] results/users.json not found. Run seed.ts --prod first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(usersPath, 'utf-8'));
}

function statusIcon(status: string): string {
  if (status === 'completed') return '✅';
  if (status === 'error' || status === 'failed') return '❌';
  if (status === 'TIMEOUT') return '⏱';
  if (status === 'INSUFFICIENT_TOKENS') return '💸';
  return '⏳';
}

// ─────────────────────────────────────────────────────────
// Report flow for one user
// ─────────────────────────────────────────────────────────

async function runReportFlow(
  user: SeededUser,
  tier: 'basic' | 'standard',
  cookieHeader: string,
): Promise<ReportResult> {
  const client = createUserClient(cookieHeader);
  const wallStart = Date.now();
  const result: ReportResult = {
    tier,
    http_generate: 0,
    wall_clock_start: wallStart,
    t_generate_ms: 0,
    final_status: 'unknown',
    poll_count: 0,
    poll_log: [],
    progress_seen: [],
  };

  const t0 = Date.now();
  const genRes = await client.post('/api/reports/generate', {
    chartId: user.chartId,
    tier,
    language: 'en',
  });
  result.t_generate_ms = Date.now() - t0;
  result.http_generate = genRes.status;

  if (genRes.status === 402) {
    result.error_code = 'INSUFFICIENT_TOKENS';
    result.final_status = 'failed';
    return result;
  }
  if (genRes.status !== 200) {
    result.error_code = 'ERROR_STATUS';
    result.error_msg = JSON.stringify(genRes.data);
    result.final_status = 'failed';
    return result;
  }

  const genData = (genRes.data as Record<string, unknown>).data as Record<string, unknown>;
  result.report_id = genData?.report_id as string;
  const tGenerateReturned = Date.now();

  // Poll status until completed / error / timeout
  let tGeneratingSeen: number | null = null;
  let tAiReadySeen: number | null = null;
  let tCompletedSeen: number | null = null;
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    result.poll_count++;

    try {
      const statusRes = await client.get(`/api/reports/status/${result.report_id}`);
      if (statusRes.status !== 200) continue;
      const statusData = (statusRes.data as Record<string, unknown>).data as Record<string, unknown>;
      const status = statusData?.status as string;
      result.final_status = status;

      const progress = typeof statusData?.progress === 'string' ? statusData.progress : undefined;
      result.poll_log.push({ t_offset_ms: Date.now() - wallStart, status, progress: progress ?? undefined });

      if (progress && !result.progress_seen.includes(progress)) {
        result.progress_seen.push(progress);
      }

      if (status === 'generating' && !tGeneratingSeen) {
        tGeneratingSeen = Date.now();
        result.t_queue_ms = tGeneratingSeen - tGenerateReturned;
      }
      if ((status === 'ai_ready') && !tAiReadySeen) {
        tAiReadySeen = Date.now();
        if (tGeneratingSeen) result.t_process_ms = tAiReadySeen - tGeneratingSeen;
      }
      if (status === 'completed' || status === 'ready') {
        tCompletedSeen = Date.now();
        if (tAiReadySeen) result.t_render_ms = tCompletedSeen - tAiReadySeen;
        result.t_e2e_ms = tCompletedSeen - t0;
        result.final_status = 'completed'; // normalise both 'ready' and 'completed' → 'completed'
        break;
      }
      if (status === 'error') {
        result.error_code = 'ERROR_STATUS';
        result.error_msg = statusData?.error as string | undefined;
        result.t_e2e_ms = Date.now() - t0;
        break;
      }
    } catch {
      // transient — keep polling
    }
  }

  if (!tCompletedSeen && result.final_status !== 'error' && result.final_status !== 'failed') {
    result.error_code = 'TIMEOUT';
    result.t_e2e_ms = Date.now() - t0;
  }

  return result;
}

// ─────────────────────────────────────────────────────────
// Chat flow for one user (round 3)
// ─────────────────────────────────────────────────────────

async function runChatSequence(
  user: SeededUser,
  cookieHeader: string,
): Promise<ChatResult[]> {
  const client = createUserClient(cookieHeader);
  const results: ChatResult[] = [];

  for (let i = 0; i < CHAT_QUESTIONS.length; i++) {
    const sr = await client.stream('/api/chat/stream', {
      question: CHAT_QUESTIONS[i],
      chartId: user.chartId,
      language: 'en',
      mode: 'text',
    });

    results.push({
      msg_idx: i,
      question: CHAT_QUESTIONS[i],
      http_status: sr.status,
      error_code:
        sr.status === 402 ? 'INSUFFICIENT_TOKENS' :
        sr.status === 401 ? 'UNAUTHORIZED' :
        sr.status >= 500 ? 'SERVER_ERROR' :
        sr.errorBody   ? 'NETWORK' : undefined,
      t_first_token_ms: sr.firstTokenMs ?? undefined,
      t_full_ms: sr.fullMs,
      token_count: sr.tokenCount,
    });

    if (sr.status === 402 || sr.status === 401) break;
  }

  return results;
}

// ─────────────────────────────────────────────────────────
// Round runner
// ─────────────────────────────────────────────────────────

async function runRound(
  roundConfig: typeof ROUNDS[number],
  users: SeededUser[],
  store: ResultStore,
) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[${roundConfig.name}] tier=${roundConfig.reportTier}  users=[${roundConfig.userIndices}]  chat=${roundConfig.chatMessagesPerUser}`);
  console.log('─'.repeat(60));

  const tasks = roundConfig.userIndices.map(async (idx) => {
    const user = users[idx];
    if (!user) { console.error(`  [${roundConfig.name}] No user at index ${idx}`); return; }

    let cookieHeader: string;
    try {
      const sess = await signIn(user.email, user.password);
      cookieHeader = sess.cookieHeader;
    } catch (e) {
      console.error(`  [${roundConfig.name}][u${idx}] signIn failed: ${(e as Error).message}`);
      return;
    }

    const reportPromise = runReportFlow(user, roundConfig.reportTier, cookieHeader);
    const chatPromise = roundConfig.chatMessagesPerUser > 0
      ? runChatSequence(user, cookieHeader)
      : Promise.resolve(undefined as ChatResult[] | undefined);

    const [report, chats] = await Promise.all([reportPromise, chatPromise]);

    const result: UserResult = {
      user_idx: idx,
      email: user.email,
      name: user.name,
      round: roundConfig.name,
      report,
      chats: chats ?? undefined,
    };
    store.append(result);

    const icon = statusIcon(report.error_code ?? report.final_status);
    console.log(
      `  ${icon} u${idx}(${user.name.padEnd(9)}) ${roundConfig.name} | ` +
      `e2e:${ms(report.t_e2e_ms).padStart(7)} | ` +
      `queue:${ms(report.t_queue_ms).padStart(6)} | ` +
      `process:${ms(report.t_process_ms).padStart(7)} | ` +
      `render:${ms(report.t_render_ms).padStart(6)} | ` +
      `${report.error_code ?? report.final_status}`
    );
    if (chats?.length) {
      for (const c of chats) {
        const ci = statusIcon(c.error_code ?? (c.http_status === 200 ? 'completed' : 'error'));
        console.log(`     ${ci} chat[${c.msg_idx + 1}] first-token:${ms(c.t_first_token_ms).padStart(6)} full:${ms(c.t_full_ms).padStart(7)} tokens:${c.token_count ?? 0}`);
      }
    }
  });

  await Promise.all(tasks);
  console.log(`\n[${roundConfig.name}] Complete`);
}

// ─────────────────────────────────────────────────────────
// DB verification (post-run)
// ─────────────────────────────────────────────────────────

interface DbVerification {
  reportRows: Array<{ user_id: string; report_type: string; status: string; count: string }>;
  creditRows: Array<{ user_id: string; debited: number; credited: number }>;
  allUserIds: string[];
}

async function verifyDb(users: SeededUser[]): Promise<DbVerification> {
  const admin = createAdmin();
  const allUserIds = users.map((u) => u.id);

  const { data: reportRows } = await admin
    .from('generated_reports')
    .select('user_id, report_type, status')
    .in('user_id', allUserIds);

  // Group by user_id + report_type + status
  const grouped: Record<string, number> = {};
  for (const row of (reportRows ?? [])) {
    const key = `${row.user_id}|${row.report_type}|${row.status}`;
    grouped[key] = (grouped[key] ?? 0) + 1;
  }
  const reportAgg = Object.entries(grouped).map(([k, count]) => {
    const [user_id, report_type, status] = k.split('|');
    return { user_id, report_type, status, count: String(count) };
  });

  const { data: txRows } = await admin
    .from('credit_transactions')
    .select('user_id, amount, type')
    .in('user_id', allUserIds);

  const creditMap: Record<string, { debited: number; credited: number }> = {};
  for (const tx of (txRows ?? [])) {
    if (!creditMap[tx.user_id]) creditMap[tx.user_id] = { debited: 0, credited: 0 };
    if (tx.amount < 0 || tx.type?.includes('debit')) {
      creditMap[tx.user_id].debited += Math.abs(tx.amount as number);
    } else {
      creditMap[tx.user_id].credited += Math.abs(tx.amount as number);
    }
  }
  const creditRows = Object.entries(creditMap).map(([user_id, v]) => ({ user_id, ...v }));

  return { reportRows: reportAgg, creditRows, allUserIds };
}

// ─────────────────────────────────────────────────────────
// Full detailed markdown report
// ─────────────────────────────────────────────────────────

function buildReport(
  store: ResultStore,
  runDir: string,
  users: SeededUser[],
  dbVerif: DbVerification,
  runStart: number,
  runEnd: number,
): string {
  const results = store.getAll();
  const ts = path.basename(runDir);
  const totalDuration = runEnd - runStart;

  // ── Helpers ────────────────────────────────────────────

  function rows(roundName: string) {
    return results.filter((r) => r.round === roundName);
  }

  function successRows(roundName: string) {
    return rows(roundName).filter((r) => r.report.final_status === 'completed');
  }

  function latStats(values: number[]) {
    if (!values.length) return { min: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    return {
      min: sorted[0],
      avg: avg(values),
      p50: p(values, 50),
      p95: p(values, 95),
      p99: p(values, 99),
      max: sorted[sorted.length - 1],
    };
  }

  // ── 1. Header ──────────────────────────────────────────

  const header = `# 🔬 Stress Test Report

**Run ID**: \`${ts}\`
**Date**: ${new Date(runStart).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
**Total duration**: ${ms(totalDuration)}
**Target**: ${BASE_URL} ⚠️ **PRODUCTION**

---

## ⚙️ Configuration

| Parameter | Value |
|-----------|-------|
| Target URL | ${BASE_URL} |
| Reports backend | NVIDIA NIM \`llama-3.3-nemotron-super-49b-v1\` |
| Chat backend | NVIDIA NIM (separate key pool — keys 3+4) |
| NIM report keys | 2 (NVIDIA_NIM_REPORT_API_KEY + NVIDIA_NIM_API_KEY) |
| NIM concurrency cap | 12 parallel calls per report process route |
| Dummy users seeded | 10 (stresstest+0..9@jyotish.local) |
| Credits per user | 25 (signup 2 + top-up 23) |
| Poll interval | ${POLL_INTERVAL_MS}ms |
| Max wait per report | ${MAX_WAIT_MS / 1000}s |

### Round Config

| Round | Users | Indices | Tier | Credits/user | Chat msgs |
|-------|-------|---------|------|-------------|-----------|
| round_1 | 3 | 0,1,2 | kundli_basic (1 cr) | 1 | 0 |
| round_2 | 5 | 0,1,2,3,4 | kundli_standard (2 cr) | 2 | 0 |
| round_3 | 5 | 5,6,7,8,9 | kundli_basic (1 cr) + chat | 1+1 (session) | 3 |

`;

  // ── 2. Round summary table ─────────────────────────────

  function roundSummaryRow(name: string, tier: string) {
    const all = rows(name);
    const ok = successRows(name);
    const fail = all.filter((r) => r.report.final_status !== 'completed');
    const e2e = ok.map((r) => r.report.t_e2e_ms!).filter(Boolean);
    const stats = latStats(e2e);
    const successRate = all.length > 0 ? Math.round((ok.length / all.length) * 100) : 0;
    return `| ${name} | ${tier} | ${all.length} | ${ok.length} | ${fail.length} | ${successRate}% | ${ms(stats.min)} | ${ms(stats.avg)} | ${ms(stats.p50)} | ${ms(stats.p95)} | ${ms(stats.p99)} | ${ms(stats.max)} |`;
  }

  const roundSummary = `---

## 📊 Round Summary

| Round | Tier | Total | ✅ OK | ❌ Fail | Rate | Min | Avg | p50 | p95 | p99 | Max |
|-------|------|-------|-------|---------|------|-----|-----|-----|-----|-----|-----|
${roundSummaryRow('round_1', 'basic')}
${roundSummaryRow('round_2', 'standard')}
${roundSummaryRow('round_3', 'basic+chat')}

`;

  // ── 3. Phase latency breakdown ─────────────────────────

  function phaseRow(name: string) {
    const ok = successRows(name);
    if (!ok.length) return `| ${name} | — | — | — | — | — | — |`;
    const gen   = latStats(ok.map((r) => r.report.t_generate_ms).filter(Boolean) as number[]);
    const queue = latStats(ok.map((r) => r.report.t_queue_ms!).filter(Boolean) as number[]);
    const proc  = latStats(ok.map((r) => r.report.t_process_ms!).filter(Boolean) as number[]);
    const rend  = latStats(ok.map((r) => r.report.t_render_ms!).filter(Boolean) as number[]);
    return [
      `| ${name} | **t_generate** | ${ms(gen.min)} | ${ms(gen.avg)} | ${ms(gen.p50)} | ${ms(gen.p95)} | ${ms(gen.max)} |`,
      `| | **t_queue** | ${ms(queue.min)} | ${ms(queue.avg)} | ${ms(queue.p50)} | ${ms(queue.p95)} | ${ms(queue.max)} |`,
      `| | **t_process** | ${ms(proc.min)} | ${ms(proc.avg)} | ${ms(proc.p50)} | ${ms(proc.p95)} | ${ms(proc.max)} |`,
      `| | **t_render** | ${ms(rend.min)} | ${ms(rend.avg)} | ${ms(rend.p50)} | ${ms(rend.p95)} | ${ms(rend.max)} |`,
    ].join('\n');
  }

  const phaseSec = `---

## ⏱ Phase Latency Breakdown

> **t_generate** = API call duration (queue POST → 200 returned)
> **t_queue** = time between generate returning and report entering \`generating\` state (Vercel \`after()\` dispatch delay)
> **t_process** = \`generating\` → \`ai_ready\` (20 parallel NIM calls)
> **t_render** = \`ai_ready\` → \`completed\` (PDF generation)

| Round | Phase | Min | Avg | p50 | p95 | Max |
|-------|-------|-----|-----|-----|-----|-----|
${phaseRow('round_1')}
${phaseRow('round_2')}
${phaseRow('round_3')}

`;

  // ── 4. Per-user full detail table ──────────────────────

  const perUserRows = results.map((r) => {
    const icon = statusIcon(r.report.error_code ?? r.report.final_status);
    const prog = r.report.progress_seen.length > 0
      ? r.report.progress_seen.join(' → ')
      : '—';
    return `| ${icon} | u${r.user_idx} | ${r.name} | ${r.round} | ${r.report.tier} | \`${r.report.report_id?.slice(0, 8) ?? '—'}\` | ${r.report.final_status} | ${r.report.error_code ?? '—'} | ${ms(r.report.t_generate_ms)} | ${ms(r.report.t_queue_ms)} | ${ms(r.report.t_process_ms)} | ${ms(r.report.t_render_ms)} | ${ms(r.report.t_e2e_ms)} | ${r.report.poll_count} | ${prog} |`;
  }).join('\n');

  const perUserSec = `---

## 👤 Per-User Detail

| | Idx | Name | Round | Tier | ReportID | Status | Error | t_gen | t_queue | t_process | t_render | t_e2e | Polls | NIM Progress |
|---|-----|------|-------|------|----------|--------|-------|-------|---------|----------|---------|-------|-------|-------------|
${perUserRows}

`;

  // ── 5. Per-user poll timeline ──────────────────────────

  function userTimeline(r: UserResult): string {
    if (!r.report.poll_log.length) return `_No poll data_\n`;
    const rows = r.report.poll_log.map((entry) => {
      const bar = '█'.repeat(Math.min(Math.round(entry.t_offset_ms / 5000), 40));
      return `| ${ms(entry.t_offset_ms).padStart(7)} | ${entry.status.padEnd(12)} | ${entry.progress ?? '—'} | ${bar} |`;
    });
    return `| Offset | Status | NIM Progress | Timeline (each █ ≈ 5s) |\n|--------|--------|-------------|------------------------|\n${rows.join('\n')}\n`;
  }

  const timelineSec = `---

## 🕐 Per-User Poll Timelines

${results.map((r) => {
    return `### u${r.user_idx} — ${r.name} (${r.round}, ${r.report.tier}) ${statusIcon(r.report.error_code ?? r.report.final_status)}\n\n**Report ID**: \`${r.report.report_id ?? 'N/A'}\`  **Status**: ${r.report.final_status}  **e2e**: ${ms(r.report.t_e2e_ms)}\n\n${userTimeline(r)}`;
  }).join('\n')}`;

  // ── 6. Cross-round comparison (users 0-2 in R1 + R2) ──

  const crossRows = [0, 1, 2].map((idx) => {
    const r1 = results.find((r) => r.user_idx === idx && r.round === 'round_1');
    const r2 = results.find((r) => r.user_idx === idx && r.round === 'round_2');
    if (!r1 || !r2) return '';
    const delta = r2.report.t_process_ms != null && r1.report.t_process_ms != null
      ? r2.report.t_process_ms - r1.report.t_process_ms
      : null;
    const arrow = delta == null ? '?' : delta > 0 ? `+${ms(delta)} slower` : `${ms(-delta)} faster`;
    return `| u${idx} | ${r1.name} | ${ms(r1.report.t_process_ms)} | ${ms(r2.report.t_process_ms)} | ${arrow} | ${ms(r1.report.t_e2e_ms)} | ${ms(r2.report.t_e2e_ms)} |`;
  }).filter(Boolean).join('\n');

  const crossSec = `---

## 🔄 Cross-Round Comparison (Users 0–2: R1 basic vs R2 standard)

Users 0–2 ran in **both** round_1 (basic, 1 credit) and round_2 (standard, 2 credits).
This compares their t_process and e2e between rounds, isolating the effect of tier/concurrency.

| Idx | Name | R1 t_process | R2 t_process | Δ process | R1 e2e | R2 e2e |
|-----|------|-------------|-------------|----------|--------|--------|
${crossRows || '_No data_'}

> If R2 t_process is much slower, the bottleneck is NIM saturation (5 concurrent users × more calls/token).

`;

  // ── 7. Chat latencies ──────────────────────────────────

  const chatResultRows = results
    .filter((r) => r.chats?.length)
    .flatMap((r) =>
      r.chats!.map((c) => {
        const icon = c.http_status === 200 ? '✅' : '❌';
        const q = c.question.length > 40 ? c.question.slice(0, 40) + '…' : c.question;
        return `| ${icon} | u${r.user_idx} | ${r.name} | ${c.msg_idx + 1} | _${q}_ | ${c.http_status} | ${c.error_code ?? '—'} | ${ms(c.t_first_token_ms)} | ${ms(c.t_full_ms)} | ${c.token_count ?? 0} |`;
      })
    ).join('\n');

  const chatOk = results.flatMap((r) => r.chats ?? []).filter((c) => c.http_status === 200);
  const chatFtStats = latStats(chatOk.map((c) => c.t_first_token_ms!).filter(Boolean) as number[]);
  const chatFullStats = latStats(chatOk.map((c) => c.t_full_ms!).filter(Boolean) as number[]);

  const chatSec = `---

## 💬 Chat Performance (Round 3)

> Chat uses NIM keys 3+4 (separate from report keys 1+2).
> Credit: 1 token per **3-minute session** — all 3 messages within 3 min = 1 credit total.

### Summary

| Metric | First Token | Full Response |
|--------|------------|---------------|
| Min | ${ms(chatFtStats.min)} | ${ms(chatFullStats.min)} |
| Avg | ${ms(chatFtStats.avg)} | ${ms(chatFullStats.avg)} |
| p50 | ${ms(chatFtStats.p50)} | ${ms(chatFullStats.p50)} |
| p95 | ${ms(chatFtStats.p95)} | ${ms(chatFullStats.p95)} |
| Max | ${ms(chatFtStats.max)} | ${ms(chatFullStats.max)} |

### Per-Message Detail

| | User | Name | Msg | Question | HTTP | Error | First Token | Full | Tokens |
|---|------|------|-----|----------|------|-------|------------|------|--------|
${chatResultRows || '_No chat data_'}

`;

  // ── 8. Error breakdown ─────────────────────────────────

  const allErrors: string[] = [];
  const errorCounts: Record<string, number> = {};

  for (const r of results) {
    if (r.report.error_code) {
      const key = r.report.error_code;
      errorCounts[key] = (errorCounts[key] ?? 0) + 1;
      allErrors.push(`- **u${r.user_idx}** (${r.name}) ${r.round}: \`${key}\` — ${r.report.error_msg ?? 'no detail'}`);
    }
    for (const c of r.chats ?? []) {
      if (c.error_code) {
        const key = `chat:${c.error_code}`;
        errorCounts[key] = (errorCounts[key] ?? 0) + 1;
        allErrors.push(`- **u${r.user_idx}** (${r.name}) ${r.round} chat[${c.msg_idx + 1}]: \`${c.error_code}\``);
      }
    }
  }

  const errorCountTable = Object.entries(errorCounts)
    .map(([k, v]) => `| \`${k}\` | ${v} |`)
    .join('\n');

  const errorSec = `---

## 🚨 Error Breakdown

${Object.keys(errorCounts).length === 0 ? '**No errors.** All requests completed successfully.' : `
### Error Count Summary

| Error Code | Count |
|-----------|-------|
${errorCountTable}

### Error Detail

${allErrors.join('\n')}
`}

`;

  // ── 9. DB verification ─────────────────────────────────

  // Map userId → user idx + name for readable output
  const userMap: Record<string, SeededUser> = {};
  for (const u of users) userMap[u.id] = u;

  const dbReportRows = dbVerif.reportRows
    .sort((a, b) => a.user_id.localeCompare(b.user_id))
    .map((row) => {
      const u = userMap[row.user_id];
      const label = u ? `u${u.idx} (${u.name})` : row.user_id.slice(0, 8);
      return `| ${label} | ${row.report_type} | ${row.status} | ${row.count} |`;
    }).join('\n');

  const expectedRows = 3 + 5 + 5; // 13
  const actualRows = dbVerif.reportRows.reduce((s, r) => s + parseInt(r.count, 10), 0);
  const rowsMatch = actualRows === expectedRows ? '✅' : `⚠️ expected ${expectedRows}`;

  // Credit accounting
  const creditRows = dbVerif.creditRows.map((row) => {
    const u = userMap[row.user_id];
    const label = u ? `u${u.idx} (${u.name})` : row.user_id.slice(0, 8);
    // Expected: idx 0-2 = 3 debits; idx 3-4 = 2; idx 5-9 = 1+1 = 2
    const expectedDebit = u
      ? ([0, 1, 2].includes(u.idx) ? 3 : [3, 4].includes(u.idx) ? 2 : 2)
      : '?';
    const drift = typeof expectedDebit === 'number' ? row.debited - expectedDebit : 'N/A';
    const driftStr = typeof drift === 'number'
      ? (drift === 0 ? '✅ 0' : `⚠️ ${drift > 0 ? '+' : ''}${drift}`)
      : drift;
    return `| ${label} | ${row.credited} | ${row.debited} | ${expectedDebit} | ${driftStr} |`;
  }).join('\n');

  const totalDebited = dbVerif.creditRows.reduce((s, r) => s + r.debited, 0);
  const expectedDebit = 3 * 3 + 2 * 2 + 5 * 2; // 9+4+10=23
  const totalDrift = totalDebited - expectedDebit;

  const dbSec = `---

## 🗄️ Database Verification

### generated_reports

Expected total rows: **13** (3 basic + 5 standard + 5 basic = 13 distinct reports)
Actual rows: **${actualRows}** ${rowsMatch}

| User | report_type | status | count |
|------|-------------|--------|-------|
${dbReportRows || '_No rows found_'}

### Credit Accounting

Expected total debited: **${expectedDebit}** (R1: 3×1=3, R2: 5×2=10, R3: 5×(1+1)=10)
Actual total debited: **${totalDebited}** ${totalDrift === 0 ? '✅' : `⚠️ drift=${totalDrift > 0 ? '+' : ''}${totalDrift}`}

| User | Credits in (signup+topup) | Credits debited | Expected | Drift |
|------|--------------------------|----------------|---------|-------|
${creditRows || '_No credit transaction data_'}

> Note: R3 chat deducts **1 credit per 3-min session** (not per message). All 3 chat messages within 3 min = 1 session debit.

`;

  // ── 10. Bottleneck analysis ────────────────────────────

  const allProcR1 = successRows('round_1').map((r) => r.report.t_process_ms!).filter(Boolean) as number[];
  const allProcR2 = successRows('round_2').map((r) => r.report.t_process_ms!).filter(Boolean) as number[];
  const allProcR3 = successRows('round_3').map((r) => r.report.t_process_ms!).filter(Boolean) as number[];
  const allRender = results.map((r) => r.report.t_render_ms!).filter(Boolean) as number[];
  const allQueue  = results.map((r) => r.report.t_queue_ms!).filter(Boolean) as number[];

  const p95procAll = p([...allProcR1, ...allProcR2, ...allProcR3], 95);
  const p95rend = p(allRender, 95);
  const p50queue = p(allQueue, 50);

  const slowest = [...results].sort((a, b) => (b.report.t_e2e_ms ?? 0) - (a.report.t_e2e_ms ?? 0))[0];
  const fastest = [...results]
    .filter((r) => r.report.final_status === 'completed')
    .sort((a, b) => (a.report.t_e2e_ms ?? Infinity) - (b.report.t_e2e_ms ?? Infinity))[0];

  let verdict = 'Insufficient data.';
  const conclusions: string[] = [];

  if (allProcR1.length && allProcR2.length) {
    const r1avg = avg(allProcR1);
    const r2avg = avg(allProcR2);
    const pctDelta = r1avg > 0 ? Math.round(((r2avg - r1avg) / r1avg) * 100) : 0;
    if (pctDelta > 50) conclusions.push(`🔴 Round 2 t_process is **${pctDelta}% slower** than round 1 under 5-user load — indicates NIM key saturation (only 2 report keys).`);
    else if (pctDelta > 15) conclusions.push(`🟡 Round 2 t_process is **${pctDelta}% slower** — mild NIM key contention.`);
    else conclusions.push(`🟢 t_process stayed stable between rounds (+${pctDelta}%) — NIM keys handled the load.`);
  }

  if (p95procAll > 200_000) {
    verdict = `**Primary bottleneck: NIM rate limiting.** p95 t_process is ${ms(p95procAll)} — the 20 concurrent NIM calls per report are queuing behind only 2 API keys. Under 5 concurrent users (= up to 100 in-flight NIM calls), 429 backpressure extends processing significantly.`;
    conclusions.push(`🔴 p95 t_process across all rounds = ${ms(p95procAll)} (> 200s threshold).`);
  } else if (p95rend > 30_000) {
    verdict = `**Primary bottleneck: PDF render.** p95 t_render = ${ms(p95rend)} (> 30s). AI calls complete in time but PDF generation is slow.`;
    conclusions.push(`🟡 p95 t_render = ${ms(p95rend)}.`);
  } else if (p50queue > 60_000) {
    verdict = `**Primary bottleneck: Vercel after() dispatch delay.** Median t_queue = ${ms(p50queue)} — reports are queued in \`pending\` for over 1 minute before the process route fires.`;
    conclusions.push(`🟡 Median t_queue = ${ms(p50queue)} — Vercel background invocation lag.`);
  } else if (p95procAll > 0) {
    verdict = `Stack handled load well under ${results.length} total user-rounds. p95 t_process: ${ms(p95procAll)}, p95 t_render: ${ms(p95rend)}.`;
    conclusions.push(`🟢 All phases within normal bounds.`);
  }

  const bottleneckSec = `---

## 🎯 Bottleneck Analysis

### Verdict

${verdict}

### Observations

${conclusions.map((c) => `- ${c}`).join('\n') || '- No observations.'}

### Key Numbers

| Metric | Value |
|--------|-------|
| Slowest report | u${slowest?.user_idx ?? '?'} (${slowest?.name ?? '?'}) — ${ms(slowest?.report?.t_e2e_ms)} e2e |
| Fastest report | u${fastest?.user_idx ?? '?'} (${fastest?.name ?? '?'}) — ${ms(fastest?.report?.t_e2e_ms)} e2e |
| p95 t_process (all rounds) | ${ms(p95procAll)} |
| p95 t_render (all rounds) | ${ms(p95rend)} |
| p50 t_queue (all rounds) | ${ms(p50queue)} |
| Total failed reports | ${results.filter((r) => r.report.final_status !== 'completed').length} / ${results.length} |
| Total failed chats | ${results.flatMap((r) => r.chats ?? []).filter((c) => c.http_status !== 200).length} / ${results.flatMap((r) => r.chats ?? []).length} |

### Recommendations

${p95procAll > 200_000 ? `
1. **Add more NIM report API keys** — current setup has 2. With 5 concurrent users each needing 20 calls, you have 100 simultaneous NIM requests competing for 2 keys. Adding 3–4 more keys (or upgrading to a higher-rate-limit tier) directly reduces p95 t_process.
2. **Consider request batching** — group multiple section calls into fewer NIM requests.
3. **Investigate NIM tier / rate limits** — check the dashboard for rate limit events during this run.
` : p95rend > 30_000 ? `
1. **Profile PDF render** — the Remotion/react-pdf render step is the bottleneck. Consider caching rendered PDFs more aggressively or generating them asynchronously post-delivery.
2. **Reduce PDF content** — check if all 20 AI sections are needed in the PDF or if some can be rendered client-side.
` : p50queue > 60_000 ? `
1. **Vercel after() dispatch** — the after() hook delay suggests Vercel is queueing background invocations. Check Vercel Function Concurrency limits in your plan.
2. **Consider a queue-based approach** — use Supabase Edge Functions or a proper queue (BullMQ, Inngest) instead of after() for report processing.
` : `
1. Stack is performing well under this concurrency level.
2. Run the same test with 10 concurrent users to find the actual saturation point.
`}

`;

  // ── 11. Appendix ───────────────────────────────────────

  const appendix = `---

## 📎 Appendix

### User Roster

| Idx | Name | DOB | TOB | City | Email | Chart ID |
|-----|------|-----|-----|------|-------|---------|
${users.map((u) => `| ${u.idx} | ${u.name} | ${u.dob} | ${u.tob} | ${u.email.split('+')[1]?.split('@')[0] ?? ''} | ${u.email} | \`${u.chartId?.slice(0, 8)}\` |`).join('\n')}

### How to Read This Report

- **t_generate**: time for the POST /api/reports/generate call to return 200 (should be <2s — just writes DB + fires after())
- **t_queue**: gap between generate returning and the process route starting (Vercel after() dispatch latency)
- **t_process**: time NIM takes to complete all 20 AI section calls (main bottleneck under load)
- **t_render**: PDF generation time after AI is done
- **t_e2e**: total wall time from user firing generate to report reaching \`completed\`
- **NIM Progress**: snapshots of "X/20" seen during polling — shows how far NIM got

### Cleanup

\`\`\`powershell
npx tsx scripts/stress-test/cleanup.ts --prod
\`\`\`

This deletes all 10 test users + cascades to all dependent tables (birth_profiles, kundli_charts, generated_reports, credit_transactions, etc.).

---
*Generated by scripts/stress-test/run.ts*
`;

  return [header, roundSummary, phaseSec, perUserSec, timelineSec, crossSec, chatSec, errorSec, dbSec, bottleneckSec, appendix].join('');
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────

async function main() {
  assertEnv();

  if (!process.argv.includes('--prod')) {
    console.error('\n[run] You must pass --prod to run against production.\n');
    process.exit(1);
  }

  const round3Only = process.argv.includes('--round3');

  const users = loadUsers();
  console.log(`\n[run] Loaded ${users.length} seeded users from results/users.json`);
  console.log(`[run] Target: ${BASE_URL} ⚠️  PRODUCTION`);
  if (round3Only) {
    console.log(`[run] Mode: --round3 only (5 users, basic+chat)\n`);
  } else {
    console.log(`[run] Rounds: 3 users (basic) → 5 users (standard) → 5 users (basic+chat)\n`);
  }

  const ok = await confirm('Start stress test against PRODUCTION?');
  if (!ok) { console.log('Aborted.'); process.exit(0); }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(__dirname, 'results', `run-${timestamp}`);
  fs.mkdirSync(runDir, { recursive: true });
  const store = new ResultStore(runDir);

  console.log(`\n[run] Results → ${runDir}\n`);
  const runStart = Date.now();

  const roundsToRun = round3Only ? ROUNDS.filter((r) => r.name === 'round_3') : ROUNDS;

  for (const round of roundsToRun) {
    await runRound(round, users, store);
    if (round.name !== 'round_3') {
      console.log('[run] Cooling down 30s between rounds (NIM key recovery)...');
      await sleep(30_000);
    }
  }

  const runEnd = Date.now();
  await store.flush();

  console.log('\n[run] Querying database for verification...');
  const dbVerif = await verifyDb(users);

  console.log('[run] Building full report...');
  const report = buildReport(store, runDir, users, dbVerif, runStart, runEnd);
  const reportPath = path.join(runDir, 'report.md');
  fs.writeFileSync(reportPath, report);

  const summary = {
    runDir,
    rounds: ROUNDS.map((r) => r.name),
    totalResults: store.getAll().length,
    totalDurationMs: runEnd - runStart,
    timestamp,
    dbVerification: {
      reportRowCount: dbVerif.reportRows.reduce((s, r) => s + parseInt(r.count, 10), 0),
      expectedRows: 13,
    },
  };
  fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log(`\n[run] ✅ Report → ${reportPath}`);
  console.log(`[run] Total run duration: ${ms(runEnd - runStart)}`);
  console.log('[run] Done. Inspect report.md, then run cleanup.ts --prod when ready.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
