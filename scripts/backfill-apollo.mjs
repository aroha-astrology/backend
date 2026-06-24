/**
 * Runs Apollo enrichment backfill for ALL existing users.
 * Auto-paginates until every un-enriched user is processed.
 *
 * Usage:
 *   node scripts/backfill-apollo.mjs https://your-app.vercel.app
 */

const BASE_URL = process.argv[2];
if (!BASE_URL) {
  console.error('Usage: node scripts/backfill-apollo.mjs https://your-app.vercel.app');
  process.exit(1);
}

// Paste your session cookie from browser devtools (Application → Cookies → sb-*-auth-token)
// OR keep empty and make sure you're running against a deployed URL where you're logged in.
const SESSION_COOKIE = process.env.SESSION_COOKIE ?? '';

const ENDPOINT = `${BASE_URL.replace(/\/$/, '')}/api/admin/backfill-apollo`;

let offset = 0;
let totalProcessed = 0;
let totalEnriched = 0;
let totalSkipped = 0;
let totalFailed = 0;
let page = 1;

console.log(`\nStarting Apollo backfill → ${ENDPOINT}\n`);

while (true) {
  const url = `${ENDPOINT}?offset=${offset}&batchSize=20`;
  console.log(`Page ${page} — offset ${offset} …`);

  const headers = { 'Content-Type': 'application/json' };
  if (SESSION_COOKIE) headers['Cookie'] = SESSION_COOKIE;

  let res;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    console.error('Network error:', err.message);
    process.exit(1);
  }

  if (res.status === 401) {
    console.error('\n❌ Unauthorized. You need to pass your session cookie.');
    console.error('   1. Open your app in Chrome, log in as admin.');
    console.error('   2. DevTools → Application → Cookies → copy the sb-*-auth-token value.');
    console.error('   3. Run: SESSION_COOKIE="sb-xxx-auth-token=..." node scripts/backfill-apollo.mjs <url>');
    process.exit(1);
  }

  if (!res.ok) {
    const text = await res.text();
    console.error(`HTTP ${res.status}:`, text);
    process.exit(1);
  }

  const json = await res.json();

  totalProcessed += json.processed ?? 0;
  totalEnriched  += json.enriched  ?? 0;
  totalSkipped   += json.skipped   ?? 0;
  totalFailed    += json.failed    ?? 0;

  console.log(`  processed=${json.processed}  enriched=${json.enriched}  skipped=${json.skipped}  failed=${json.failed}`);

  if (!json.nextOffset) break;

  offset = json.nextOffset;
  page++;

  // Small pause between pages so we don't slam Apollo.
  await new Promise(r => setTimeout(r, 1000));
}

console.log(`\n✅ Done!`);
console.log(`   Total processed : ${totalProcessed}`);
console.log(`   Enriched        : ${totalEnriched}`);
console.log(`   Skipped (no email): ${totalSkipped}`);
console.log(`   Failed (Apollo miss): ${totalFailed}`);
