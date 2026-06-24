import type { Metadata } from 'next';
import { OG_IMAGE } from './site';
import {
  breadcrumbSchema,
  faqSchema,
  howToSchema,
  webApplicationSchema,
} from './schemas';
import { getBreadcrumbs } from './breadcrumbs';

export type FaqItem = { q: string; a: string; id?: string };
export type HowToStep = { name: string; text: string };

export type ToolPageSeo = {
  path: string;
  title: string;
  description: string;
  faqs?: FaqItem[];
  howTo?: { name: string; description?: string; steps: HowToStep[] };
  featureList?: string[];
  isFree?: boolean;
};

export function toolMetadata(seo: ToolPageSeo): Metadata {
  return {
    title: seo.title,
    description: seo.description,
    alternates: { canonical: seo.path },
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: seo.path,
      type: 'website',
      images: [{ url: OG_IMAGE }],
    },
    twitter: {
      card: 'summary_large_image',
      title: seo.title,
      description: seo.description,
    },
  };
}

export function toolSchemas(seo: ToolPageSeo) {
  const schemas: Record<string, unknown>[] = [];
  const trail = getBreadcrumbs(seo.path);
  if (trail) schemas.push(breadcrumbSchema(trail));
  schemas.push(
    webApplicationSchema({
      name: seo.title,
      description: seo.description,
      url: seo.path,
      featureList: seo.featureList,
      isFree: seo.isFree,
    }),
  );
  if (seo.howTo) schemas.push(howToSchema(seo.howTo));
  if (seo.faqs && seo.faqs.length > 0) schemas.push(faqSchema(seo.faqs));
  return schemas;
}
