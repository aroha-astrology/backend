import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_VARGAS } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_VARGAS);

export default function VargasLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_VARGAS)} />
      {children}
    </>
  );
}
