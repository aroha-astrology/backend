import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolMetadata, toolSchemas } from '@/lib/seo/page';
import { SEO_LIFE_JOURNEY_PHASE } from '@/lib/seo/content';

export const metadata: Metadata = toolMetadata(SEO_LIFE_JOURNEY_PHASE);

export default function LifeJourneyPhaseLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={toolSchemas(SEO_LIFE_JOURNEY_PHASE)} />
      {children}
    </>
  );
}
