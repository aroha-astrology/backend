/**
 * The 15 app languages as the server sees them for push notifications and other server-written copy.
 *
 * The older copy tables (modules/cron/broadcast-copy.ts and friends) know the first seven; the eight added
 * ones live in lib/push-copy/*. `lang.pushAll` decides whether the extra eight are used: with the switch off
 * a Kannada or Spanish reader still gets English, exactly as before.
 */

export const LEGACY_PUSH_LANGS = ['en', 'hi', 'bn', 'mr', 'te', 'ta', 'gu'] as const;
export const EXTRA_PUSH_LANGS = ['kn', 'es', 'fr', 'de', 'pt', 'it', 'ru', 'ja'] as const;
export const PUSH_LANGS = [...LEGACY_PUSH_LANGS, ...EXTRA_PUSH_LANGS] as const;

export type LegacyPushLang = (typeof LEGACY_PUSH_LANGS)[number];
export type ExtraPushLang = (typeof EXTRA_PUSH_LANGS)[number];
export type PushLang = (typeof PUSH_LANGS)[number];

export function isExtraPushLang(lang: string): lang is ExtraPushLang {
  return (EXTRA_PUSH_LANGS as readonly string[]).includes(lang);
}

/**
 * A free-form locale ("hi-IN", "de_DE", null) as one of our languages. Anything unknown is English. When
 * `allLanguages` is false (the lang.pushAll switch is off) the eight extra languages also fall back to English.
 */
export function normalizePushLang(locale: string | null | undefined, allLanguages: boolean): PushLang {
  if (!locale) return 'en';
  const base = locale.split(/[-_]/)[0]?.toLowerCase() ?? '';
  const pool: readonly string[] = allLanguages ? PUSH_LANGS : LEGACY_PUSH_LANGS;
  return pool.includes(base) ? (base as PushLang) : 'en';
}

/** Replaces `{name}`-style placeholders; an unknown placeholder is left as it is. */
export function fillCopy(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => vars[key] ?? whole);
}
