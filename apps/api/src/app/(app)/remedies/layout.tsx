import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_REMEDIES } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_REMEDIES);

export default function RemediesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_REMEDIES)} />
      {children}
    </>
  );
}
