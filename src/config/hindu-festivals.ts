// Curated list of major Hindu festivals (Gregorian date keyed).
//
// Hindu festivals are tithi-based, and their Gregorian dates shift each
// year. Computing them from first principles requires lunar-month logic
// the panchang engine doesn't yet expose, so this is a hand-maintained
// table sourced from drikpanchang.com, covering 2025 through Aug 2028.
//
// ponytail: this is a duplicate of frontend/lib/panchang/hindu-festivals.ts
// (frontend needs its own copy for client-side display; this backend copy is
// what the festival-alert cron reads, since a cron can't import from the
// separately-deployed Next.js app). Keep the two in sync by hand when adding
// years/festivals. Move to packages/shared (already a precedent — see
// packages/shared/src/constants/astrology.ts) if a third consumer appears or
// the two copies actually drift.

export interface HinduFestival {
  name: string;
  emoji: string;
  importance: 'major' | 'minor';
  /** Published auspicious window for this occurrence, same drikpanchang.com sourcing as the
   * rest of this table. Only set for festivals with a genuinely named muhurat (Lakshmi Puja,
   * Nishita Kaal, etc.) — most entries have none. */
  muhurat?: {
    start: string; // "HH:mm" 24h IST
    end: string; // "HH:mm" 24h IST
    /** e.g. "Nishita Puja" — proper-noun content. */
    label?: string;
    anchor?: 'sunrise' | 'sunset' | 'midnight' | 'moonrise';
  };
}

