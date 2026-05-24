import type { ToolPageSeo } from '@/lib/seo/page';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}

type Props = {
  seo: ToolPageSeo;
  heading?: string;
};

export function FaqSection({ seo, heading = 'Frequently asked questions' }: Props) {
  if (!seo.faqs || seo.faqs.length === 0) return null;
  return (
    <section
      aria-label="Frequently asked questions"
      className="mx-auto w-full max-w-3xl px-4 py-12"
    >
      <h2 className="mb-6 text-2xl font-semibold text-[var(--text)]">{heading}</h2>
      <dl className="space-y-6">
        {seo.faqs.map((item) => {
          const anchor = item.id ?? slugify(item.q);
          return (
            <div
              key={anchor}
              id={anchor}
              className="scroll-mt-24 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
            >
              <dt>
                <h3 className="text-base font-medium text-[var(--text)]">{item.q}</h3>
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                {item.a}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
