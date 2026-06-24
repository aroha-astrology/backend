#!/usr/bin/env tsx
/**
 * Seeds puja and offering hero images from the URLs in
 * supabase/seed/puja_image_sources.json. Each URL is fetched, uploaded to
 * the `pujas` Storage bucket as <slug>.jpg, and the row in pujas /
 * puja_offerings is updated with the storage path.
 *
 * Idempotent — rows whose image_path already points to a populated object
 * are skipped unless --force is passed.
 *
 * Usage:
 *   pnpm dlx tsx scripts/seed-puja-images.ts          # fill missing
 *   pnpm dlx tsx scripts/seed-puja-images.ts --force  # re-upload all
 *
 * Required env (in apps/web/.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
dotenv.config({ path: resolve(__dirname, '../apps/web/.env.local') });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'pujas';
// Other buckets the puja-booking feature depends on. Created if missing so
// pandit photo upload and ritual video upload work the moment a user tries them.
const REQUIRED_BUCKETS = ['pujas', 'pandit-profiles', 'ritual-videos'];
const FORCE = process.argv.includes('--force');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface Sources {
  pujas: Record<string, string>;
  offerings: Record<string, string>;
}
const config: Sources = JSON.parse(
  readFileSync(resolve(__dirname, '../supabase/seed/puja_image_sources.json'), 'utf-8')
);

async function ensureBuckets() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const existing = new Set((buckets ?? []).map(b => b.name));
  for (const name of REQUIRED_BUCKETS) {
    if (existing.has(name)) {
      console.log(`  · bucket "${name}" already exists`);
      continue;
    }
    const { error } = await supabase.storage.createBucket(name, { public: true });
    if (error) throw new Error(`Failed to create bucket "${name}": ${error.message}`);
    console.log(`✔ Created bucket "${name}"`);
  }
}

async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'JyotishAI/1.0 (puja-image-seeder; admin@jyotishai.com)',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const contentType = res.headers.get('content-type') ?? 'image/jpeg';
  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, contentType };
}

async function uploadToStorage(path: string, buffer: Buffer, contentType: string) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

async function processPuja(slug: string, sourceUrl: string) {
  const { data: row } = await supabase
    .from('pujas')
    .select('slug, image_path')
    .eq('slug', slug)
    .maybeSingle();
  if (!row) {
    console.warn(`  ⚠ puja row not found for slug "${slug}" — skipping`);
    return;
  }
  if (row.image_path && !FORCE) {
    console.log(`  · ${slug}: already has image, skipping (--force to override)`);
    return;
  }
  const objectPath = `pujas/${slug}.jpg`;
  try {
    const { buffer, contentType } = await downloadImage(sourceUrl);
    await uploadToStorage(objectPath, buffer, contentType);
    await supabase.from('pujas').update({ image_path: objectPath }).eq('slug', slug);
    console.log(`  ✔ ${slug}`);
  } catch (e) {
    console.error(`  ✘ ${slug}: ${(e as Error).message}`);
  }
}

async function processOffering(slug: string, sourceUrl: string) {
  const { data: row } = await supabase
    .from('puja_offerings')
    .select('slug, image_path')
    .eq('slug', slug)
    .maybeSingle();
  if (!row) {
    console.warn(`  ⚠ offering row not found for slug "${slug}" — skipping`);
    return;
  }
  if (row.image_path && !FORCE) {
    console.log(`  · ${slug}: already has image, skipping`);
    return;
  }
  const objectPath = `offerings/${slug}.jpg`;
  try {
    const { buffer, contentType } = await downloadImage(sourceUrl);
    await uploadToStorage(objectPath, buffer, contentType);
    await supabase.from('puja_offerings').update({ image_path: objectPath }).eq('slug', slug);
    console.log(`  ✔ ${slug}`);
  } catch (e) {
    console.error(`  ✘ ${slug}: ${(e as Error).message}`);
  }
}

async function main() {
  console.log('Ensuring required Storage buckets exist...');
  await ensureBuckets();
  console.log(`\nSeeding ${Object.keys(config.pujas).length} puja images...`);
  for (const [slug, url] of Object.entries(config.pujas)) {
    await processPuja(slug, url);
  }
  console.log(`\nSeeding ${Object.keys(config.offerings).length} offering images...`);
  for (const [slug, url] of Object.entries(config.offerings)) {
    await processOffering(slug, url);
  }
  console.log('\n✔ Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
