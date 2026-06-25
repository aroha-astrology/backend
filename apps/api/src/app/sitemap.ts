import type { MetadataRoute } from 'next';
import fs from 'node:fs';
import path from 'node:path';

const _rawUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://arohaastrology.in';
const SITE_URL = (_rawUrl.startsWith('http') ? _rawUrl : `https://${_rawUrl}`).replace(/\/$/, '');

type Entry = {
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  // file path relative to apps/web/src/app — used to read real mtime.
  // For routes inside the (app) route group, prefix with '(app)/'.
  source: string;
};

const ROUTES: Entry[] = [
  { path: '/',                    priority: 1.0,  changeFrequency: 'daily',   source: 'page.tsx' },
  { path: '/login',               priority: 0.4,  changeFrequency: 'yearly',  source: '(auth)/login/page.tsx' },
  { path: '/signup',              priority: 0.7,  changeFrequency: 'monthly', source: '(auth)/signup/page.tsx' },

  { path: '/kundli/generate',     priority: 0.95, changeFrequency: 'weekly',  source: '(app)/kundli/generate/page.tsx' },
  { path: '/match/new',           priority: 0.9,  changeFrequency: 'weekly',  source: '(app)/match/new/page.tsx' },

  { path: '/horoscope/daily',     priority: 0.95, changeFrequency: 'daily',   source: '(app)/horoscope/daily/page.tsx' },
  { path: '/horoscope/weekly',    priority: 0.9,  changeFrequency: 'weekly',  source: '(app)/horoscope/weekly/page.tsx' },
  { path: '/horoscope/monthly',   priority: 0.85, changeFrequency: 'monthly', source: '(app)/horoscope/monthly/page.tsx' },
  { path: '/horoscope/yearly',    priority: 0.8,  changeFrequency: 'yearly',  source: '(app)/horoscope/yearly/page.tsx' },

  { path: '/panchang',            priority: 0.9,  changeFrequency: 'daily',   source: '(app)/panchang/page.tsx' },
  { path: '/calendar',            priority: 0.8,  changeFrequency: 'daily',   source: '(app)/calendar/page.tsx' },
  { path: '/muhurta',             priority: 0.8,  changeFrequency: 'weekly',  source: '(app)/muhurta/page.tsx' },
  { path: '/gochar',              priority: 0.8,  changeFrequency: 'daily',   source: '(app)/gochar/page.tsx' },
  { path: '/varshaphal',          priority: 0.75, changeFrequency: 'monthly', source: '(app)/varshaphal/page.tsx' },
  { path: '/vargas',              priority: 0.7,  changeFrequency: 'monthly', source: '(app)/vargas/page.tsx' },
  { path: '/kp-system',           priority: 0.7,  changeFrequency: 'monthly', source: '(app)/kp-system/page.tsx' },

  { path: '/baby-names',          priority: 0.85, changeFrequency: 'monthly', source: '(app)/baby-names/page.tsx' },
  { path: '/gemstone',            priority: 0.85, changeFrequency: 'monthly', source: '(app)/gemstone/page.tsx' },
  { path: '/vastu',               priority: 0.8,  changeFrequency: 'monthly', source: '(app)/vastu/page.tsx' },
  { path: '/tarot',               priority: 0.8,  changeFrequency: 'weekly',  source: '(app)/tarot/page.tsx' },
  { path: '/palm',                priority: 0.75, changeFrequency: 'monthly', source: '(app)/palm/page.tsx' },
  { path: '/dreams',              priority: 0.75, changeFrequency: 'monthly', source: '(app)/dreams/page.tsx' },
  { path: '/prashna',             priority: 0.75, changeFrequency: 'monthly', source: '(app)/prashna/page.tsx' },
  { path: '/remedies',            priority: 0.8,  changeFrequency: 'monthly', source: '(app)/remedies/page.tsx' },

  { path: '/life-journey',        priority: 0.85, changeFrequency: 'monthly', source: '(app)/life-journey/page.tsx' },
  { path: '/life-journey/phase',  priority: 0.7,  changeFrequency: 'monthly', source: '(app)/life-journey/phase/page.tsx' },
  { path: '/past-life',           priority: 0.75, changeFrequency: 'monthly', source: '(app)/past-life/page.tsx' },
  { path: '/guna-chakra',         priority: 0.8,  changeFrequency: 'monthly', source: '(app)/guna-chakra/page.tsx' },
  { path: '/couple',              priority: 0.8,  changeFrequency: 'monthly', source: '(app)/couple/page.tsx' },

  { path: '/reports/premium',     priority: 0.9,  changeFrequency: 'weekly',  source: '(app)/reports/premium/page.tsx' },
  { path: '/pandit-puja',         priority: 0.85, changeFrequency: 'weekly',  source: '(app)/pandit-puja/page.tsx' },
];

function getMtime(source: string): Date {
  try {
    const filePath = path.join(process.cwd(), 'src', 'app', source);
    return fs.statSync(filePath).mtime;
  } catch {
    return new Date();
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map(({ path: routePath, priority, changeFrequency, source }) => ({
    url: `${SITE_URL}${routePath}`,
    lastModified: getMtime(source),
    changeFrequency,
    priority,
  }));
}
