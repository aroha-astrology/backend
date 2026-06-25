// Curated list of major Hindu festivals (Gregorian date keyed).
//
// Hindu festivals are tithi-based, and their Gregorian dates shift each
// year. Computing them from first principles requires lunar-month logic
// that the panchang engine doesn't yet expose, so this is a hand-maintained
// table covering 2025–2027 sourced from drikpanchang.com.
//
// Add years/festivals over time. Keys are local date strings (YYYY-MM-DD)
// using the standard Indian panchang reckoning (IST sunrise rule).

export interface HinduFestival {
  name: string;
  emoji: string;
  // 'major'  → coloured highlight in calendar cell
  // 'minor'  → dot indicator only (kept terse to avoid clutter)
  importance: 'major' | 'minor';
}

// One date can have multiple festivals — store as array.
export const HINDU_FESTIVALS: Record<string, HinduFestival[]> = {
  // ── 2025 ────────────────────────────────────────────────────────────────
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

  // ── 2026 ────────────────────────────────────────────────────────────────
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
  '2026-07-29': [{ name: 'Raksha Bandhan', emoji: '🪢', importance: 'major' }],
  '2026-08-04': [{ name: 'Krishna Janmashtami', emoji: '🦚', importance: 'major' }],
  '2026-08-15': [{ name: 'Independence Day', emoji: '🇮🇳', importance: 'minor' }],
  '2026-08-16': [{ name: 'Ganesh Chaturthi', emoji: '🐘', importance: 'major' }],
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

  // ── 2027 ────────────────────────────────────────────────────────────────
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
  '2027-08-18': [{ name: 'Raksha Bandhan', emoji: '🪢', importance: 'major' }],
  '2027-08-25': [{ name: 'Krishna Janmashtami', emoji: '🦚', importance: 'major' }],
  '2027-09-04': [{ name: 'Ganesh Chaturthi', emoji: '🐘', importance: 'major' }],
  '2027-10-08': [{ name: 'Vijayadashami (Dussehra)', emoji: '🏹', importance: 'major' }],
  '2027-10-27': [{ name: 'Diwali (Lakshmi Puja)', emoji: '🪔', importance: 'major' }],
};

export function getFestivalsForDate(date: string): HinduFestival[] {
  return HINDU_FESTIVALS[date] ?? [];
}

export function hasMajorFestival(date: string): boolean {
  return (HINDU_FESTIVALS[date] ?? []).some((f) => f.importance === 'major');
}
