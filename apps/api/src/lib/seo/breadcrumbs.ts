type Crumb = { name: string; path: string };

const HOME: Crumb = { name: 'Home', path: '/' };

export const BREADCRUMBS: Record<string, Crumb[]> = {
  '/': [HOME],

  '/panchang':          [HOME, { name: 'Panchang', path: '/panchang' }],
  '/calendar':          [HOME, { name: 'Hindu Calendar', path: '/calendar' }],
  '/muhurta':           [HOME, { name: 'Muhurta', path: '/muhurta' }],
  '/gochar':            [HOME, { name: 'Transit (Gochar)', path: '/gochar' }],

  '/horoscope':         [HOME, { name: 'Horoscope', path: '/horoscope' }],
  '/horoscope/daily':   [HOME, { name: 'Horoscope', path: '/horoscope' }, { name: 'Daily', path: '/horoscope/daily' }],
  '/horoscope/weekly':  [HOME, { name: 'Horoscope', path: '/horoscope' }, { name: 'Weekly', path: '/horoscope/weekly' }],
  '/horoscope/monthly': [HOME, { name: 'Horoscope', path: '/horoscope' }, { name: 'Monthly', path: '/horoscope/monthly' }],
  '/horoscope/yearly':  [HOME, { name: 'Horoscope', path: '/horoscope' }, { name: 'Yearly', path: '/horoscope/yearly' }],

  '/baby-names':        [HOME, { name: 'Baby Names', path: '/baby-names' }],
  '/gemstone':          [HOME, { name: 'Gemstone Recommendation', path: '/gemstone' }],
  '/vastu':             [HOME, { name: 'Vastu Shastra', path: '/vastu' }],
  '/tarot':             [HOME, { name: 'Tarot Reading', path: '/tarot' }],
  '/palm':              [HOME, { name: 'Palmistry', path: '/palm' }],
  '/dreams':            [HOME, { name: 'Dream Analysis', path: '/dreams' }],
  '/prashna':           [HOME, { name: 'Prashna Kundli', path: '/prashna' }],
  '/remedies':          [HOME, { name: 'Vedic Remedies', path: '/remedies' }],

  '/varshaphal':        [HOME, { name: 'Varshaphal', path: '/varshaphal' }],
  '/vargas':            [HOME, { name: 'Divisional Charts', path: '/vargas' }],
  '/kp-system':         [HOME, { name: 'KP Astrology', path: '/kp-system' }],

  '/life-journey':       [HOME, { name: 'Life Journey', path: '/life-journey' }],
  '/life-journey/phase': [HOME, { name: 'Life Journey', path: '/life-journey' }, { name: 'Phase', path: '/life-journey/phase' }],
  '/couple':             [HOME, { name: 'Couple Compatibility', path: '/couple' }],

  '/reports/premium':   [HOME, { name: 'Premium Reports', path: '/reports/premium' }],
  '/pandit-puja':       [HOME, { name: 'Pandit Puja', path: '/pandit-puja' }],

  '/kundli':            [HOME, { name: 'Kundli', path: '/kundli' }],
  '/kundli/generate':   [HOME, { name: 'Kundli', path: '/kundli' }, { name: 'Generate Free Kundli', path: '/kundli/generate' }],
  '/match/new':         [HOME, { name: 'Kundli Matching', path: '/match/new' }],
};

export function getBreadcrumbs(pathname: string): Crumb[] | null {
  return BREADCRUMBS[pathname] ?? null;
}
