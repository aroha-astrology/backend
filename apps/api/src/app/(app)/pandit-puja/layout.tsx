import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_PANDIT_PUJA } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_PANDIT_PUJA);

export default function PanditPujaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_PANDIT_PUJA)} />
      {children}
    </>
  );
}
