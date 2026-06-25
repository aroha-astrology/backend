import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_BABY_NAMES } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_BABY_NAMES);

export default function BabyNamesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_BABY_NAMES)} />
      {children}
    </>
  );
}
