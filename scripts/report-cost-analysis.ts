/**
 * Reports feature — LLM cost vs. revenue analysis.
 *
 * Reads `ai_usage` telemetry for the two agent names the Reports feature's
 * narrative/translation calls are recorded under (`report`, `report-translation`
 * — see src/config/llm.ts's REPORT_PROFILE/REPORT_TRANSLATION_PROFILE, both
 * used by every one of the 10 report types in src/lib/llm/reports/*.ts), sums
 * token usage, converts to INR at the pricing constants below, and compares
 * it against real REVENUE from `report_unlock:*`-prefixed `wallet_transactions`
 * debits in the same window.
 *
 * IMPORTANT LIMITATION (see docs/REPORT_PRICING_AND_COST.md section 5): the
 * `ai_usage.agent` column only ever records 'report' or 'report-translation'
 * for these calls — never which of the 10 report keys (marriage, wealth,
 * kundli_milan, ...) triggered the call. So this script's cost totals are
 * AGGREGATE across all report types, not broken down per type. A true
 * per-report-type cost/revenue comparison is not measurable from `ai_usage`
 * as currently instrumented.
 *
 * Usage:
 *   npx tsx scripts/report-cost-analysis.ts
 *
 * Date range: hardcoded to "last 30 days" by default — see DEFAULT_WINDOW_DAYS
 * below. To analyze a different window, edit RANGE_FROM/RANGE_TO directly (no
 * --from/--to flag parsing exists anywhere else in this repo's scripts/*.ts,
 * so this intentionally doesn't introduce a new CLI convention just for one
 * script — see scripts/regenerate-for-users.ts for the plain-positional-argv
 * style used elsewhere instead).
 */

// Patch env BEFORE importing db.js — env.ts's Zod schema hard-requires either
// FIREBASE_SERVICE_ACCOUNT_PATH or the full FIREBASE_PROJECT_ID/CLIENT_EMAIL/
// PRIVATE_KEY triple to be present, even though this script never touches
// Firebase. Same guarded dummy-value pattern as scripts/inspect-user.ts.
process.env['FIREBASE_PROJECT_ID'] = process.env['FIREBASE_PROJECT_ID'] ?? 'dummy-project';
process.env['FIREBASE_CLIENT_EMAIL'] =
  process.env['FIREBASE_CLIENT_EMAIL'] ?? 'dummy@dummy-project.iam.gserviceaccount.com';
process.env['FIREBASE_PRIVATE_KEY'] =
  process.env['FIREBASE_PRIVATE_KEY'] ??
  '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC7dummy==\n-----END PRIVATE KEY-----\n';

import { sql, and, gte, lt, inArray } from 'drizzle-orm';
import { db, sqlClient } from '../src/config/db.js';
import { aiUsage } from '../src/db/schema.js';
import { spendByReportKey, type DateRange } from '../src/modules/admin/admin.repo.js';

// ---------------------------------------------------------------------------
// Pricing constants — Gemini 3.1 Flash-Lite, as confirmed and used throughout
// docs/REPORT_PRICING_AND_COST.md (see that doc's "Part A" sourcing notes for
// where these figures came from; update both places together if pricing changes).
// ---------------------------------------------------------------------------
const USD_PER_1M_INPUT_TOKENS = 0.25;
const USD_PER_1M_OUTPUT_TOKENS = 1.5;
// Overridable because a hardcoded FX rate is wrong shortly after it is written —
// this was 88 while the real rate was ~95, understating every figure by ~8%.
// The admin dashboard now fetches the live rate (frontend lib/fx.ts); this
// script is run by hand, so pass the rate in rather than trusting the default:
//   INR_PER_USD=95.39 npx tsx scripts/report-cost-analysis.ts
const INR_PER_USD = Number(process.env['INR_PER_USD'] ?? 95.3);
// Google bills this account in INR and adds GST on top of the converted list
// price, so the invoice figure is 1.18x the raw conversion. Normally recoverable
// as input tax credit, hence reported as a separate line rather than baked in.
const GST_RATE = 0.18;

const INR_PER_INPUT_TOKEN = (USD_PER_1M_INPUT_TOKENS / 1_000_000) * INR_PER_USD;
const INR_PER_OUTPUT_TOKEN = (USD_PER_1M_OUTPUT_TOKENS / 1_000_000) * INR_PER_USD;

