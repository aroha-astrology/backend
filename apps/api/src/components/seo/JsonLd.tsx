import type { JSX } from 'react';

type SchemaObject = Record<string, unknown>;

export function JsonLd({ data }: { data: SchemaObject | SchemaObject[] }): JSX.Element {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
