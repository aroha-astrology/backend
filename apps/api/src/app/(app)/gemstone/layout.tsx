import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_GEMSTONE } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_GEMSTONE);

export default function GemstoneLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_GEMSTONE)} />
      {children}
    </>
  );
}
