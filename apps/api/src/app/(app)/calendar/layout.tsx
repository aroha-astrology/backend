import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_CALENDAR } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_CALENDAR);

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_CALENDAR)} />
      {children}
    </>
  );
}