export const HINDU_FESTIVALS: Record<string, HinduFestival[]> = {
  // -- 2025 --------------------------------------------------------------
  '2025-01-14': [{ name: 'Makar Sankranti', emoji: '🪁', importance: 'major' }],
  '2025-01-26': [{ name: 'Republic Day', emoji: '🇮🇳', importance: 'minor' }],
  '2025-02-02': [{ name: 'Vasant Panchami', emoji: '📚', importance: 'major' }],
  '2025-02-26': [{ name: 'Maha Shivaratri', emoji: '🔱', importance: 'major' }],
  '2025-03-13': [{ name: 'Holika Dahan', emoji: '🔥', importance: 'minor' }],
  '2025-03-14': [{ name: 'Holi', emoji: '🎨', importance: 'major' }],
  '2025-03-30': [{ name: 'Chaitra Navratri begins', emoji: '🪔', importance: 'major' }],
  '2025-04-06': [{ name: 'Rama Navami', emoji: '🏹', importance: 'major' }],
  '2025-04-12': [{ name: 'Hanuman Jayanti', emoji: '🐒', importance: 'major' }],
  '2025-04-30': [{ name: 'Akshaya Tritiya', emoji: '✨', importance: 'major' }],
  '2025-07-06': [{ name: 'Devshayani Ekadashi', emoji: '🕉', importance: 'minor' }],
  '2025-07-10': [{ name: 'Guru Purnima', emoji: '🌕', importance: 'major' }],
  '2025-08-09': [{ name: 'Raksha Bandhan', emoji: '🪢', importance: 'major' }],
  '2025-08-16': [{ name: 'Krishna Janmashtami', emoji: '🦚', importance: 'major' }],
  '2025-08-27': [{ name: 'Ganesh Chaturthi', emoji: '🐘', importance: 'major' }],
  '2025-09-22': [{ name: 'Sharad Navratri begins', emoji: '🪔', importance: 'major' }],
  '2025-09-30': [{ name: 'Durga Ashtami', emoji: '🗡', importance: 'major' }],
  '2025-10-02': [{ name: 'Vijayadashami (Dussehra)', emoji: '🏹', importance: 'major' }],
  '2025-10-10': [{ name: 'Karwa Chauth', emoji: '🌙', importance: 'major' }],
  '2025-10-18': [{ name: 'Dhanteras', emoji: '💰', importance: 'major' }],
  '2025-10-20': [{ name: 'Diwali (Lakshmi Puja)', emoji: '🪔', importance: 'major' }],
  '2025-10-22': [{ name: 'Govardhan Puja', emoji: '🐄', importance: 'minor' }],
  '2025-10-23': [{ name: 'Bhai Dooj', emoji: '👫', importance: 'minor' }],
  '2025-10-28': [{ name: 'Chhath Puja', emoji: '🌅', importance: 'major' }],
  '2025-11-15': [{ name: 'Tulsi Vivah', emoji: '🌿', importance: 'minor' }],
  '2025-11-25': [{ name: 'Utpanna Ekadashi', emoji: '🕉', importance: 'minor' }],
  '2025-12-01': [{ name: 'Mokshada Ekadashi (Gita Jayanti)', emoji: '📖', importance: 'major' }],

  // -- 2026 --------------------------------------------------------------
  '2026-01-14': [{ name: 'Makar Sankranti', emoji: '🪁', importance: 'major' }],
  '2026-01-23': [{ name: 'Vasant Panchami', emoji: '📚', importance: 'major' }],
  '2026-01-26': [{ name: 'Republic Day', emoji: '🇮🇳', importance: 'minor' }],
  '2026-02-15': [{ name: 'Maha Shivaratri', emoji: '🔱', importance: 'major' }],
  '2026-03-03': [{ name: 'Holika Dahan', emoji: '🔥', importance: 'minor' }],
  '2026-03-04': [{ name: 'Holi', emoji: '🎨', importance: 'major' }],
  '2026-03-19': [{ name: 'Chaitra Navratri begins', emoji: '🪔', importance: 'major' }],
  '2026-03-26': [{ name: 'Rama Navami', emoji: '🏹', importance: 'major' }],
  '2026-04-01': [{ name: 'Hanuman Jayanti', emoji: '🐒', importance: 'major' }],
  '2026-04-19': [{ name: 'Akshaya Tritiya', emoji: '✨', importance: 'major' }],
  '2026-06-25': [{ name: 'Devshayani Ekadashi', emoji: '🕉', importance: 'minor' }],
  '2026-06-29': [{ name: 'Guru Purnima', emoji: '🌕', importance: 'major' }],
  '2026-08-04': [{ name: 'Krishna Janmashtami', emoji: '🦚', importance: 'major' }],
  '2026-08-15': [{ name: 'Independence Day', emoji: '🇮🇳', importance: 'minor' }],
  '2026-08-16': [{ name: 'Ganesh Chaturthi', emoji: '🐘', importance: 'major' }],
  // Note: this table previously had Raksha Bandhan dated 2026-07-29 — wrong month.
  // drikpanchang.com confirms 2026-08-28 (Purnima Tithi ends 09:48 AM that day).
  '2026-08-28': [
    {
      name: 'Raksha Bandhan',
      emoji: '🪢',
      importance: 'major',
      muhurat: { start: '05:57', end: '09:48', anchor: 'sunrise', label: 'Rakhi Muhurat' },
    },
  ],
  '2026-09-11': [{ name: 'Sharad Navratri begins', emoji: '🪔', importance: 'major' }],
  '2026-09-19': [{ name: 'Durga Ashtami', emoji: '🗡', importance: 'major' }],
  '2026-09-21': [{ name: 'Vijayadashami (Dussehra)', emoji: '🏹', importance: 'major' }],
  '2026-09-29': [{ name: 'Karwa Chauth', emoji: '🌙', importance: 'major' }],
  '2026-11-06': [{ name: 'Dhanteras', emoji: '💰', importance: 'major' }],
  '2026-11-08': [{ name: 'Diwali (Lakshmi Puja)', emoji: '🪔', importance: 'major' }],
  '2026-11-10': [{ name: 'Govardhan Puja', emoji: '🐄', importance: 'minor' }],
  '2026-11-11': [{ name: 'Bhai Dooj', emoji: '👫', importance: 'minor' }],
  '2026-11-15': [{ name: 'Chhath Puja', emoji: '🌅', importance: 'major' }],
  '2026-12-20': [{ name: 'Mokshada Ekadashi (Gita Jayanti)', emoji: '📖', importance: 'major' }],

  // -- 2027 --------------------------------------------------------------
  '2027-01-14': [{ name: 'Makar Sankranti', emoji: '🪁', importance: 'major' }],
  '2027-01-26': [{ name: 'Republic Day', emoji: '🇮🇳', importance: 'minor' }],
  '2027-02-11': [{ name: 'Vasant Panchami', emoji: '📚', importance: 'major' }],
  '2027-03-06': [{ name: 'Maha Shivaratri', emoji: '🔱', importance: 'major' }],
  '2027-03-22': [{ name: 'Holika Dahan', emoji: '🔥', importance: 'minor' }],
  '2027-03-23': [{ name: 'Holi', emoji: '🎨', importance: 'major' }],
  '2027-04-08': [{ name: 'Chaitra Navratri begins', emoji: '🪔', importance: 'major' }],
  '2027-04-15': [{ name: 'Rama Navami', emoji: '🏹', importance: 'major' }],
  '2027-04-21': [{ name: 'Hanuman Jayanti', emoji: '🐒', importance: 'major' }],
  '2027-05-09': [{ name: 'Akshaya Tritiya', emoji: '✨', importance: 'major' }],
  '2027-07-14': [{ name: 'Devshayani Ekadashi', emoji: '🕉', importance: 'minor' }],
  '2027-07-18': [{ name: 'Guru Purnima', emoji: '🌕', importance: 'major' }],
  // Note: this table previously had Raksha Bandhan dated 2027-08-18 — off by a day.
  // drikpanchang.com confirms 2027-08-17.
  '2027-08-17': [
    {
      name: 'Raksha Bandhan',
      emoji: '🪢',
      importance: 'major',
      muhurat: { start: '05:51', end: '12:58', anchor: 'sunrise', label: 'Rakhi Muhurat' },
    },
  ],
  '2027-08-25': [{ name: 'Krishna Janmashtami', emoji: '🦚', importance: 'major' }],
  '2027-09-04': [{ name: 'Ganesh Chaturthi', emoji: '🐘', importance: 'major' }],
  '2027-09-30': [{ name: 'Sharad Navratri begins', emoji: '🪔', importance: 'major' }],
  '2027-10-07': [{ name: 'Durga Ashtami', emoji: '🗡', importance: 'major' }],
  '2027-10-08': [{ name: 'Vijayadashami (Dussehra)', emoji: '🏹', importance: 'major' }],
  '2027-10-18': [
    {
      name: 'Karwa Chauth',
      emoji: '🌙',
      importance: 'major',
      muhurat: { start: '17:49', end: '19:04', anchor: 'moonrise', label: 'Puja Muhurat' },
    },
  ],
  '2027-10-27': [
    {
      name: 'Dhanteras',
      emoji: '💰',
      importance: 'major',
      muhurat: { start: '18:42', end: '20:14', label: 'Pradosh Kaal Puja' },
    },
  ],
  '2027-10-29': [
    {
      name: 'Diwali (Lakshmi Puja)',
      emoji: '🪔',
      importance: 'major',
      muhurat: { start: '18:34', end: '19:05', label: 'Lakshmi Puja Muhurat' },
    },
  ],
  '2027-10-30': [
    {
      name: 'Govardhan Puja',
      emoji: '🐄',
      importance: 'minor',
      muhurat: { start: '06:31', end: '08:45', anchor: 'sunrise', label: 'Pratahkal Muhurat' },
    },
  ],
  '2027-10-31': [
    {
      name: 'Bhai Dooj',
      emoji: '👫',
      importance: 'minor',
      muhurat: { start: '13:11', end: '15:24', label: 'Aparahna Muhurat' },
    },
  ],
  '2027-11-04': [{ name: 'Chhath Puja', emoji: '🌅', importance: 'major' }],
  '2027-12-09': [{ name: 'Mokshada Ekadashi (Gita Jayanti)', emoji: '📖', importance: 'major' }],

  // -- 2028 --------------------------------------------------------------
  '2028-01-15': [
    {
      name: 'Makar Sankranti',
      emoji: '🪁',
      importance: 'major',
      muhurat: { start: '07:15', end: '17:46', anchor: 'sunrise', label: 'Punya Kaal' },
    },
  ],
  '2028-01-26': [{ name: 'Republic Day', emoji: '🇮🇳', importance: 'minor' }],
  '2028-01-31': [{ name: 'Vasant Panchami', emoji: '📚', importance: 'major' }],
  '2028-02-23': [
    {
      name: 'Maha Shivaratri',
      emoji: '🔱',
      importance: 'major',
      muhurat: { start: '00:09', end: '00:59', anchor: 'midnight', label: 'Nishita Kaal Puja' },
    },
  ],
  '2028-03-10': [
    {
      name: 'Holika Dahan',
      emoji: '🔥',
      importance: 'minor',
      muhurat: { start: '18:27', end: '20:52', label: 'Bhadra-free Dahan Muhurat' },
    },
  ],
  '2028-03-11': [{ name: 'Holi', emoji: '🎨', importance: 'major' }],
  '2028-03-27': [{ name: 'Chaitra Navratri begins', emoji: '🪔', importance: 'major' }],
  '2028-04-03': [{ name: 'Rama Navami', emoji: '🏹', importance: 'major' }],
  '2028-04-09': [{ name: 'Hanuman Jayanti', emoji: '🐒', importance: 'major' }],
  '2028-04-27': [
    {
      name: 'Akshaya Tritiya',
      emoji: '✨',
      importance: 'major',
      muhurat: { start: '05:44', end: '12:19', anchor: 'sunrise', label: 'Puja Muhurat' },
    },
  ],
  '2028-07-02': [{ name: 'Devshayani Ekadashi', emoji: '🕉', importance: 'minor' }],
  '2028-07-06': [{ name: 'Guru Purnima', emoji: '🌕', importance: 'major' }],
  '2028-08-05': [{ name: 'Raksha Bandhan', emoji: '🪢', importance: 'major' }],
  '2028-08-13': [
    {
      name: 'Krishna Janmashtami',
      emoji: '🦚',
      importance: 'major',
      muhurat: { start: '00:04', end: '00:48', anchor: 'midnight', label: 'Nishita Puja' },
    },
  ],
  '2028-08-15': [{ name: 'Independence Day', emoji: '🇮🇳', importance: 'minor' }],
  '2028-08-23': [{ name: 'Ganesh Chaturthi', emoji: '🐘', importance: 'major' }],
};

export function getFestivalsForDate(date: string): HinduFestival[] {
  return HINDU_FESTIVALS[date] ?? [];
}
