import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_HOROSCOPE_DAILY } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_HOROSCOPE_DAILY);

export default function HoroscopeDailyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_HOROSCOPE_DAILY)} />
      {children}
    </>
  );
}
