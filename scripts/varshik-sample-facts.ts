// Writes the facts of the made-up sample reader (born 1988-06-22 04:30 Chennai) for the frontend dev preview and
// its Playwright spec: frontend/components/reports/varshik/fixtures/facts.sample.json.
//
//   npx tsx scripts/varshik-sample-facts.ts <out.json>
//
// Re-run it whenever the facts schema or the scoring weights change. No database, no model call.

import fs from 'node:fs';

const out = process.argv[2];
if (!out) {
  console.error('usage: tsx scripts/varshik-sample-facts.ts <out.json>');
  process.exit(1);
}
process.env.DATABASE_URL = 'postgres://none:none@127.0.0.1:1/none';
process.env.REDIS_URL = '';
process.env.FIREBASE_PROJECT_ID = 'demo-none';
process.env.FIREBASE_CLIENT_EMAIL = 'none@demo-none.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = 'none';
process.env.GEMINI_API_KEY = 'unused';
process.env.LOG_LEVEL = 'warn';

const { buildVarshikFactsForReader } = await import('../src/modules/reports/generators/varshik-2027.generator.js');
const { preflightVarshikFacts } = await import('../src/lib/astro-engine/reports/varshik-facts.js');

const facts = await buildVarshikFactsForReader({
  name: 'Test',
  birthDate: '1988-06-22',
  birthTime: '04:30',
  place: { lat: 13.08, lon: 80.27, tz: 'Asia/Kolkata' },
  answers: { relationship: 'single', occupation: 'working', children: 'none', mainDecision: 'job_change' },
  facts: [],
});
const pre = preflightVarshikFacts(facts);
if (!pre.ok) {
  console.error('preflight failed:', pre.failures.join('; '));
  process.exit(1);
}
fs.writeFileSync(out, JSON.stringify(facts));
console.log(`wrote ${out}`);
process.exit(0);
