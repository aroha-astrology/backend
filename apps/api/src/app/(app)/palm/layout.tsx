import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_PALM } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_PALM);

export default function PalmLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_PALM)} />
      {children}
    </>
  );
}
