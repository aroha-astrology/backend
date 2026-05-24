import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_GOCHAR } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_GOCHAR);

export default function GocharLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_GOCHAR)} />
      {children}
    </>
  );
}
