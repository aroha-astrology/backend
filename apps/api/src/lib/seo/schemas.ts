import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, absoluteUrl } from './site';

type Schema = Record<string, unknown>;

export function organizationSchema(): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl('/logo.png'),
    description: SITE_DESCRIPTION,
    sameAs: [],
  };
}

export function websiteSchema(): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: 'en',
  };
}

export function breadcrumbSchema(trail: { name: string; path: string }[]): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function faqSchema(qa: { q: string; a: string }[]): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qa.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: a,
      },
    })),
  };
}

export function howToSchema(opts: {
  name: string;
  description?: string;
  steps: { name: string; text: string }[];
}): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: opts.name,
    description: opts.description,
    step: opts.steps.map((s, idx) => ({
      '@type': 'HowToStep',
      position: idx + 1,
      name: s.name,
      text: s.text,
    })),
  };
}

export function webApplicationSchema(opts: {
  name: string;
  description: string;
  url: string;
  applicationCategory?: string;
  featureList?: string[];
  isFree?: boolean;
}): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: opts.name,
    description: opts.description,
    url: absoluteUrl(opts.url),
    applicationCategory: opts.applicationCategory ?? 'LifestyleApplication',
    operatingSystem: 'Any',
    featureList: opts.featureList,
    offers: opts.isFree
      ? {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'INR',
        }
      : undefined,
  };
}
