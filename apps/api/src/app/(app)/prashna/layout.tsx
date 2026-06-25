import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_PRASHNA } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_PRASHNA);

export default function PrashnaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_PRASHNA)} />
      {children}
    </>
  );
}
