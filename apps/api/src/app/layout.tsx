import type { Metadata, Viewport } from 'next';
import { Cinzel, Inter, JetBrains_Mono, Noto_Sans_Devanagari } from 'next/font/google';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { TranslationProvider } from '@/components/providers/TranslationProvider';
import { GlobalErrorListener } from '@/components/GlobalErrorListener';
import { Toaster } from 'sonner';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { SwRegister } from '@/components/SwRegister';
import { SmartAppBanner } from '@/components/SmartAppBanner';
import { JsonLd } from '@/components/seo/JsonLd';
import { organizationSchema, websiteSchema } from '@/lib/seo/schemas';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import './globals.css';
import { APP_NAME, APP_TAGLINE } from '@/lib/constants';

export const viewport: Viewport = {
  themeColor: '#11131A',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['300', '400', '500', '600', '700'],
});

const cinzel = Cinzel({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-cinzel',
  weight: ['400', '500', '600', '700'],
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  weight: ['400', '500', '600'],
});

const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  display: 'swap',
  variable: '--font-devanagari',
  weight: ['400', '500', '600', '700'],
});

const rawUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://arohaastrology.in';
const SITE_URL = (rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`).replace(/\/$/, '');

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${APP_NAME} — ${APP_TAGLINE}`,
    template: `%s | ${APP_NAME}`,
  },
  description:
    'Get accurate Kundli, horoscope predictions, matchmaking, and Vedic remedies powered by Swiss Ephemeris calculations and AI interpretation.',
  keywords: [
    'vedic astrology',
    'kundli',
    'free kundli online',
    'horoscope',
    'daily horoscope',
    'jyotish',
    'kundli matching',
    'panchang',
    'muhurta',
    'gemstone recommendation',
    'baby names',
    'vastu',
    'astrology AI',
  ],
  applicationName: APP_NAME,
  category: 'lifestyle',
  authors: [{ name: APP_NAME }],
  creator: APP_NAME,
  publisher: APP_NAME,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: APP_NAME,
    title: `${APP_NAME} — ${APP_TAGLINE}`,
    description:
      'Accurate Kundli, horoscope, matchmaking and remedies — Swiss Ephemeris precision with AI-driven interpretation.',
    url: SITE_URL,
    locale: 'en_US',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: APP_NAME }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME} — ${APP_TAGLINE}`,
    description:
      'Accurate Kundli, horoscope, matchmaking and remedies, powered by Swiss Ephemeris and AI.',
    images: ['/logo.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  verification: {
    google: 'DvMEvViCIzvcoIJC1M6uwx3QANI8xMtQltaDLYpTAgY',
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${cinzel.variable} ${jetBrainsMono.variable} ${notoDevanagari.variable} font-sans antialiased`}
      >
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <TranslationProvider>{children}</TranslationProvider>
              <GlobalErrorListener />
              <Toaster
                position="top-right"
                toastOptions={{
                  style: {
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                  },
                }}
              />
            </AuthProvider>
          </QueryProvider>
          <SmartAppBanner />
          <Analytics />
          <SpeedInsights />
          <SwRegister />
          <JsonLd data={[organizationSchema(), websiteSchema()]} />
        </ThemeProvider>
      </body>
    </html>
  );
}