// ---------------------------------------------------------------------------
// Date range — default last 30 days. To run for a different window, replace
// the two lines below with fixed Date instances (e.g.
// `new Date('2026-07-01')` / `new Date('2026-08-01')`) and re-run.
// ---------------------------------------------------------------------------
const DEFAULT_WINDOW_DAYS = 30;
const RANGE_TO = new Date();
const RANGE_FROM = new Date(RANGE_TO.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
const RANGE: DateRange = { from: RANGE_FROM, to: RANGE_TO };

const REPORT_AGENTS = ['report', 'report-translation'] as const;

interface AgentUsageRow {
  agent: string;
  calls: number;
  tokensIn: number;
  tokensOut: number;
}

async function costByReportAgents(range: DateRange): Promise<AgentUsageRow[]> {
  const rows = await db
    .select({
      agent: aiUsage.agent,
      calls: sql<number>`count(*)`,
      tokensIn: sql<number>`coalesce(sum(${aiUsage.tokensIn}), 0)`,
      tokensOut: sql<number>`coalesce(sum(${aiUsage.tokensOut}), 0)`,
    })
    .from(aiUsage)
    .where(
      and(
        inArray(aiUsage.agent, [...REPORT_AGENTS]),
        gte(aiUsage.createdAt, range.from),
        lt(aiUsage.createdAt, range.to),
      ),
    )
    .groupBy(aiUsage.agent);

  return rows.map((row) => ({
    agent: row.agent,
    calls: Number(row.calls),
    tokensIn: Number(row.tokensIn),
    tokensOut: Number(row.tokensOut),
  }));
}

function inr(paiseOrRupees: number, isPaise = false): string {
  const rupees = isPaise ? paiseOrRupees / 100 : paiseOrRupees;
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function costForTokens(tokensIn: number, tokensOut: number): number {
  return tokensIn * INR_PER_INPUT_TOKEN + tokensOut * INR_PER_OUTPUT_TOKEN;
}

async function main(): Promise<void> {
  console.log('=== Reports Feature — LLM Cost vs. Revenue Analysis ===');
  console.log(
    `Window: ${RANGE.from.toISOString()} -> ${RANGE.to.toISOString()} (${DEFAULT_WINDOW_DAYS} days)\n`,
  );

  const usageRows = await costByReportAgents(RANGE);

  if (usageRows.length === 0) {
    console.log('No ai_usage rows found for agents [report, report-translation] in this window.');
  }

  let totalCalls = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCostInr = 0;

  console.log('--- LLM cost, by agent ---');
  for (const agentName of REPORT_AGENTS) {
    const row = usageRows.find((r) => r.agent === agentName);
    const calls = row?.calls ?? 0;
    const tokensIn = row?.tokensIn ?? 0;
    const tokensOut = row?.tokensOut ?? 0;
    const costInr = costForTokens(tokensIn, tokensOut);

    totalCalls += calls;
    totalTokensIn += tokensIn;
    totalTokensOut += tokensOut;
    totalCostInr += costInr;

    console.log(
      `  ${agentName.padEnd(20)} calls=${String(calls).padEnd(6)} ` +
        `tokensIn=${String(tokensIn).padEnd(9)} tokensOut=${String(tokensOut).padEnd(9)} ` +
        `cost=${inr(costInr)}`,
    );
  }

  console.log('\n--- LLM cost, total ---');
  console.log(`  Total calls:        ${totalCalls}`);
  console.log(`  Total input tokens: ${totalTokensIn}`);
  console.log(`  Total output tokens: ${totalTokensOut}`);
  console.log(`  FX rate used:       ₹${INR_PER_USD}/USD`);
  console.log(`  Total LLM cost:     ${inr(totalCostInr)} (ex-GST)`);
  console.log(
    `  Incl. ${Math.round(GST_RATE * 100)}% GST:      ${inr(totalCostInr * (1 + GST_RATE))}`,
  );
  console.log(
    '  NOTE: excludes ALL voice/Gemini Live usage — those calls never write to ai_usage.',
  );

  // --- Revenue: report_unlock:* wallet_transactions debits in the same window ---
  const revenueByKey = await spendByReportKey(RANGE);
  const totalRevenuePaise = revenueByKey.reduce((sum, r) => sum + r.totalPaise, 0);
  const totalRevenueCount = revenueByKey.reduce((sum, r) => sum + r.count, 0);

  console.log('\n--- Revenue (report_unlock:* wallet debits), by report key ---');
  if (revenueByKey.length === 0) {
    console.log('  No report_unlock revenue in this window.');
  }
  for (const r of revenueByKey) {
    console.log(
      `  ${r.reportKey.padEnd(24)} count=${String(r.count).padEnd(6)} revenue=${inr(r.totalPaise, true)}`,
    );
  }
  console.log(
    `\n  Total report revenue: ${inr(totalRevenuePaise, true)} across ${totalRevenueCount} unlocks`,
  );
  console.log(
    '  Note: this is WALLET revenue, not necessarily CASH revenue — a purchase paid out of a',
  );
  console.log(
    "  user's free ₹500 signup grant counts here too. See docs/REPORT_PRICING_AND_COST.md section 3.",
  );

  // --- Final line: measured revenue vs. LLM cost ratio for this window ---
  console.log('\n=== Revenue vs. LLM cost (this window) ===');
  const totalRevenueInr = totalRevenuePaise / 100;
  if (totalCostInr > 0) {
    const ratio = totalRevenueInr / totalCostInr;
    console.log(
      `  ${inr(totalRevenueInr)} revenue / ${inr(totalCostInr)} LLM cost = ${ratio.toFixed(1)}x`,
    );
  } else {
    console.log(
      `  ${inr(totalRevenueInr)} revenue / ${inr(totalCostInr)} LLM cost — no LLM spend recorded in this window, ratio undefined.`,
    );
  }

  await sqlClient.end();
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await sqlClient.end().catch(() => {});
  process.exit(1);
});
