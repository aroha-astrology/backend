/**
 * Fixed rules of the v7 coin offers. Amounts an admin can change live on the admin board
 * (`money.*` keys in config/features.ts); what is here is what they cannot.
 */

/** Extra profiles each account may add for free while `money.freeProfiles` is on. */
export const FREE_PROFILE_SLOTS = 3;

/** Free voice-call billing slice, in seconds, while `money.voiceSlices` is on. */
export const VOICE_SLICE_SECONDS = 15;
