import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_GUNA_CHAKRA } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_GUNA_CHAKRA);

export default function GunaChakraLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_GUNA_CHAKRA)} />
      {children}
    </>
  );
}
