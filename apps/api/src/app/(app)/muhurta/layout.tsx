import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_MUHURTA } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_MUHURTA);

export default function MuhurtaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_MUHURTA)} />
      {children}
    </>
  );
}
