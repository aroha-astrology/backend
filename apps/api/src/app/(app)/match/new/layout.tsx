import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_MATCH_NEW } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_MATCH_NEW);

export default function MatchNewLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_MATCH_NEW)} />
      {children}
    </>
  );
}
