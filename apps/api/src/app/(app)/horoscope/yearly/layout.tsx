import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { FaqSection } from '@/components/seo/FaqSection';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_HOROSCOPE_YEARLY } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_HOROSCOPE_YEARLY);

export default function HoroscopeYearlyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_HOROSCOPE_YEARLY)} />
      {children}
      <FaqSection seo={SEO_HOROSCOPE_YEARLY} />
    </>
  );
}
