'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { lookupDict } from '@/lib/i18n/dictionary';

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'SVG', 'PATH', 'CIRCLE', 'LINE', 'POLYLINE', 'RECT', 'TEXTAREA', 'INPUT',
]);

const CACHE_KEY = (lang: string) => `i18n-cache:${lang}`;
const NODE_ORIG = '__i18nOrig';
const NODE_LANG = '__i18nLang';
const SKELETON_ATTR = 'data-i18n-pending';

function ensureSkeletonStyle() {
  if (typeof document === 'undefined' || document.getElementById('i18n-skel')) return;
  const s = document.createElement('style');
  s.id = 'i18n-skel';
  s.textContent = `
    [data-i18n-pending]{color:transparent!important;background:linear-gradient(90deg,rgba(128,128,128,.12) 25%,rgba(128,128,128,.28) 50%,rgba(128,128,128,.12) 75%);background-size:400% 100%;animation:i18n-shimmer 1.4s ease infinite;border-radius:4px;display:inline-block;min-width:40px}
    @keyframes i18n-shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}
  `;
  document.head.appendChild(s);
}

interface TaggedText extends Text {
  [NODE_ORIG]?: string;
  [NODE_LANG]?: string;
}

function loadCache(lang: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(CACHE_KEY(lang));
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveCache(lang: string, cache: Record<string, string>) {
  try {
    localStorage.setItem(CACHE_KEY(lang), JSON.stringify(cache));
  } catch { /* quota */ }
}

function inSkippedSubtree(node: Text): boolean {
  let p: Node | null = node.parentNode;
  while (p && p.nodeType === Node.ELEMENT_NODE) {
    const el = p as HTMLElement;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.hasAttribute('data-no-translate')) return true;
    if (el.getAttribute('contenteditable') === 'true') return true;
    p = el.parentNode;
  }
  return false;
}

function looksTranslatable(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  return /[a-zA-Z]/.test(trimmed);
}

function collectTextNodes(root: HTMLElement): TaggedText[] {
  const out: TaggedText[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const t = n as TaggedText;
      if (inSkippedSubtree(t)) return NodeFilter.FILTER_REJECT;
      if (t[NODE_ORIG] != null) return NodeFilter.FILTER_ACCEPT;
      return looksTranslatable(t.nodeValue ?? '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  let node = walker.nextNode();
  while (node) {
    out.push(node as TaggedText);
    node = walker.nextNode();
  }
  return out;
}

async function translateBatch(texts: string[], targetLang: string): Promise<string[]> {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts, targetLang }),
  });
  if (!res.ok) throw new Error(`translate failed ${res.status}`);
  const data = (await res.json()) as { success: boolean; translations?: string[]; error?: string };
  if (!data.success || !data.translations) throw new Error(data.error ?? 'translate failed');
  return data.translations;
}

function applySingle(node: TaggedText, translated: string, lang: string) {
  const orig = node[NODE_ORIG] ?? node.nodeValue ?? '';
  const leading = orig.match(/^\s*/)?.[0] ?? '';
  const trailing = orig.match(/\s*$/)?.[0] ?? '';
  const next = leading + translated + trailing;
  if (node.nodeValue !== next) node.nodeValue = next;
  node[NODE_LANG] = lang;
}

function markSkeleton(nodes: TaggedText[]) {
  const parents = new Set<HTMLElement>();
  for (const n of nodes) {
    if (n.parentElement) parents.add(n.parentElement);
  }
  parents.forEach(el => el.setAttribute(SKELETON_ATTR, ''));
}

function clearSkeleton(nodes: TaggedText[]) {
  const parents = new Set<HTMLElement>();
  for (const n of nodes) {
    if (n.parentElement) parents.add(n.parentElement);
  }
  parents.forEach(el => el.removeAttribute(SKELETON_ATTR));
}

