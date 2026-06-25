import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_VARSHAPHAL } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_VARSHAPHAL);

export default function VarshaphalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_VARSHAPHAL)} />
      {children}
    </>
  );
}
