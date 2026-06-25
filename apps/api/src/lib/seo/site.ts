import { APP_NAME, APP_TAGLINE } from '@/lib/constants';

const _rawSiteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://arohaastrology.in';
export const SITE_URL = (_rawSiteUrl.startsWith('http') ? _rawSiteUrl : `https://${_rawSiteUrl}`).replace(/\/$/, '');
export const SITE_NAME = APP_NAME;
export const SITE_TAGLINE = APP_TAGLINE;

export const SITE_DESCRIPTION =
  'Free Vedic kundli, accurate panchang, daily horoscope, kundli matching, and personalized remedies — Swiss Ephemeris precision with AI-driven interpretation.';

export const OG_IMAGE = '/logo.png';

export function absoluteUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}
