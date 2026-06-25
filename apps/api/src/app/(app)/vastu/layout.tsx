import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_VASTU } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_VASTU);

export default function VastuLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_VASTU)} />
      {children}
    </>
  );
}
