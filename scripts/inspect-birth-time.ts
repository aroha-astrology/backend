/**
 * Read-only diagnostic: resolve a user by phone (via the hash index, the same lookup
 * findUserByPhoneE164 uses — inspect-user.ts's plaintext eq() predates phoneE164 encryption
 * and always returns "not found") and print exactly what missingKundliParams/birthTimeQuality
 * see, plus every birth_profiles row and which one is active.
 *
 * Usage: npx tsx scripts/inspect-birth-time.ts "+919535960988"
 */
import { findUserByPhoneE164 } from '../src/modules/users/users.repo.js';
import {
  resolveActiveProfileContext,
  resolveProfileContext,
} from '../src/modules/birth-profiles/profile-context.js';
import { missingKundliParams, birthTimeQuality } from '../src/modules/kundli/kundli.service.js';
import { listBirthProfilesByOwner } from '../src/modules/birth-profiles/birth-profiles.repo.js';

async function main() {
  const phone = process.argv[2];
  if (!phone) throw new Error('Usage: npx tsx scripts/inspect-birth-time.ts "+91..."');

  const user = await findUserByPhoneE164(phone);
  if (!user) {
    console.log(`❌ No user found for ${phone}`);
    process.exit(1);
  }

  console.log('=== USER ===');
  console.log('id:', user.id);
  console.log('displayName:', user.displayName);
  console.log('activeProfileId:', user.activeProfileId);
  console.log('dateOfBirth:', user.dateOfBirth);
  console.log('timeOfBirth:', user.timeOfBirth);
  console.log('birthTimeAccuracy:', user.birthTimeAccuracy);
  console.log('birthTimeSource:', user.birthTimeSource);
  console.log('placeOfBirth:', JSON.stringify(user.placeOfBirth));
  console.log('onboardingStatus:', user.onboardingStatus);

  const profiles = await listBirthProfilesByOwner(user.id);
  console.log(`\n=== BIRTH_PROFILES (${profiles.length}) ===`);
  for (const p of profiles) {
    console.log(
      `- id=${p.id} name=${p.displayName} dob=${p.dateOfBirth} tob=${p.timeOfBirth} accuracy=${p.birthTimeAccuracy} ${p.id === user.activeProfileId ? '<-- ACTIVE' : ''}`,
    );
    const ctx = await resolveProfileContext(user, p.id);
    console.log(
      `    missingKundliParams=${JSON.stringify(missingKundliParams(ctx))} quality=${birthTimeQuality(ctx)}`,
    );
  }

  const activeProfile = await resolveActiveProfileContext(user);
  console.log('\n=== resolveActiveProfileContext() (what /v1/kundli uses RIGHT NOW) ===');
  console.log(JSON.stringify(activeProfile, null, 2));

  console.log('\n=== missingKundliParams() ===');
  console.log(missingKundliParams(activeProfile));
  console.log('\n=== birthTimeQuality() ===');
  console.log(birthTimeQuality(activeProfile));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  });
