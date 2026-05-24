import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_COUPLE } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_COUPLE);

export default function CoupleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_COUPLE)} />
      {children}
    </>
  );
}
