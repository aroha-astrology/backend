import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_REPORTS_PREMIUM } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_REPORTS_PREMIUM);

export default function ReportsPremiumLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_REPORTS_PREMIUM)} />
      {children}
    </>
  );
}