async function applyLanguage(lang: string) {
  if (typeof window === 'undefined') return;
  const root = document.body;
  if (!root) return;

  const nodes = collectTextNodes(root);

  for (const n of nodes) {
    if (n[NODE_ORIG] == null) {
      n[NODE_ORIG] = n.nodeValue ?? '';
      n[NODE_LANG] = 'en';
    }
  }

  if (lang === 'en') {
    for (const n of nodes) {
      if (n[NODE_LANG] !== 'en' && n[NODE_ORIG] != null) {
        if (n.nodeValue !== n[NODE_ORIG]) n.nodeValue = n[NODE_ORIG];
        n[NODE_LANG] = 'en';
      }
    }
    return;
  }

  const cache = loadCache(lang);

  // Step 1: apply dictionary + cache instantly
  const remainingNodes: TaggedText[] = [];
  const remainingNeeded = new Set<string>();

  for (const n of nodes) {
    if (n[NODE_LANG] === lang) continue;
    const orig = (n[NODE_ORIG] ?? '').trim();
    if (!orig) continue;

    const fromDict = lookupDict(orig, lang);
    if (fromDict) {
      applySingle(n, fromDict, lang);
      continue;
    }

    const fromCache = cache[orig];
    if (fromCache) {
      applySingle(n, fromCache, lang);
      continue;
    }

    remainingNodes.push(n);
    remainingNeeded.add(orig);
  }

  if (remainingNeeded.size === 0) return;

  // Step 2: show skeleton on nodes that need API translation
  ensureSkeletonStyle();
  markSkeleton(remainingNodes);

  const list = Array.from(remainingNeeded);
  const CHUNK = 20;

  // Index nodes by their source text so each batch can apply only its own nodes.
  const nodesByOrig = new Map<string, TaggedText[]>();
  for (const n of remainingNodes) {
    const orig = (n[NODE_ORIG] ?? '').trim();
    if (!orig) continue;
    const arr = nodesByOrig.get(orig);
    if (arr) arr.push(n);
    else nodesByOrig.set(orig, [n]);
  }

  const slices: string[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) slices.push(list.slice(i, i + CHUNK));

  // Fire all batches in parallel; apply each batch's translations to the DOM
  // the moment it resolves (progressive render). Slow / 504-failing batches
  // no longer block the fast ones.
  await Promise.allSettled(
    slices.map(async (slice) => {
      try {
        const translated = await translateBatch(slice, lang);
        const touched: TaggedText[] = [];
        for (let j = 0; j < slice.length; j++) {
          const source = slice[j];
          const target = translated[j] ?? source;
          cache[source] = target;
          const ns = nodesByOrig.get(source);
          if (!ns) continue;
          for (const n of ns) {
            applySingle(n, target, lang);
            touched.push(n);
          }
        }
        clearSkeleton(touched);
      } catch (err) {
        console.error('[i18n] batch failed', err);
        // Clear skeleton on the failed batch's nodes so the English fallback
        // becomes visible instead of staying stuck in shimmer.
        const failedNodes: TaggedText[] = [];
        for (const source of slice) {
          const ns = nodesByOrig.get(source);
          if (ns) failedNodes.push(...ns);
        }
        clearSkeleton(failedNodes);
      }
    }),
  );

  saveCache(lang, cache);
  // Safety net: anything still wearing a skeleton (shouldn't happen) gets cleared.
  clearSkeleton(remainingNodes);
}

export function TranslationProvider({ children }: { children: ReactNode }) {
  const language = useStore((s) => s.language);
  const pathname = usePathname();
  const runningRef = useRef(false);
  const queuedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (runningRef.current) {
        queuedRef.current = true;
        return;
      }
      runningRef.current = true;
      try {
        await applyLanguage(language);
      } finally {
        runningRef.current = false;
        if (queuedRef.current && !cancelled) {
          queuedRef.current = false;
          run();
        }
      }
    };

    document.documentElement.lang = language;
    document.cookie = `i18n-lang=${encodeURIComponent(language)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;

    const initial = setTimeout(run, 50);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: false });

    return () => {
      cancelled = true;
      clearTimeout(initial);
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }, [language]);

  // Re-translate immediately on navigation — the MutationObserver has a 300ms
  // debounce which causes a visible flash; this fires at 50ms instead.
  useEffect(() => {
    if (language === 'en') return;
    const t = setTimeout(() => { applyLanguage(language); }, 50);
    return () => clearTimeout(t);
  }, [pathname, language]);

  return <>{children}</>;
}
