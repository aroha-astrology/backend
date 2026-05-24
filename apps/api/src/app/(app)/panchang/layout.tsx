import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { FaqSection } from '@/components/seo/FaqSection';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_PANCHANG } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_PANCHANG);

export default function PanchangLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_PANCHANG)} />
      {children}
      <FaqSection seo={SEO_PANCHANG} />
    </>
  );
}
