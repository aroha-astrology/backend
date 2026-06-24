import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const key = process.env.INTERNAL_PROCESS_KEY;
const target = process.argv[2] || 'https://arohaastrology.in';
if (!key) { console.error('No INTERNAL_PROCESS_KEY'); process.exit(1); }

const start = Date.now();
const r = await fetch(`${target}/api/queue/drain`, {
  method: 'POST',
  headers: { 'x-internal-key': key },
});
const text = await r.text();
console.log(`Status ${r.status} in ${Date.now() - start} ms`);
console.log('Body:', text.slice(0, 1500));
