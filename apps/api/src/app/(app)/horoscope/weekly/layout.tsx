import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_HOROSCOPE_WEEKLY } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_HOROSCOPE_WEEKLY);

export default function HoroscopeWeeklyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_HOROSCOPE_WEEKLY)} />
      {children}
    </>
  );
}
