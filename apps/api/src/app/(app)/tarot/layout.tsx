import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_TAROT } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_TAROT);

export default function TarotLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_TAROT)} />
      {children}
    </>
  );
}
