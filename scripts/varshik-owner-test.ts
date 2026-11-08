// The owner's accuracy test (docs/varshik-classical-completeness.md "Owner accuracy test"): the REAL pipeline for the
// owner's own birth and a chosen calendar year (2026 for the test, 2027 for the report he will buy).
//
//   npx tsx scripts/varshik-owner-test.ts <year> <outDir> [--answers asof2026|y2027] [--facts-only]
//
// The data lives in frontend/.claude/varshik-owner-test.json (gitignored, never committed, never copied into fixtures or
// docs). Output goes only to <outDir>, which must be outside the repository. The model call is the same one a purchase makes.
//
// SAFETY. It never touches a database or Redis: DATABASE_URL and REDIS_URL are pointed at a dead
// local address before anything loads, so there is no purchase, no wallet and no row. The only
// outside call is to the language model, with the GEMINI_* keys it reads from ../backend/.env
// (nothing else is copied from that file). The people below are made up.

import fs from 'node:fs';
import path from 'node:path';

const year = Number(process.argv[2]);
const outDir = process.argv[3];
if (!year || !outDir) {
  console.error('usage: tsx scripts/varshik-owner-test.ts <year> <outDir> [--answers asof2026|y2027] [--facts-only]');
  process.exit(1);
}
if (path.resolve(outDir).toLowerCase().includes('aroha-astrology')) {
  console.error('the output folder must be outside the repository (the data is private)');
  process.exit(1);
}
const answersFrom = process.argv.includes('--answers') ? process.argv[process.argv.indexOf('--answers') + 1] : year === 2026 ? 'asof2026' : 'y2027';
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


const owner = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '../../frontend/.claude/varshik-owner-test.json'), 'utf8')) as Record<string, any>;
const strip = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));
const reader = {
  name: owner.name as string,
  birthDate: owner.birthDate as string,
  birthTime: owner.birthTime as string,
  place: { lat: owner.lat as number, lon: owner.lon as number, tz: owner.timezone as string },
  answers: strip((answersFrom === 'asof2026' ? owner.answersAsOf2026Jan : owner.answers2027) as Record<string, string>),
  facts: owner.factsForChapterVI ? [String(owner.factsForChapterVI)] : [],
  year,
} as Parameters<typeof buildVarshikFactsForReader>[0];

fs.mkdirSync(outDir, { recursive: true });
const started = Date.now();
const facts = await buildVarshikFactsForReader(reader);
console.log(`year ${facts.year}: facts built in ${((Date.now() - started) / 1000).toFixed(1)}s`);
const pre = preflightVarshikFacts(facts);
console.log(`preflight: ${pre.ok ? 'ok' : `FAILED\n  ${pre.failures.join('\n  ')}`}`);
fs.writeFileSync(path.join(outDir, `facts-${year}.json`), JSON.stringify(facts, null, 1));
if (!pre.ok || factsOnly) process.exit(pre.ok ? 0 : 1);

const parsed = VarshikFactsSchema.parse(facts);
const stats = { asks: 0, regenerates: 0 };
const t0 = Date.now();
const narrative = await generateVarshikNarrative(parsed, undefined, (spec) => (note) => {
  stats.asks++;
  if (note) stats.regenerates++;
  return askOnce(spec, note);
});
console.log(`text written in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${narrative.sections.length} sections, ${stats.asks} model calls (${stats.regenerates} regenerates), ${narrative.flags.length} flags`);
for (const f of narrative.flags) console.log(`  flag [${f.rule}] ${f.section}: ${f.text}`);
fs.writeFileSync(path.join(outDir, `report-${year}.json`), JSON.stringify({ sections: narrative.sections, flags: narrative.flags, stats }, null, 1));
const md: string[] = [`# Varshik Rashifal ${year}`, ''];
for (const sec of narrative.sections) {
  md.push(`## ${sec.heading}  (${sec.id})`, '');
  for (const para of sec.paragraphs) md.push(para, '');
}
fs.writeFileSync(path.join(outDir, `report-${year}.md`), md.join('\n'));
console.log('done');
process.exit(0);
