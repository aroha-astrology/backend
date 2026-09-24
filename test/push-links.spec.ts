import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every push/inbox deep link (`link:` for notifyUser, `navigate:` for raw FCM
 * data) is opened by the frontend with router.push(), so a path the web app
 * doesn't have lands the user on a 404. That shipped once: the fact-nudge push
 * linked to `/chat` while the page is `/ai-chat`.
 *
 * The frontend is a separate repo, so its routes are listed here by hand —
 * mirror frontend/app/**\/page.tsx. Add a route here when a push starts
 * linking to a new screen.
 */
const FRONTEND_ROUTES: RegExp[] = [
  /^\/$/,
  /^\/ai-chat$/,
  /^\/chat-history$/,
  /^\/compatibility$/,
  /^\/gemstones$/,
  /^\/gita\/[^/]+$/,
  /^\/help$/,
  /^\/horoscope$/,
  /^\/kundli$/,
  /^\/palm$/,
  /^\/palm\/[^/]+$/,
  /^\/panchang$/,
  /^\/payment$/,
  /^\/profile$/,
  /^\/profile\/orders$/,
  /^\/remedies$/,
  /^\/reports$/,
  /^\/reports\/history$/,
  /^\/reports\/[^/]+$/,
  /^\/rewards$/,
  /^\/settings$/,
  /^\/settings\/history$/,
  /^\/shlokas$/,
  /^\/shlokas\/[^/]+$/,
  /^\/vastu$/,
];

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

const SRC = fileURLToPath(new URL('../src', import.meta.url));
// `link: '/x'`, `navigate: "/x"`, `link: \`/reports/${id}\`` — string literals only.
const LINK_RE = /\b(?:link|navigate):\s*(['"`])(\/[^'"`]*)\1/g;

function pushLinks(): { file: string; path: string }[] {
  const found: { file: string; path: string }[] = [];
  for (const file of tsFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(LINK_RE)) {
      found.push({ file: relative(SRC, file), path: match[2]! });
    }
  }
  return found;
}

describe('push notification deep links', () => {
  it('finds the push senders (guards against the regex silently matching nothing)', () => {
    expect(pushLinks().length).toBeGreaterThanOrEqual(10);
  });

  it('every link opens a screen the web app actually has', () => {
    const broken = pushLinks().filter(({ path }) => {
      const route = path.replace(/\$\{[^}]+\}/g, 'id').split(/[?#]/)[0]!;
      return !FRONTEND_ROUTES.some((re) => re.test(route));
    });
    expect(broken).toEqual([]);
  });
});
