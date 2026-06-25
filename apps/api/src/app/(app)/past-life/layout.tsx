import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_PAST_LIFE } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_PAST_LIFE);

export default function PastLifeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_PAST_LIFE)} />
      {children}
    </>
  );
}
