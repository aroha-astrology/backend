// =============================================================================
// Traditional nakshatra-pada -> naming-syllable table (Swar Siddhanta), used
// to determine the required starting sound for a baby's name based on the
// Moon's nakshatra and pada at birth. Source: cross-verified against
// drikpanchang.com's published Nakshatra Pada Swar reference. Index 0 =
// Ashwini, matching NAKSHATRAS in packages/shared/src/constants/astrology.ts.
// =============================================================================

export interface NakshatraSyllables {
  nakshatra: string;
  /** Syllable for pada 1, 2, 3, 4 (in that order — 1-indexed padas). */
  padas: [string, string, string, string];
}

export const NAKSHATRA_NAMING_SYLLABLES: NakshatraSyllables[] = [
  { nakshatra: 'Ashwini', padas: ['Chu', 'Che', 'Cho', 'Laa'] },
  { nakshatra: 'Bharani', padas: ['Lee', 'Loo', 'Le', 'Lo'] },
  { nakshatra: 'Krittika', padas: ['A', 'Ee', 'U', 'E'] },
  { nakshatra: 'Rohini', padas: ['O', 'Vaa', 'Vee', 'Vu'] },
  { nakshatra: 'Mrigashira', padas: ['Ve', 'Vo', 'Kaa', 'Kee'] },
  { nakshatra: 'Ardra', padas: ['Ku', 'Gha', 'Ing', 'Chha'] },
  { nakshatra: 'Punarvasu', padas: ['Ke', 'Ko', 'Haa', 'Hee'] },
  { nakshatra: 'Pushya', padas: ['Hu', 'He', 'Ho', 'Daa'] },
  { nakshatra: 'Ashlesha', padas: ['Dee', 'Doo', 'De', 'Do'] },
  { nakshatra: 'Magha', padas: ['Maa', 'Mee', 'Moo', 'Me'] },
  { nakshatra: 'PurvaPhalguni', padas: ['Mo', 'Taa', 'Tee', 'Too'] },
  { nakshatra: 'UttaraPhalguni', padas: ['Te', 'To', 'Paa', 'Pee'] },
  { nakshatra: 'Hasta', padas: ['Poo', 'Sha', 'Na', 'Tha'] },
  { nakshatra: 'Chitra', padas: ['Pe', 'Po', 'Raa', 'Ree'] },
  { nakshatra: 'Swati', padas: ['Roo', 'Re', 'Ro', 'Taa'] },
  { nakshatra: 'Vishakha', padas: ['Tee', 'Too', 'Te', 'To'] },
  { nakshatra: 'Anuradha', padas: ['Naa', 'Nee', 'Noo', 'Ne'] },
  { nakshatra: 'Jyeshtha', padas: ['No', 'Yaa', 'Yee', 'Yoo'] },
  { nakshatra: 'Moola', padas: ['Ye', 'Yo', 'Bhaa', 'Bhee'] },
  { nakshatra: 'PurvaAshadha', padas: ['Bhoo', 'Dhaa', 'Phaa', 'Dha'] },
  { nakshatra: 'UttaraAshadha', padas: ['Bhe', 'Bho', 'Jaa', 'Jee'] },
  { nakshatra: 'Shravana', padas: ['Khee', 'Khoo', 'Khe', 'Kho'] },
  { nakshatra: 'Dhanishta', padas: ['Gaa', 'Gee', 'Gu', 'Ge'] },
  { nakshatra: 'Shatabhisha', padas: ['Go', 'Saa', 'See', 'Soo'] },
  { nakshatra: 'PurvaBhadrapada', padas: ['Se', 'So', 'Daa', 'Dee'] },
  { nakshatra: 'UttaraBhadrapada', padas: ['Doo', 'Tha', 'Jha', 'Yna'] },
  { nakshatra: 'Revati', padas: ['De', 'Do', 'Cha', 'Chee'] },
];

/**
 * Looks up the required naming syllable for a given nakshatra (0-indexed,
 * Ashwini=0, matching NAKSHATRAS in @aroha-astrology/shared) and pada
 * (1-indexed, 1-4). Throws on an out-of-range index/pada rather than
 * silently returning a wrong syllable.
 */
export function getNamingSyllable(nakshatraIndex: number, pada: number): string {
  const entry = NAKSHATRA_NAMING_SYLLABLES[nakshatraIndex];
  if (!entry) throw new Error(`Invalid nakshatra index: ${nakshatraIndex}`);
  if (pada < 1 || pada > 4) throw new Error(`Invalid pada: ${pada}`);
  return entry.padas[pada - 1]!;
}
