// Generates the three Varshik Rashifal 2027 test reports (Sprint 3) through the REAL pipeline:
// the facts builder, the preflight, the 5 checked LLM calls and the coverage check.
//
//   npx tsx scripts/varshik-test-reports.ts <outDir> [--only student|professional|retired] [--facts-only]
//
// SAFETY. It never touches a database or Redis: DATABASE_URL and REDIS_URL are pointed at a dead
// local address before anything loads, so there is no purchase, no wallet and no row. The only
// outside call is to the language model, with the GEMINI_* keys it reads from ../backend/.env
// (nothing else is copied from that file). The people below are made up.

import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: tsx scripts/varshik-test-reports.ts <outDir> [--only <persona>] [--facts-only]');
  process.exit(1);
}
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const factsOnly = process.argv.includes('--facts-only');

// Keys only, from the main backend's env file.
const envPath = path.resolve(import.meta.dirname, '../../backend/.env');
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = /^\s*(GEMINI_[A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m) process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, '');
}
process.env.DATABASE_URL = 'postgres://none:none@127.0.0.1:1/none';
process.env.REDIS_URL = '';
// The env schema insists on a Firebase identity; none of it is ever used here.
process.env.FIREBASE_PROJECT_ID = 'demo-none';
process.env.FIREBASE_CLIENT_EMAIL = 'none@demo-none.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = 'none';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'warn';

const { buildVarshikFactsForReader } = await import('../src/modules/reports/generators/varshik-2027.generator.js');
const { preflightVarshikFacts, VarshikFactsSchema } = await import('../src/lib/astro-engine/reports/varshik-facts.js');
const { generateVarshikNarrative, askOnce } = await import('../src/lib/llm/reports/varshik-2027.js');

interface Persona {
  id: string;
  describe: string;
  reader: Parameters<typeof buildVarshikFactsForReader>[0];
}

const PERSONAS: Persona[] = [
  {
    id: 'student',
    describe: 'single student, no children, big decision: study',
    reader: {
      name: 'Aarav',
      birthDate: '2004-08-19',
      birthTime: '07:40',
      place: { lat: 18.52, lon: 73.86, tz: 'Asia/Kolkata' },
      answers: {
        relationship: 'single',
        occupation: 'student',
        children: 'none',
        mainDecision: 'study',
        livingWith: 'parents',
        home: 'family_home',
        moneyFocus: 'nothing_specific',
        travelPlan: 'none',
        studyPlan: 'exam',
        practice: 'daily',
      },
      facts: [
        'Is preparing for a management entrance exam',
        'Lives with parents and a younger sister',
        'Is unsure whether to take a gap year',
      ],
    },
  },
  {
    id: 'professional',
    describe: 'married professional with a child, big decision: a job change; one fact mentions an illness (must never become a question)',
    reader: {
      name: 'Meera',
      birthDate: '1988-03-14',
      birthTime: '22:10',
      place: { lat: 12.97, lon: 77.59, tz: 'Asia/Kolkata' },
      answers: {
        relationship: 'married',
        occupation: 'working',
        children: 'have',
        mainDecision: 'job_change',
        livingWith: 'partner',
        home: 'buying_or_building',
        moneyFocus: 'saving',
        travelPlan: 'within_india',
        studyPlan: 'none',
        practice: 'sometimes',
      },
      facts: [
        'Has worked at the same company for six years',
        'Daughter is in class 4',
        'Is thinking about a job switch after the next appraisal',
        "Father-in-law has been unwell and needed hospital visits",
        'Wants to buy a flat in the next two years',
      ],
    },
  },
  {
    id: 'retired',
    describe: 'retired, married, grown children, big decision: a move; no stored facts at all (tests the no-facts path)',
    reader: {
      name: 'Harish',
      birthDate: '1962-11-02',
      birthTime: '05:15',
      place: { lat: 26.85, lon: 80.95, tz: 'Asia/Kolkata' },
      answers: {
        relationship: 'married',
        occupation: 'retired',
        children: 'have',
        mainDecision: 'move_or_travel',
        livingWith: 'partner',
        home: 'own',
        moneyFocus: 'investing',
        travelPlan: 'abroad',
        studyPlan: 'none',
        practice: 'never',
      },
      facts: [],
    },
  },
];

fs.mkdirSync(outDir, { recursive: true });

for (const p of PERSONAS) {
  if (only && p.id !== only) continue;
  const started = Date.now();
  console.log(`\n=== ${p.id}: ${p.describe}`);
  const facts = await buildVarshikFactsForReader(p.reader);
  console.log(`facts built in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  const pre = preflightVarshikFacts(facts);
  console.log(`preflight: ${pre.ok ? 'ok' : `FAILED\n  ${pre.failures.join('\n  ')}`}`);
  fs.writeFileSync(path.join(outDir, `facts-${p.id}.json`), JSON.stringify(facts, null, 1));
  if (!pre.ok || factsOnly) continue;

  const parsed = VarshikFactsSchema.parse(facts);
  const stats = { asks: 0, regenerates: 0 };
  const t0 = Date.now();
  let narrative;
  try {
    narrative = await generateVarshikNarrative(parsed, undefined, (spec) => (note) => {
      stats.asks++;
      if (note) stats.regenerates++;
      return askOnce(spec, note);
    });
  } catch (err) {
    console.log(`FAILED after ${stats.asks} model calls (${stats.regenerates} regenerates): ${(err as Error).message}`);
    continue;
  }
  console.log(
    `text written in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${narrative.sections.length} sections, ${stats.asks} model calls (${stats.regenerates} regenerates), ${narrative.flags.length} flags`,
  );
  for (const f of narrative.flags) console.log(`  flag [${f.rule}] ${f.section}: ${f.text}`);

  fs.writeFileSync(path.join(outDir, `report-${p.id}.json`), JSON.stringify({ sections: narrative.sections, flags: narrative.flags, stats }, null, 1));
  const md = [`# ${p.describe}`, '', `${stats.asks} model calls, ${stats.regenerates} regenerates, ${narrative.flags.length} flags.`, ''];
  for (const s of narrative.sections) {
    md.push(`## ${s.heading}  (${s.id})`, '');
    for (const para of s.paragraphs) md.push(para, '');
  }
  fs.writeFileSync(path.join(outDir, `report-${p.id}.md`), md.join('\n'));
}
console.log('\ndone');
process.exit(0);
