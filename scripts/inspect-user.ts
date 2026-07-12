/**
 * Diagnostic: fetch full user profile + kundli + all horoscopes for a phone number.
 * Bypasses Firebase validation by setting dummy env vars before import.
 * Usage: npx tsx scripts/inspect-user.ts "+919535960988"
 */

// Patch env BEFORE config modules load
process.env['FIREBASE_PROJECT_ID'] = process.env['FIREBASE_PROJECT_ID'] ?? 'dummy-project';
process.env['FIREBASE_CLIENT_EMAIL'] =
  process.env['FIREBASE_CLIENT_EMAIL'] ?? 'dummy@dummy-project.iam.gserviceaccount.com';
process.env['FIREBASE_PRIVATE_KEY'] =
  process.env['FIREBASE_PRIVATE_KEY'] ??
  '-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC7dummy==\n-----END PRIVATE KEY-----\n';

import { db } from '../src/config/db.js';
import { users, kundlis, dailyHoroscopes } from '../src/db/schema.js';
import { eq, desc } from 'drizzle-orm';

async function main() {
  const phone = process.argv[2] ?? '+919535960988';

  // 1. User row
  const [user] = await db.select().from(users).where(eq(users.phoneE164, phone)).limit(1);
  if (!user) {
    console.log(`❌ No user found with phone ${phone}`);
    process.exit(1);
  }

  console.log('\n=== USER PROFILE ===');
  console.log('ID:', user.id);
  console.log('Name:', user.displayName);
  console.log('Phone:', user.phoneE164);
  console.log('Gender:', user.gender);
  console.log('Date of Birth:', user.dateOfBirth);
  console.log('Time of Birth:', user.timeOfBirth);
  console.log('Birth Time Accuracy:', user.birthTimeAccuracy);
  console.log('Birth Time Source:', user.birthTimeSource);
  console.log('Place of Birth:', JSON.stringify(user.placeOfBirth, null, 2));
  console.log('Current Location:', JSON.stringify(user.currentLocation, null, 2));
  console.log('Current Timezone:', user.currentTimezone);
  console.log('Relationship Status:', user.relationshipStatus);
  console.log('Interest Areas:', user.interestAreas);
  console.log('Locale:', user.locale);
  console.log('Content Language:', user.contentLanguage);
  console.log('Preferred System:', user.preferredSystem);
  console.log('Preferred Ayanamsa:', user.preferredAyanamsa);
  console.log('Preferred House System:', user.preferredHouseSystem);
  console.log('Preferred Chart Style:', user.preferredChartStyle);
  console.log('Preferred Dasha System:', user.preferredDashaSystem);
  console.log('Onboarding Status:', user.onboardingStatus);
  console.log('Credits:', user.credits);
  console.log('Unlocked Houses:', user.unlockedHouses);
  console.log('Created At:', user.createdAt);
  console.log('Updated At:', user.updatedAt);
  console.log('Deleted At:', user.deletedAt ?? 'none (active)');

  // 2. Kundli row
  const [kundli] = await db.select().from(kundlis).where(eq(kundlis.userId, user.id)).limit(1);

  console.log('\n=== KUNDLI ===');
  if (!kundli) {
    console.log('❌ No kundli found');
  } else {
    console.log('Status:', kundli.status);
    console.log('Error:', kundli.errorMessage ?? 'none');
    console.log('Generated At:', kundli.updatedAt);
    if (kundli.chartData) {
      const chart = kundli.chartData as any;
      console.log('\n-- Chart Data --');
      console.log('Ascendant:', JSON.stringify(chart.ascendant, null, 2));
      if (Array.isArray(chart.planets)) {
        console.log('\nPlanets:');
        for (const p of chart.planets) {
          console.log(`  ${p.planet}: sign=${p.sign} house=${p.house} longitude=${p.longitude?.toFixed(2)}`);
        }
      }
      if (Array.isArray(chart.houses)) {
        console.log('\nHouses:');
        for (const h of chart.houses) {
          console.log(`  House ${h.house}: sign=${h.sign}, lord=${h.lord}`);
        }
      }
    } else {
      console.log('chartData: null');
    }

    if (kundli.dashaData) {
      const dasha = kundli.dashaData as any;
      const vim = dasha.vimshottari;
      if (vim) {
        console.log('\n-- Dasha Data (Vimshottari) --');
        console.log('Current Mahadasha:', JSON.stringify(vim.currentMahadasha, null, 2));
        console.log('Current Antardasha:', JSON.stringify(vim.currentAntardasha, null, 2));
      }
    } else {
      console.log('dashaData: null');
    }

    if (kundli.yogaData) {
      const yoga = kundli.yogaData as any;
      const yogas = yoga.yogas ?? [];
      const presentYogas = yogas.filter((y: any) => y.present);
      console.log(`\n-- Yogas (${presentYogas.length} present out of ${yogas.length} total) --`);
      for (const y of presentYogas.slice(0, 15)) {
        console.log(`  [${y.type}] ${y.name}: ${(y.description ?? '').slice(0, 80)}`);
      }
    }

    if (kundli.doshaData) {
      console.log('\n-- Doshas --');
      const d = kundli.doshaData as any;
      for (const [key, val] of Object.entries(d)) {
        const v = val as any;
        const present = v?.present ?? v?.active;
        console.log(`  ${key}: ${present ? '⚠️  PRESENT - ' + JSON.stringify(v) : '✅ not present'}`);
      }
    }

    if (kundli.ashtakavargaData) {
      const av = kundli.ashtakavargaData as any;
      const sarva = av.sarva;
      if (sarva?.bindus) {
        console.log('\n-- Ashtakavarga (Sarva Bindu) --');
        console.log('Bindus by sign index:', sarva.bindus.join(', '));
        const total = sarva.bindus.reduce((a: number, b: number) => a + b, 0);
        console.log('Total:', total);
      }
    }
  }

  // 3. All horoscopes
  const horoscopes = await db
    .select()
    .from(dailyHoroscopes)
    .where(eq(dailyHoroscopes.userId, user.id))
    .orderBy(desc(dailyHoroscopes.updatedAt));

  console.log(`\n=== HOROSCOPES (${horoscopes.length} rows) ===`);
  for (const h of horoscopes) {
    console.log(`\n[${h.period.toUpperCase()}] forDate=${h.forDate} key=${h.periodKey} status=${h.status}`);
    console.log('  Model:', h.model ?? 'none');
    console.log('  Updated:', h.updatedAt);
    if (h.status === 'ready' && h.summary) {
      console.log('  Hook:', h.summary.slice(0, 150));
    }
    if (h.status === 'failed') {
      console.log('  Error:', h.errorMessage);
    }
    if (h.structured) {
      const s = h.structured as any;
      const cats = s.categories;
      if (cats) {
        console.log('  Categories:');
        for (const [cat, val] of Object.entries(cats)) {
          const v = val as any;
          console.log(`    ${cat.padEnd(10)}: [${(v.quality ?? '?').padEnd(11)}/score=${v.score}] ${(v.hook ?? '').slice(0, 70)}`);
        }
        console.log(`  Lucky: color=${s.luckyColor} number=${s.luckyNumber}`);
      }
    }
    if (h.monthlyBreakdown && Array.isArray(h.monthlyBreakdown)) {
      console.log(`  Monthly breakdown: ${h.monthlyBreakdown.length} months`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
