import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_DREAMS } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_DREAMS);

export default function DreamsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_DREAMS)} />
      {children}
    </>
  );
}
