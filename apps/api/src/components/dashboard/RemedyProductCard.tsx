'use client';

import { ExternalLink } from 'lucide-react';

interface Props {
  name: string;
  description?: string;
  googleShoppingQuery: string;
}

/**
 * Single product remedy card. Opens Google Shopping for the suggested item —
 * lets the user compare prices and vendors without us picking a retailer.
 */
export function RemedyProductCard({ name, description, googleShoppingQuery }: Props) {
  const href = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(googleShoppingQuery)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 mt-3 rounded-2xl border border-border bg-surface p-3 no-underline transition-transform active:scale-[0.98] hover:border-warning/60"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/10 text-2xl">
        🪔
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text truncate">{name}</p>
        {description && (
          <p className="text-[11px] text-text-muted line-clamp-2">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-1 text-[11px] font-medium text-warning shrink-0">
        Shop
        <ExternalLink size={12} />
      </div>
    </a>
  );
}
