import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { GitaVersesResponseSchema } from './gita.schemas.js';

interface GitaVerseRecord {
  id: string;
  chapter: number;
  verse: number;
  sanskrit: string;
  mainCategory: string;
  tags: string[];
}

/**
 * The Bhagavad Gita — 701 verses, Devanagari only (no translation, no IAST),
 * grouped into 10 categories with need-tags ("for anxiety", "for grief")
 * generated once offline and hand spot-checked. Deliberately kept SEPARATE
 * from the Shlokas & Japs feature (nav.shlokas/home.shlokas): different scale
 * (701 vs 50 verses), different content shape (Sanskrit-only, no 7-language
 * fields), and its audio is far too large (~57MB) to ship as a frontend
 * public/ asset the way the 50 mantras do. This module is the whole surface —
 * content here, audio streamed from the /gita/audio/* static mount in app.ts.
 *
 * Read once at import time, not per-request — this file changes only via a
 * deploy, never at runtime, and re-reading+re-parsing 280KB on every request
 * for no reason is wasted work. Mirrors the module-scope-constant style
 * FEATURE_REGISTRY already uses in config/features.ts.
 */
// Resolved against process.cwd(), not import.meta.url — the tsup build
// flattens everything into a single dist/index.js, so a path relative to the
// compiled file's own location would sit at a different depth from repo root
// in dev (src/modules/gita/) vs prod (dist/). cwd is always the repo root in
// both cases (npm run dev and the deployed pm2 process both start there) —
// same reasoning src/lib/palm/storage.ts's PALM_UPLOAD_DIR resolution uses.
const CONTENT_PATH = resolve(process.cwd(), 'data/gita-content.json');
const VERSES = JSON.parse(readFileSync(CONTENT_PATH, 'utf-8')) as GitaVerseRecord[];

export const gitaRouter = new OpenAPIHono();

const listVersesRoute = createRoute({
  method: 'get',
  path: '/gita/verses',
  tags: ['Gita'],
  summary: 'All 701 Bhagavad Gita verses (Sanskrit, category, need-tags)',
  responses: {
    200: {
      description: 'The full verse list',
      content: { 'application/json': { schema: GitaVersesResponseSchema } },
    },
  },
});

gitaRouter.openapi(listVersesRoute, async (c) => {
  return c.json({ verses: VERSES }, 200);
});
