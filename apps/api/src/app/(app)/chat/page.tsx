'use client';

import { useState, useRef, useEffect, Suspense, useCallback, useMemo } from 'react';
import { startSpeechRecognition, stopSpeechRecognition, speak, stopSpeaking, isNative } from '@/lib/native';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { useStore } from '@/store/useStore';
import { useTokenToast } from '@/components/ui/TokenToast';
import { MotionPage, FadeIn } from '@/components/ui/motion-primitives';
import { staggerContainer, staggerItem, modalOverlay, modalContent } from '@/lib/motion';
import { useActiveChart } from '@/hooks/useActiveChart';
// REPORTS_DISABLED: useChartReport and generateReport removed
// import { useChartReport } from '@/hooks/useChartReport';
// import { generateReport } from '@/lib/reports';
import { parseInline } from '@/components/ui/rich-text';
import { ASTROLOGERS, ALL_SPECIALTIES, getAstrologer, type Specialty } from '@/lib/astrologers';
import { detectProducts, buildProductSearchUrl, type ProductCategory } from '@aroha-astrology/shared';
import { AstrologerAvatar } from '@/components/AstrologerAvatar';
import { DotsSkeleton, PageSkeleton, SkeletonCard } from '@/components/ui/skeleton';
import { NorthIndianChart } from '@/components/charts/NorthIndianChart';
import { ChartZoomModal } from '@/components/charts/ChartZoomModal';

/* -------------------------------------------------------------------------- */
/*  Types & Constants                                                         */
/* -------------------------------------------------------------------------- */

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'sent' | 'delivered' | 'read';
  isChartCard?: boolean;
}

function MessageTicks({ status }: { status?: 'sent' | 'delivered' | 'read' }) {
  if (!status) return null;
  const color = status === 'read' ? 'var(--primary)' : 'var(--text-muted)';
  if (status === 'sent') {
    return (
      <svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Sent">
        <polyline points="2 5 6 9 12 1" />
      </svg>
    );
  }
  return (
    <svg width="16" height="10" viewBox="0 0 18 10" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label={status === 'read' ? 'Read' : 'Delivered'}>
      <polyline points="1 5 5 9 11 1" />
      <polyline points="7 5 11 9 17 1" />
    </svg>
  );
}

// Languages with confirmed ElevenLabs eleven_turbo_v2_5 voice support
const VOICE_SUPPORTED_LANGS = ['en', 'hi', 'ta'];

const LANGUAGES = [
  { code: 'en', label: 'English', voiceSupported: true },
  { code: 'hi', label: 'हिन्दी', voiceSupported: true },
  { code: 'bn', label: 'বাংলা', voiceSupported: false },
  { code: 'ta', label: 'தமிழ்', voiceSupported: true },
  { code: 'te', label: 'తెలుగు', voiceSupported: false },
  { code: 'mr', label: 'मराठी', voiceSupported: false },
];

const THINKING_LABELS = [
  'Analyzing your birth chart...',
  'Examining planetary positions...',
  'Consulting the stars...',
  'Reading your Dasha cycles...',
  'Calculating planetary strengths...',
  'Checking divisional charts...',
];

const ENGAGING_MESSAGES = [
  'Let me take a closer look at your birth chart...',
  'I can see some interesting planetary alignments forming here.',
  'Your Lagna and rising sign tell a fascinating story...',
  'The current Dasha period you\'re running is quite significant.',
  'There are some powerful yogas I\'m noticing in your chart...',
  'Your 10th house placements are particularly noteworthy here.',
  'The strength of your Atmakaraka planet reveals much about this...',
  'I\'m examining the transits active in your chart right now...',
  'Your Moon\'s nakshatra placement adds important depth here.',
  'The divisional charts are revealing some interesting patterns.',
  'Let me cross-check your Navamsha for additional clarity...',
  'Your planetary dispositors form a very interesting chain...',
  'I see Jupiter\'s influence playing a significant role here.',
  'Saturn\'s position in your chart adds important context...',
  'The yogas in your chart are speaking clearly to me now...',
];

type CallStatus = 'idle' | 'listening' | 'thinking' | 'speaking';
interface CallTranscriptItem {
  role: 'user' | 'baba';
  text: string;
  analyzing?: boolean;
}

interface ChatSession {
  id: string;
  title: string;
  message_count: number;
  last_message_at: string;
}

/* -------------------------------------------------------------------------- */
/*  Sentence splitter for streaming TTS                                       */
/* -------------------------------------------------------------------------- */

function extractSentences(text: string): { sentences: string[]; remainder: string } {
  const parts = text.split(/(?<=[.!?])\s+/);
  if (parts.length <= 1) return { sentences: [], remainder: text };
  const sentences = parts.slice(0, -1).filter(s => s.trim().split(' ').length >= 4);
  return { sentences, remainder: parts[parts.length - 1] };
}

/* -------------------------------------------------------------------------- */
/*  Follow-up question extractor — finds the last "?"-terminated sentence in   */
/*  an assistant reply so we can offer quick-reply chips.                      */
/* -------------------------------------------------------------------------- */

function extractAskedQuestion(text: string): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  // Strip markdown bullets / asterisks / leading whitespace per line
  const cleaned = trimmed.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`/g, '');
  const lastQ = cleaned.lastIndexOf('?');
  if (lastQ === -1) return null;
  // Walk back to the previous sentence boundary
  let start = 0;
  for (let i = lastQ - 1; i >= 0; i--) {
    const ch = cleaned[i];
    if (ch === '.' || ch === '!' || ch === '?' || ch === '\n' || ch === '।') {
      start = i + 1;
      break;
    }
  }
  const q = cleaned.slice(start, lastQ + 1).trim();
  // Sanity bounds — too short or too long is probably not a real question
  if (q.length < 8 || q.length > 240) return null;
  return q;
}

const QUICK_REPLIES: Record<string, { yes: string; no: string; unsure: string; skip: string }> = {
  en: { yes: 'Yes',    no: 'No',     unsure: 'Not sure',  skip: 'Skip' },
  hi: { yes: 'हाँ',    no: 'नहीं',   unsure: 'पता नहीं',  skip: 'छोड़ें' },
  bn: { yes: 'হ্যাঁ',  no: 'না',    unsure: 'নিশ্চিত নই', skip: 'এড়িয়ে যান' },
  ta: { yes: 'ஆம்',    no: 'இல்லை', unsure: 'தெரியாது',   skip: 'தவிர்' },
  te: { yes: 'అవును',  no: 'కాదు',   unsure: 'తెలియదు',   skip: 'వదిలేయండి' },
  mr: { yes: 'होय',    no: 'नाही',   unsure: 'माहित नाही', skip: 'वगळा' },
};

/* -------------------------------------------------------------------------- */
/*  Markdown rendering (text chat)                                            */
/* -------------------------------------------------------------------------- */

function FormattedText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 text-[13px] leading-relaxed">
      {lines.map((line, i) => {
        if (!line.trim()) return <br key={i} />;
        if (line.startsWith('### ')) return <h4 key={i} className="font-semibold text-text">{line.slice(4)}</h4>;
        if (line.startsWith('## ')) return <h3 key={i} className="text-sm font-semibold text-text">{line.slice(3)}</h3>;
        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
          return <li key={i} className="ml-4 list-disc text-text-secondary">{formatInline(line.trim().slice(2))}</li>;
        }
        const num = line.trim().match(/^\d+\.\s/);
        if (num) return <li key={i} className="ml-4 list-decimal text-text-secondary">{formatInline(line.trim().slice(num[0].length))}</li>;
        return <p key={i} className="text-text-secondary">{formatInline(line)}</p>;
      })}
    </div>
  );
}

const PRODUCT_ICON: Record<ProductCategory, string> = {
  gemstone:   '💎',
  rudraksha:  '📿',
  yantra:     '🔱',
  mala:       '🕉️',
  idol:       '🛕',
  'puja-item':'🪔',
};

function ProductCards({ text }: { text: string }) {
  const products = useMemo(() => detectProducts(text), [text]);
  if (products.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {products.map(p => (
        <a
          key={p.name}
          href={buildProductSearchUrl(p.searchQuery)}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/15 hover:border-primary/50 transition-colors"
          title={`Find ${p.name} on Google Shopping`}
        >
          <span className="text-[13px] leading-none">{PRODUCT_ICON[p.category]}</span>
          <span>{p.name}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60 group-hover:opacity-100">
            <path d="M7 17L17 7"/><path d="M7 7h10v10"/>
          </svg>
        </a>
      ))}
    </div>
  );
}

function formatInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-text">{part.slice(2, -2)}</strong>
      : part
  );
}

/* -------------------------------------------------------------------------- */
/*  Structured JSON response renderer                                         */
/* -------------------------------------------------------------------------- */

function recoverEmbeddedJSON(s: string): Record<string, unknown> | null {
  const tryParse = (str: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(str);
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch { return null; }
  };
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { const r = tryParse(fence[1].trim()); if (r) return r; }
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first >= 0 && last > first) return tryParse(s.slice(first, last + 1));
  return null;
}

function asStrArr(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return [];
}

const CONFIDENCE_COLOR: Record<string, string> = {
  high: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  low: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
};

function StructuredChatResponse({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  const json = recoverEmbeddedJSON(text);
  if (!json) return <FormattedText text={text} />;

  // Extract prose before the JSON block as intro text
  const introMatch = text.match(/^([\s\S]*?)(?:```json|{)/);
  const intro = introMatch?.[1]?.trim() ?? '';

  const summary = asStrArr(json.summary);
  const analysis = Array.isArray(json.detailedAnalysis)
    ? (json.detailedAnalysis as Record<string, unknown>[]).filter(Boolean)
    : [];
  const currentPeriod = json.currentPeriod as Record<string, unknown> | undefined;
  const remedies = Array.isArray(json.remedies)
    ? (json.remedies as Record<string, unknown>[]).filter(Boolean)
    : [];
  const warnings = asStrArr(json.warnings);
  const favorable = asStrArr(json.favorablePeriods);
  const unfavorable = asStrArr(json.unfavorablePeriods);

  // Build summary as an array of bullet points
  const summaryPoints: string[] = summary.length > 0
    ? summary
    : typeof json.summary === 'string' && json.summary
      ? json.summary.split(/(?<=\.)\s+/).filter(s => s.trim().length > 10)
      : [];
  const hasDetails = analysis.length > 0 || !!currentPeriod || remedies.length > 0 || warnings.length > 0 || favorable.length > 0;

  return (
    <div className="space-y-2.5">
      {intro && <p className="text-[12px] text-text-secondary leading-relaxed">{intro}</p>}

      {/* Summary card — always visible, shown as bullet points */}
      {summaryPoints.length > 0 && (
        <div className="rounded-lg bg-primary/8 border border-primary/20 px-3 py-2.5 space-y-1.5">
          {summaryPoints.map((point, i) => (
            <div key={i} className="flex gap-2 text-[12px] leading-relaxed">
              <span className="text-primary/60 shrink-0 mt-0.5">◆</span>
              <span className="text-text">{point.trim()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Expand / collapse button */}
      {hasDetails && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1.5 text-[11px] text-primary/80 hover:text-primary transition-colors"
        >
          <motion.span
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
            className="inline-block"
          >▶</motion.span>
          {expanded ? 'Show less' : 'View full analysis'}
        </button>
      )}

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && hasDetails && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden space-y-3"
          >
            {/* Detailed Analysis */}
            {analysis.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold tracking-widest uppercase text-text-secondary/60">Detailed Analysis</p>
                {analysis.map((item, i) => {
                  const conf = typeof item.confidence === 'string' ? item.confidence.toLowerCase() : '';
                  const confStyle = CONFIDENCE_COLOR[conf] ?? 'text-text-secondary bg-surface border-border';
                  const timeline = item.timeline as Record<string, unknown> | string | undefined;
                  const timelineEntries = timeline && typeof timeline === 'object'
                    ? Object.entries(timeline as Record<string, string>)
                    : null;
                  return (
                    <div key={i} className="rounded-lg border border-border bg-surface px-3 py-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-semibold text-text">{String(item.area ?? '')}</span>
                        {conf && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${confStyle}`}>
                            {conf.charAt(0).toUpperCase() + conf.slice(1)}
                          </span>
                        )}
                      </div>
                      {/* Prediction as bullet points */}
                      <div className="space-y-1">
                        {String(item.prediction ?? '').split(/(?<=\.)\s+/).filter(s => s.trim().length > 5).map((pt, pi) => (
                          <div key={pi} className="flex gap-1.5 text-[11px] text-text-secondary leading-relaxed">
                            <span className="text-primary/50 shrink-0 mt-0.5 text-[9px]">◆</span>
                            <span>{parseInline(pt.trim())}</span>
                          </div>
                        ))}
                      </div>
                      {!!item.planetaryBasis && (
                        <p className="text-[10px] text-primary/70 italic border-l-2 border-primary/30 pl-2">
                          {parseInline(String(item.planetaryBasis))}
                        </p>
                      )}
                      {timelineEntries && timelineEntries.length > 0 && (
                        <div className="space-y-0.5 pt-0.5">
                          {timelineEntries.map(([k, v]) => (
                            <div key={k} className="flex gap-2 text-[10px]">
                              <span className="text-text-secondary/60 shrink-0">{k}:</span>
                              <span className="text-text-secondary">{parseInline(String(v))}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {typeof timeline === 'string' && (
                        <p className="text-[10px] text-text-secondary/70">{parseInline(timeline)}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Current Period */}
            {currentPeriod && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 space-y-1">
                <p className="text-[10px] font-semibold tracking-widest uppercase text-amber-400/70">Current Period</p>
                {!!currentPeriod.dasha && <p className="text-[11px] text-text"><span className="text-text-secondary/60">Dasha: </span>{String(currentPeriod.dasha)}</p>}
                {!!currentPeriod.antardasha && <p className="text-[11px] text-text"><span className="text-text-secondary/60">Antardasha: </span>{String(currentPeriod.antardasha)}</p>}
                {!!currentPeriod.effects && <p className="text-[11px] text-text-secondary">{String(currentPeriod.effects)}</p>}
              </div>
            )}

            {/* Remedies */}
            {remedies.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold tracking-widest uppercase text-text-secondary/60">Remedies</p>
                {remedies.map((r, i) => (
                  <div key={i} className="flex gap-2 rounded-lg border border-border bg-surface px-3 py-2">
                    <span className="text-base shrink-0">{(r.type as string) in { mantra:1, puja:1, yantra:1, rudraksha:1, gemstone:1, charity:1, fasting:1 }
                      ? ({ mantra:'📿', puja:'🙏', yantra:'🪔', rudraksha:'📿', gemstone:'💎', charity:'🎁', fasting:'🍽️' } as Record<string,string>)[r.type as string]
                      : '✨'}</span>
                    <div>
                      <p className="text-[11px] text-text">{String(r.description ?? r.instructions ?? '')}</p>
                      {!!r.planet && <p className="text-[10px] text-text-secondary/60 mt-0.5">Planet: {String(r.planet)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold tracking-widest uppercase text-rose-400/60">Warnings</p>
                {warnings.map((w, i) => (
                  <div key={i} className="flex gap-2 text-[11px] text-rose-300/80">
                    <span className="shrink-0">⚠️</span><span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Favorable periods */}
            {favorable.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold tracking-widest uppercase text-emerald-400/60">Favorable Periods</p>
                {favorable.map((f, i) => (
                  <div key={i} className="flex gap-2 text-[11px] text-emerald-300/80">
                    <span className="shrink-0">✦</span><span>{f}</span>
                  </div>
                ))}
              </div>
            )}

            {unfavorable.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold tracking-widest uppercase text-amber-400/60">Unfavorable Periods</p>
                {unfavorable.map((f, i) => (
                  <div key={i} className="flex gap-2 text-[11px] text-amber-300/80">
                    <span className="shrink-0">◆</span><span>{f}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  TTS helpers                                                                */
/* -------------------------------------------------------------------------- */

async function speakWithBrowser(text: string, lang: string): Promise<void> {
  return new Promise(res => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const nativeLang = lang.includes('+') ? lang.split('+')[1] : lang;
    const bcp = nativeLang === 'hi' ? 'hi-IN' : nativeLang === 'bn' ? 'bn-IN' : nativeLang === 'ta' ? 'ta-IN' : nativeLang === 'te' ? 'te-IN' : nativeLang === 'mr' ? 'mr-IN' : 'en-IN';
    u.lang = bcp;
    u.pitch = 0.55;
    u.rate = 0.78;
    u.volume = 1;
    // Prefer a male Indian voice when available
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const male = voices.find(v => v.lang === bcp && /male|prabhat|madhu|mohan/i.test(v.name));
      const regional = voices.find(v => v.lang === bcp || v.lang.startsWith(bcp.split('-')[0]));
      if (male) u.voice = male;
      else if (regional) u.voice = regional;
    }
    u.onend = () => res();
    u.onerror = () => res();
    window.speechSynthesis.speak(u);
  });
}

/**
 * Speaks text via /api/voice/tts and resolves when audio finishes playing.
 *
 * @param strict — when true (voice-call mode), the server uses ElevenLabs ONLY.
 *   No fallback to gTTS/Edge. On failure returns 503 → this function returns false
 *   and the caller is expected to skip playback (not substitute a different voice).
 *
 * Returns true if ElevenLabs (or any TTS source in non-strict mode) produced audio
 * that played. Returns false on any failure.
 */
async function speakWithModal(
  text: string,
  lang = 'hi',
  audioRef?: { current: HTMLAudioElement | null },
  gender: 'male' | 'female' = 'male',
  strict = false,
  astrologerId?: string,
): Promise<boolean> {
  try {
    const res = await fetch('/api/voice/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: lang, gender, astrologerId, strict }),
    });
    if (!res.ok) {
      if (strict) console.warn('[voice] TTS strict failed:', res.status, res.headers.get('X-TTS-Source'));
      return false;
    }
    // In strict mode, only ElevenLabs is acceptable. Anything else means the
    // server bug-bypassed strict — refuse to play it to avoid a voice swap.
    const source = res.headers.get('X-TTS-Source');
    if (strict && source !== 'elevenlabs') {
      console.warn('[voice] strict mode received non-elevenlabs source:', source);
      return false;
    }

    const audioBlob = await res.blob();
    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);
    if (audioRef) audioRef.current = audio;
    await new Promise<void>((resolve) => {
      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      // onpause fires when interruptCall calls audio.pause() — resolves promise immediately.
      audio.onpause = () => { URL.revokeObjectURL(url); resolve(); };
      audio.play().catch(() => resolve());
    });
    if (audioRef && audioRef.current === audio) audioRef.current = null;
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Sessions Panel                                                             */
/* -------------------------------------------------------------------------- */

function timeAgoShort(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function groupSessions(sessions: ChatSession[]) {
  const now = Date.now();
  const today: ChatSession[] = [], yesterday: ChatSession[] = [], week: ChatSession[] = [], older: ChatSession[] = [];
  for (const s of sessions) {
    const age = (now - new Date(s.last_message_at).getTime()) / 1000;
    if (age < 86400) today.push(s);
    else if (age < 172800) yesterday.push(s);
    else if (age < 604800) week.push(s);
    else older.push(s);
  }
  return [
    { label: 'Today', items: today },
    { label: 'Yesterday', items: yesterday },
    { label: 'Last 7 days', items: week },
    { label: 'Older', items: older },
  ].filter(g => g.items.length > 0);
}

interface SessionsPanelProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  loading: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function parseSessionTitle(title: string): { astrologer: ReturnType<typeof getAstrologer> | undefined; preview: string; isVoice: boolean } {
  const isVoice = title.startsWith('📞');
  // Strip leading mode emoji + space
  const stripped = title.replace(/^([📞💬])\s*/, '');
  const colonIdx = stripped.indexOf(':');
  const namePart = colonIdx > 0 ? stripped.slice(0, colonIdx).trim() : '';
  const previewPart = colonIdx > 0 ? stripped.slice(colonIdx + 1).trim() : stripped.trim();
  const astrologer = namePart
    ? ASTROLOGERS.find(a => a.shortName.toLowerCase() === namePart.toLowerCase()
        || a.name.toLowerCase() === namePart.toLowerCase())
    : undefined;
  return { astrologer, preview: previewPart || 'New conversation', isVoice };
}

function SessionsPanel({ sessions, activeSessionId, loading, onClose, onNewChat, onSelect, onDelete }: SessionsPanelProps) {
  const groups = groupSessions(sessions);
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col bg-bg"
      initial={{ opacity: 0, x: -40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Header */}
      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-3.5">
          <div>
            <p className="text-[15px] font-extrabold text-text font-[family-name:var(--font-serif)]">Chat History</p>
            <p className="text-[11px] text-text-muted mt-0.5">{sessions.length} conversation{sessions.length === 1 ? '' : 's'}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full border-none cursor-pointer text-text-muted hover:text-text hover:bg-surface-2 transition-colors text-xl"
          >×</button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-4">
          {/* New Chat CTA */}
          <button
            onClick={onNewChat}
            className="w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[14px] font-bold text-white cursor-pointer border-none bg-primary hover:bg-primary-ink transition-colors mb-4"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            Start New Chat
          </button>

          {loading && (
            <div className="space-y-2">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          )}

          {!loading && sessions.length === 0 && (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">🙏</div>
              <p className="text-[13px] font-semibold text-text">No conversations yet</p>
              <p className="text-[11px] text-text-muted mt-1">Start a chat to see it here.</p>
            </div>
          )}

          {!loading && groups.map(group => (
            <div key={group.label} className="mb-5 last:mb-0">
              <p className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">{group.label}</p>
              <div className="space-y-1">
                {group.items.map(s => {
                  const { astrologer, preview, isVoice } = parseSessionTitle(s.title);
                  const isActive = s.id === activeSessionId;
                  return (
                    <div
                      key={s.id}
                      className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 cursor-pointer transition-colors"
                      style={{
                        background: isActive ? 'rgba(212, 175, 55,0.14)' : 'var(--surface)',
                        border: `1px solid ${isActive ? 'rgba(212, 175, 55,0.35)' : 'var(--border)'}`,
                      }}
                      onClick={() => onSelect(s.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(s.id); } }}
                    >
                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        {astrologer ? (
                          <AstrologerAvatar
                            imagePath={astrologer.imagePath}
                            name={astrologer.name}
                            size={40}
                            rounded="full"
                            bordered={false}
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>💬</div>
                        )}
                        {isVoice && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center bg-primary text-white text-[8px] border border-bg">📞</span>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p className="text-[13px] font-bold text-text truncate">
                            {astrologer?.name ?? 'Conversation'}
                          </p>
                          <span className="text-[10px] text-text-muted flex-shrink-0">{timeAgoShort(s.last_message_at)}</span>
                        </div>
                        <p className="text-[12px] text-text-secondary truncate leading-snug">{preview}</p>
                        <p className="text-[10px] text-text-muted mt-0.5">{s.message_count} message{s.message_count === 1 ? '' : 's'}</p>
                      </div>

                      {/* Trailing actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); onDelete(s.id); }}
                          aria-label="Delete conversation"
                          className="opacity-60 hover:opacity-100 hover:text-error bg-transparent border-none cursor-pointer transition-all p-1.5 rounded-lg hover:bg-error/8"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/>
                          </svg>
                        </button>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
                          <path d="M9 18l6-6-6-6"/>
                        </svg>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Call Overlay (hoisted — defining it inside ChatPage caused remount-flicker */
/*  on every parent render)                                                    */
/* -------------------------------------------------------------------------- */

interface CallOverlayProps {
  timeLeft: number;
  callStatus: CallStatus;
  streamingText: string;
  callTranscript: CallTranscriptItem[];
  transcriptRef: React.RefObject<HTMLDivElement | null>;
  onEndCall: () => void;
  onInterrupt: () => void;
  personaName: string;
  personaAvatar: string;
  personaSubtitle: string;
}

function CallOverlay({ timeLeft, callStatus, streamingText, callTranscript, transcriptRef, onEndCall, onInterrupt, personaName, personaAvatar, personaSubtitle }: CallOverlayProps) {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = String(timeLeft % 60).padStart(2, '0');
  const isLowTime = timeLeft < 60;

  const statusConfig: Record<CallStatus, { emoji: string; label: string; color: string }> = {
    idle: { emoji: '🙏', label: 'Ready', color: 'var(--text-secondary)' },
    listening: { emoji: '🎤', label: 'Listening...', color: '#22c55e' },
    thinking: { emoji: '💭', label: 'Thinking...', color: 'var(--text)' },
    speaking: { emoji: '🔊', label: 'Speaking...', color: 'var(--text)' },
  };
  const st = statusConfig[callStatus];

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(36,28,21,0.35)] backdrop-blur-sm"
        variants={modalOverlay}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <motion.div
          className="w-full max-w-[360px] bg-surface border border-border rounded-xl p-5 shadow-xl"
          variants={modalContent}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <div className="text-center mb-3">
            <div className="text-5xl leading-none">{personaAvatar}</div>
            <p className="text-base font-extrabold text-primary mt-2 font-[family-name:var(--font-serif)]">{personaName}</p>
            <p className="text-[10px] text-text-muted mt-0.5">{personaSubtitle}</p>
          </div>

          <div className="text-center mb-3">
            <span className="text-4xl font-extrabold font-mono" style={{ color: isLowTime ? '#ef4444' : 'var(--primary)' }}>
              {minutes}:{seconds}
            </span>
          </div>

          <div className="flex justify-center mb-3">
            <motion.div
              className="flex items-center gap-2 bg-surface-2 border border-border rounded-full py-1 px-3.5"
              key={callStatus}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <span className="text-base">{st.emoji}</span>
              <span className="text-[12px] font-semibold" style={{ color: st.color }}>{st.label}</span>
            </motion.div>
          </div>

          <AnimatePresence>
            {streamingText && (
              <motion.div
                className="bg-primary/8 border border-primary/15 rounded-lg py-2 px-3 mb-2.5 text-[11px] text-primary leading-relaxed italic max-h-14 overflow-hidden"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                {streamingText.slice(-120)}...
              </motion.div>
            )}
          </AnimatePresence>

          <div className="bg-surface-2 border border-border rounded-lg p-2.5 mb-3 max-h-40 overflow-y-auto">
            {callTranscript.length === 0 ? (
              <p className="text-center text-[11px] text-text-muted italic">
                Yogi Baba is listening...
              </p>
            ) : (
              callTranscript.map((msg, i) => (
                <motion.div
                  key={i}
                  className={`mb-1.5 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <span
                    className={`inline-block max-w-[85%] rounded-lg py-1.5 px-2.5 text-[11px] leading-snug ${
                      msg.role === 'user'
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : msg.analyzing
                        ? 'bg-primary/5 text-primary/70 border border-primary/15 animate-pulse italic'
                        : 'bg-surface border border-border text-text'
                    }`}
                  >
                    {msg.text}
                  </span>
                </motion.div>
              ))
            )}
            <div ref={transcriptRef} />
          </div>

          {(callStatus === 'thinking' || callStatus === 'speaking') && (
            <motion.button
              onClick={onInterrupt}
              className="w-full py-2 mb-2 rounded-lg text-[12px] font-bold cursor-pointer flex items-center justify-center gap-2 border border-primary/40 text-primary"
              style={{
                background: 'rgba(212, 175, 55,0.10)',
              }}
              whileTap={{ scale: 0.97 }}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              ⏸ Interrupt
            </motion.button>
          )}

          <motion.button
            onClick={onEndCall}
            className="w-full py-2.5 bg-error border-none rounded-lg text-white text-[13px] font-bold cursor-pointer"
            whileTap={{ scale: 0.97 }}
          >
            ☎ End Call
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                 */
/* -------------------------------------------------------------------------- */

function ChatPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { activeChartId, activeChart, activeProfile, setActiveChartId, charts, profiles, dataReady } = useActiveChart();
  const setCharts = useStore((s) => s.setCharts);
  const setProfiles = useStore((s) => s.setProfiles);
  const user = useStore((s) => s.user);
  const credits = useStore((s) => s.credits);
  const setCredits = useStore((s) => s.setCredits);
  const userLang = useStore((s) => s.language);
  const { showInsufficientTokens, showSuccess, showError } = useTokenToast();
  const userName = user?.name?.split(' ')[0] || '';

  // Fallback: if dataReady but charts/profiles still empty (safety timer fired
  // before Supabase responded), do a direct fetch to populate the store.
  const [fallbackChecked, setFallbackChecked] = useState(false);

  // Chat readiness gate — locked until all background generation jobs finish
  const [chatReady, setChatReady] = useState<boolean | null>(null); // null = loading
  useEffect(() => {
    if (!dataReady) return;
    let cancelled = false;
    const check = () => {
      fetch('/api/chat/ready')
        .then(r => r.ok ? r.json() : null)
        .then((res: { ready?: boolean } | null) => {
          if (cancelled) return;
          if (res?.ready) {
            setChatReady(true);
          } else {
            setChatReady(false);
            // Poll every 10 s until ready
            setTimeout(check, 10_000);
          }
        })
        .catch(() => { if (!cancelled) setTimeout(check, 15_000); });
    };
    check();
    return () => { cancelled = true; };
  }, [dataReady]);

  // Warm the chat API (chart cache + Vercel function container) the moment the
  // page mounts so the user's first message hits a hot path.
  useEffect(() => {
    if (!activeChartId) return;
    fetch('/api/chat/warmup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chartId: activeChartId }),
      keepalive: true,
    }).catch(() => {});
  }, [activeChartId]);

  useEffect(() => {
    if (!dataReady || fallbackChecked) return;
    if (charts.length > 0 && profiles.length > 0) { setFallbackChecked(true); return; }
    Promise.all([
      fetch('/api/kundli').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/profiles').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([kundliRes, profilesRes]) => {
      if (kundliRes?.data?.length) setCharts(kundliRes.data);
      if (profilesRes?.data?.length) setProfiles(profilesRes.data);
      setFallbackChecked(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady]);

  // Apply pending URL params once data is ready
  useEffect(() => {
    if (!dataReady || !fallbackChecked) return;
    const pendingChart = sessionStorage.getItem('__pendingChatChartId');
    const pendingSession = sessionStorage.getItem('__pendingChatSessionId');
    if (pendingChart) {
      setActiveChartId(pendingChart);
      sessionStorage.removeItem('__pendingChatChartId');
    }
    if (pendingSession) {
      loadSessionMessages(pendingSession);
      sessionStorage.removeItem('__pendingChatSessionId');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady, fallbackChecked]);

  // Astrologer listing state
  const [view, setView] = useState<'list' | 'chat'>('list');
  const [selectedAstrologerId, setSelectedAstrologerId] = useState('yogi-baba');
  const [specialtyFilter, setSpecialtyFilter] = useState<Specialty | 'all'>('all');
  const selectedAstrologer = getAstrologer(selectedAstrologerId) ?? ASTROLOGERS[0];
  // Shuffle once per mount so the order varies across sessions.
  const shuffledAstrologers = useMemo(() => {
    const arr = [...ASTROLOGERS];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, []);
  const filteredAstrologers = specialtyFilter === 'all'
    ? shuffledAstrologers
    : shuffledAstrologers.filter(a => a.specialty.includes(specialtyFilter));

  // Auto-load session + chart from URL params (e.g. from kundli chat button)
  const urlInitialised = useRef(false);
  const [chatTopic, setChatTopic] = useState<string | null>(null);

  useEffect(() => {
    if (urlInitialised.current) return;
    urlInitialised.current = true;
    const urlSession = searchParams.get('session');
    const urlChart = searchParams.get('chartId');
    const urlAstrologer = searchParams.get('astrologer');
    const urlTopic = searchParams.get('topic');
    if (urlChart) {
      sessionStorage.setItem('__pendingChatChartId', urlChart);
    }
    if (urlSession) {
      setView('chat');
      sessionStorage.setItem('__pendingChatSessionId', urlSession);
    }
    if (urlAstrologer && getAstrologer(urlAstrologer)) {
      setSelectedAstrologerId(urlAstrologer);
      setMessages([]);
      setSessionId(null);
      sessionIdRef.current = null;
      setView('chat');
    }
    if (urlTopic) {
      setChatTopic(urlTopic);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [streamingReply, setStreamingReply] = useState(''); // live token stream for text chat
  const [thinkingLabelIdx, setThinkingLabelIdx] = useState(0);
  const [thinkingPhase, setThinkingPhase] = useState<'thinking' | 'typing'>('thinking');
  const [shownInterimMsgs, setShownInterimMsgs] = useState<string[]>([]);
  const thinkingTickRef = useRef(0);
  const [language, setLanguage] = useState<string>('en');

  // REPORTS_DISABLED: report gate removed — chat opens immediately from birth chart
  const hasAutoGeneratedRef = useRef<string | null>(null);

  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showSessions, setShowSessions] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);

  // Chat session timer
  const [chatElapsed, setChatElapsed] = useState(0);
  const [chatStarted, setChatStarted] = useState(false);
  const chatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Filter panel visibility
  const [showFilter, setShowFilter] = useState(false);

  // Leave-chat confirmation modal
  const [leaveConfirm, setLeaveConfirm] = useState<null | { onEnd: () => void }>(null);

  // Chart zoom modal
  const [chartZoomOpen, setChartZoomOpen] = useState(false);

  const [inCall, setInCall] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [timeLeft, setTimeLeft] = useState(180);
  const [callTranscript, setCallTranscript] = useState<CallTranscriptItem[]>([]);
  const [streamingText, setStreamingText] = useState('');
  // Voice-quota warning shown before a call when ElevenLabs character budget is low.
  // `minutes` is an estimate (~850 chars/min ElevenLabs Indic speech) so users can
  // judge whether to start now or top up first.
  const [quotaWarning, setQuotaWarning] = useState<null | { remaining: number; minutes: number }>(null);
  const recognitionRef = useRef<unknown>(null);
  const inCallRef = useRef(false);
  const ttsQueueRef = useRef<string[]>([]);
  const ttsBusyRef = useRef(false);
  // Refs for interruption / cleanup
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  // Consecutive ElevenLabs TTS failures during a single call. 3 in a row ends the call
  // gracefully — never substitutes a different voice mid-call.
  const voiceFailuresRef = useRef(0);
  const callStartTimeRef = useRef<number>(0);
  const creditsAtStartRef = useRef<number>(0);
  const callStatusRef = useRef<CallStatus>('idle');
  // Mirror callStatus into ref so async callbacks see the latest value.
  useEffect(() => { callStatusRef.current = callStatus; }, [callStatus]);

  // Cycle thinking labels and add engaging interim messages while API is processing
  useEffect(() => {
    if (!loading || streamingReply) {
      setShownInterimMsgs([]);
      setThinkingLabelIdx(0);
      setThinkingPhase('thinking');
      thinkingTickRef.current = 0;
      return;
    }
    const timer = setInterval(() => {
      thinkingTickRef.current += 1;
      const tick = thinkingTickRef.current;
      setThinkingLabelIdx(prev => (prev + 1) % THINKING_LABELS.length);
      if (tick % 2 === 0) {
        setShownInterimMsgs(prev => {
          if (prev.length >= 4) return prev;
          const next = ENGAGING_MESSAGES[prev.length] ?? ENGAGING_MESSAGES[prev.length % ENGAGING_MESSAGES.length];
          return [...prev, next];
        });
      }
      if (tick === 3) setThinkingPhase('typing');
    }, 2500);
    return () => clearInterval(timer);
  }, [loading, streamingReply]);

  const hasShownChartCardRef = useRef(false);
  const chartCardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const callTranscriptRef = useRef<HTMLDivElement>(null);

  // REPORTS_DISABLED: auto-generate + report gate removed
  // Chat is always open — uses birth chart + dasha directly
  const reportReady = true;
  const reportGenerating = false;
  const reportProgress = '';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inCallRef.current = inCall;
  }, [inCall]);

  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  // Start / stop chat elapsed timer
  useEffect(() => {
    if (!chatStarted) return;
    chatTimerRef.current = setInterval(() => setChatElapsed(s => s + 1), 1000);
    return () => { if (chatTimerRef.current) clearInterval(chatTimerRef.current); };
  }, [chatStarted]);

  // Reset timer when astrologer changes
  useEffect(() => {
    setChatElapsed(0);
    setChatStarted(false);
    if (chatTimerRef.current) clearInterval(chatTimerRef.current);
  }, [selectedAstrologerId]);

  // Load sessions on mount
  useEffect(() => {
    setLoadingSessions(true);
    fetch('/api/chat/sessions')
      .then(r => r.ok ? r.json() : null)
      .then(res => { if (res?.data) setSessions(res.data); })
      .finally(() => setLoadingSessions(false));
  }, []);

  // Browser-back guard — push a history entry when chat is active
  useEffect(() => {
    if (!(view === 'chat' && chatStarted && messages.length > 0)) return;
    window.history.pushState({ jyotishChatGuard: true }, '');
    const onPop = () => {
      window.history.pushState({ jyotishChatGuard: true }, '');
      setLeaveConfirm({
        onEnd: () => {
          setLeaveConfirm(null);
          endChat();
          window.history.go(-2);
        },
      });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, chatStarted, messages.length]);

  // Tab close / refresh guard
  useEffect(() => {
    if (!(view === 'chat' && chatStarted && messages.length > 0)) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [view, chatStarted, messages.length]);

  /* ── Session helpers ── */
  async function ensureSession(firstMessage: string, isVoice = false): Promise<string | null> {
    if (sessionIdRef.current) return sessionIdRef.current;
    const modePrefix = isVoice ? '📞 ' : '💬 ';
    const namePrefix = selectedAstrologer ? `${modePrefix}${selectedAstrologer.shortName}: ` : modePrefix;
    const title = namePrefix + firstMessage.slice(0, 55);
    const res = await fetch('/api/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, chart_id: activeChartId || undefined, language }),
    });
    if (!res.ok) return null;
    const { data } = await res.json() as { data?: { id: string } };
    if (data?.id) {
      setSessionId(data.id);
      sessionIdRef.current = data.id;
      setSessions(prev => [{ id: data.id, title, message_count: 0, last_message_at: new Date().toISOString() }, ...prev]);
      return data.id;
    }
    return null;
  }

  async function saveExchange(sid: string, question: string, response: string, isVoice = false) {
    fetch('/api/chat/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sid, question, response, chart_id: activeChartId || undefined, language, is_voice: isVoice }),
    }).then(() => {
      setSessions(prev => prev.map(s => s.id === sid
        ? { ...s, message_count: s.message_count + 1, last_message_at: new Date().toISOString() }
        : s));
    }).catch(() => {});
  }

  function startNewChat() {
    setMessages([]);
    setSessionId(null);
    sessionIdRef.current = null;
    setShowSessions(false);
  }

  function endChat() {
    if (chatTimerRef.current) {
      clearInterval(chatTimerRef.current);
      chatTimerRef.current = null;
    }
    setChatStarted(false);
    setChatElapsed(0);
    setMessages([]);
    setSessionId(null);
    sessionIdRef.current = null;
    setView('list');
  }

  function isChatActive() {
    return view === 'chat' && chatStarted && messages.length > 0;
  }

  function requestLeave(thenAfterEnd: () => void) {
    if (!isChatActive()) { thenAfterEnd(); return; }
    setLeaveConfirm({
      onEnd: () => { setLeaveConfirm(null); endChat(); thenAfterEnd(); },
    });
  }

  async function loadSessionMessages(id: string) {
    const res = await fetch(`/api/chat/sessions/${id}/messages`);
    if (!res.ok) return;
    const { data } = await res.json() as { data?: Array<{ id: string; question: string; response: string; created_at: string }> };
    if (!data) return;
    const loaded: ChatMessage[] = [];
    for (const m of data) {
      loaded.push({ id: `u-${m.id}`, role: 'user', content: m.question, timestamp: new Date(m.created_at), status: 'read' });
      loaded.push({ id: `a-${m.id}`, role: 'assistant', content: m.response, timestamp: new Date(m.created_at) });
    }
    // Restore the astrologer for this session by matching the title prefix (e.g. "💬 Gauri: …")
    const session = sessions.find(s => s.id === id);
    if (session?.title) {
      const t = session.title.toLowerCase();
      const matched = ASTROLOGERS.find(a => t.includes(a.shortName.toLowerCase()));
      if (matched) setSelectedAstrologerId(matched.id);
    }
    setMessages(loaded);
    setSessionId(id);
    sessionIdRef.current = id;
    setShowSessions(false);
    setView('chat');
    setChatStarted(true);
  }

  async function deleteSession(id: string) {
    await fetch(`/api/chat/sessions/${id}`, { method: 'DELETE' });
    setSessions(prev => prev.filter(s => s.id !== id));
    if (sessionIdRef.current === id) startNewChat();
  }

  /** End the call gracefully when ElevenLabs has failed 3 times in a row — never
   *  swap to a different voice. Display a clear message so the user knows why. */
  function endCallDueToTTSFailure() {
    if (!inCallRef.current) return;
    const msg = 'Voice service is unavailable. Ending call — please try again in a moment.';
    setCallTranscript(prev => [...prev.filter(m => !m.analyzing), { role: 'baba', text: msg }]);
    showError(msg);
    endCall();
  }

  /* ── TTS queue processor ── */
  async function processTTSQueue(lang: string) {
    if (ttsBusyRef.current) return;
    if (!inCallRef.current) return;

    ttsBusyRef.current = true;
    // Mute the mic while Baba is speaking — otherwise recognition picks up the TTS audio.
    stopListening();
    setCallStatus('speaking');
    while (ttsQueueRef.current.length > 0) {
      const sentence = ttsQueueRef.current.shift()!;
      const ok = await speakWithModal(sentence, lang, audioElRef, selectedAstrologer.gender, true /* strict */, selectedAstrologer.id);
      if (ok) {
        voiceFailuresRef.current = 0;
      } else {
        voiceFailuresRef.current++;
        // The sentence text is already in the transcript — user can read what was missed.
        if (voiceFailuresRef.current >= 3) {
          ttsBusyRef.current = false;
          endCallDueToTTSFailure();
          return;
        }
      }
    }
    ttsBusyRef.current = false;
    if (inCallRef.current) {
      callStatusRef.current = 'idle';
      setCallStatus('idle');
      startListening();
    }
  }

  function enqueueTTS(sentence: string, lang: string) {
    ttsQueueRef.current.push(sentence);
    processTTSQueue(lang);
  }

  /* ── Persist a follow-up answer so the AI never re-asks ── */
  async function saveFollowUpAnswer(askedQuestion: string, answer: string) {
    if (!activeChartId || !askedQuestion || !answer) return;
    try {
      await fetch('/api/chat/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartId: activeChartId, question: askedQuestion, answer }),
      });
    } catch {
      // best-effort — failure here only means the AI may re-ask once
    }
  }

  /* ── Text chat — streaming ── */
  async function sendMessage(overrideText?: string) {
    const question = (overrideText ?? input).trim();
    if (!question || loading) return;

    // If the latest assistant message ended in a question, treat this user reply
    // as the answer and persist it so the AI doesn't re-ask in future turns.
    const lastAsk = (() => {
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === 'user') return null;
        if (m.role === 'assistant' && !m.isChartCard && m.content) {
          return extractAskedQuestion(m.content);
        }
      }
      return null;
    })();
    if (lastAsk) saveFollowUpAnswer(lastAsk, question);

    // Start timer on first message
    if (!chatStarted) setChatStarted(true);

    const userMsgId = `user-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: userMsgId, role: 'user', content: question, timestamp: new Date(),
      status: 'sent',
    }]);
    setInput('');
    setLoading(true);
    setStreamingReply('');
    thinkingTickRef.current = 0;
    setThinkingPhase('thinking');
    setThinkingLabelIdx(0);
    setShownInterimMsgs([ENGAGING_MESSAGES[0]]);

    // Show birth chart card after 2s on the first message of the session
    if (!hasShownChartCardRef.current && activeChart && activeProfile) {
      hasShownChartCardRef.current = true;
      chartCardTimeoutRef.current = setTimeout(() => {
        setMessages(prev => [...prev, {
          id: `chart-card-${Date.now()}`,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
          isChartCard: true,
        }]);
        chartCardTimeoutRef.current = null;
      }, 2000);
    }

    const sid = await ensureSession(question);

    // Trim recent conversation history so the model has continuity (last 20 turns).
    // Filter out chart-card placeholders and empty turns — they corrupt the alternating user/assistant pattern.
    const recentHistory = messages
      .filter(m => !m.isChartCard && m.content.trim().length > 0)
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          chartId: activeChartId || undefined,
          language,
          astrologerId: selectedAstrologerId,
          mode: 'text',
          history: recentHistory,
          userName,
          topic: chatTopic ?? undefined,
        }),
      });

      if (res.status === 402) {
        showInsufficientTokens();
        const body = await res.json().catch(() => ({})) as { credits?: number };
        if (typeof body.credits === 'number') setCredits(body.credits);
        setStreamingReply('');
        setLoading(false);
        return;
      }

      const remaining = res.headers.get('X-Credits-Remaining');
      if (remaining != null) setCredits(Number(remaining));

      if (!res.ok || !res.body) throw new Error('Stream failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = '';
      let firstTokenSeen = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line.slice(6)) as { token?: string; done?: boolean; error?: string };
            if (parsed.done) break;
            if (parsed.token) {
              full += parsed.token;
              setStreamingReply(full);
              if (!firstTokenSeen) {
                firstTokenSeen = true;
                setMessages(prev => prev.map(m => m.id === userMsgId ? { ...m, status: 'delivered' } : m));
              }
            }
          } catch { /* skip */ }
        }
      }

      setStreamingReply('');
      const reply = full || 'Something went wrong.';
      setMessages(prev => [
        ...prev.map(m => m.id === userMsgId ? { ...m, status: 'read' as const } : m),
        { id: `assistant-${Date.now()}`, role: 'assistant', content: reply, timestamp: new Date() },
      ]);
      if (sid) saveExchange(sid, question, reply);
    } catch {
      setStreamingReply('');
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`, role: 'assistant',
        content: 'Failed to connect. Please try again.', timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  const ANALYZING_MSG: Record<string, string> = {
    en: '🌟 Analyzing your chart data...',
    hi: '🌟 आपका डेटा विश्लेषण हो रहा है...',
    bn: '🌟 আপনার ডেটা বিশ্লেষণ করা হচ্ছে...',
    ta: '🌟 உங்கள் தரவை பகுப்பாய்வு செய்கிறேன்...',
    te: '🌟 మీ డేటాను విశ్లేషిస్తున్నాను...',
    mr: '🌟 तुमचा डेटा विश्लेषण होत आहे...',
  };

  /* ── Stop any active speech recognition (idempotent) ── */
  function stopListening() {
    const rec = recognitionRef.current as { stop?: () => void; abort?: () => void } | null;
    if (rec) {
      try { rec.abort?.(); } catch { /* ignore */ }
      try { rec.stop?.(); } catch { /* ignore */ }
    }
    recognitionRef.current = null;
    // Capacitor Android — also stop the native recognizer
    if (isNative()) { stopSpeechRecognition().catch(() => { /* ignore */ }); }
  }

  /* ── Cancel everything currently happening on the call (audio + LLM stream) ── */
  function silentCleanup() {
    if (streamAbortRef.current) {
      try { streamAbortRef.current.abort(); } catch { /* ignore */ }
      streamAbortRef.current = null;
    }
    if (audioElRef.current) {
      try { audioElRef.current.pause(); audioElRef.current.currentTime = 0; } catch { /* ignore */ }
      audioElRef.current = null;
    }
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    ttsQueueRef.current = [];
    ttsBusyRef.current = false;
    stopListening();
  }

  /* ── User tapped Interrupt while Baba is thinking/speaking ── */
  function interruptCall() {
    silentCleanup();
    setStreamingText('');
    setCallTranscript(prev => prev.filter(m => !m.analyzing));
    if (inCallRef.current) {
      callStatusRef.current = 'idle';
      setCallStatus('idle');
      startListening();
    }
  }

  /* ── Voice call: streaming chat → sentence-level TTS ── */
  async function handleCallInput(transcript: string) {
    if (!inCallRef.current) return;
    // Mic OFF during processing & speaking — prevents echo of Baba's voice.
    stopListening();
    setCallStatus('thinking');
    // Show multilingual "analyzing" message immediately in transcript
    const analyzingMsg = ANALYZING_MSG[language] ?? ANALYZING_MSG.en;
    setCallTranscript(prev => [...prev, { role: 'user', text: transcript }, { role: 'baba', text: analyzingMsg, analyzing: true }]);
    setStreamingText('');

    ttsQueueRef.current = [];
    const abortController = new AbortController();
    streamAbortRef.current = abortController;
    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: transcript, chartId: activeChartId, language, userName, astrologerId: selectedAstrologerId, mode: 'voice', topic: chatTopic ?? undefined }),
        signal: abortController.signal,
      });

      if (res.status === 402) {
        showInsufficientTokens();
        const body = await res.json().catch(() => ({})) as { credits?: number };
        if (typeof body.credits === 'number') setCredits(body.credits);
        setCallTranscript(prev => [...prev.filter(m => !m.analyzing), {
          role: 'baba',
          text: 'Beta, you are out of Dhanam. Please buy more to continue.',
        }]);
        setStreamingText('');
        endCall();
        return;
      }

      const remaining = res.headers.get('X-Credits-Remaining');
      if (remaining != null) setCredits(Number(remaining));

      if (!res.ok || !res.body) throw new Error('Stream failed');

      setCallStatus('speaking');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

        for (const line of lines) {
          const jsonStr = line.slice(6).trim();
          try {
            const parsed = JSON.parse(jsonStr) as { token?: string; done?: boolean; error?: string };
            if (parsed.done) break;
            if (parsed.token) {
              buffer += parsed.token;
              fullResponse += parsed.token;
              setStreamingText(fullResponse);

              const { sentences, remainder } = extractSentences(buffer);
              if (sentences.length > 0) {
                for (const s of sentences) enqueueTTS(s, language);
                buffer = remainder;
              }
            }
          } catch { /* skip */ }
        }
      }

      if (buffer.trim().split(' ').length >= 3) {
        enqueueTTS(buffer.trim(), language);
      }

      if (fullResponse) {
        setCallTranscript(prev => {
          const withoutAnalyzing = prev.filter(m => !m.analyzing);
          return [...withoutAnalyzing, { role: 'baba', text: fullResponse }];
        });
        // Persist voice exchange to session (fire-and-forget)
        ensureSession(transcript, true).then(sid => {
          if (sid) saveExchange(sid, transcript, fullResponse, true);
        });
      }
      setStreamingText('');

    } catch (err) {
      // If the user tapped Interrupt or ended the call, the abort is intentional — just exit.
      if ((err as { name?: string })?.name === 'AbortError') return;
      console.error('[call] Stream error:', err);
      const msg = 'Beta, connection issue. Please ask again.';
      setCallTranscript(prev => [...prev.filter(m => !m.analyzing), { role: 'baba', text: msg }]);
      // Strict mode: try ElevenLabs only — never fall back to a different voice mid-call.
      // If it fails, the user reads the message in the transcript instead of hearing it.
      const spoken = await speakWithModal(msg, language, undefined, selectedAstrologer.gender, true, selectedAstrologer.id);
      if (!spoken) voiceFailuresRef.current++;
      if (inCallRef.current) { callStatusRef.current = 'idle'; setCallStatus('idle'); startListening(); }
    } finally {
      if (streamAbortRef.current === abortController) streamAbortRef.current = null;
    }
  }

  /* ── Speech recognition ── */
  function startListening() {
    if (!inCallRef.current) return;
    // Never run two recognitions at once.
    stopListening();
    // Don't start the mic while Baba is speaking or thinking.
    if (callStatusRef.current === 'speaking' || callStatusRef.current === 'thinking') return;
    if (ttsBusyRef.current) return;

    // Capacitor Android/iOS — Web Speech API doesn't exist in WebView. Use the
    // native bridge (@capacitor-community/speech-recognition) instead. It runs
    // one-shot, so we re-arm via the same startListening() chain after the
    // result is handled.
    if (isNative()) {
      setCallStatus('listening');
      // Track this attempt so stopListening can cancel it correctly.
      const nativeAttempt = Symbol('nativeSR');
      recognitionRef.current = { attempt: nativeAttempt, native: true } as unknown as object;
      startSpeechRecognition({ language })
        .then(transcript => {
          // If the user ended/interrupted the call mid-listen, drop the result.
          const current = recognitionRef.current as { attempt?: symbol } | null;
          if (!inCallRef.current || current?.attempt !== nativeAttempt) return;
          recognitionRef.current = null;
          if (transcript?.trim()) {
            handleCallInput(transcript);
          } else if (callStatusRef.current === 'listening') {
            // Empty result — re-arm so the user can try again.
            setTimeout(() => startListening(), 300);
          }
        })
        .catch(() => {
          if (inCallRef.current && callStatusRef.current === 'listening') {
            setTimeout(() => startListening(), 500);
          }
        });
      return;
    }

    const win = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SR) { setCallStatus('idle'); return; }

    const rec = new (SR as unknown as { new(): unknown })() as unknown as {
      lang: string; interimResults: boolean; maxAlternatives: number;
      onresult: (e: unknown) => void; onerror: (e: unknown) => void; onend: () => void; start: () => void; stop: () => void;
    };
    const _recNative = language.includes('+') ? language.split('+')[1] : language;
    rec.lang = _recNative === 'hi' ? 'hi-IN' : _recNative === 'bn' ? 'bn-IN' : _recNative === 'ta' ? 'ta-IN' : _recNative === 'te' ? 'te-IN' : _recNative === 'mr' ? 'mr-IN' : 'en-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: unknown) => {
      const ev = e as { results: Array<{ [k: number]: { transcript?: string } }> };
      const transcript = ev.results?.[0]?.[0]?.transcript ?? '';
      if (transcript.trim()) handleCallInput(transcript);
    };
    rec.onerror = (e: unknown) => {
      const errType = (e as { error?: string })?.error ?? '';
      // Fatal: mic permission denied or no hardware — stop retrying, drop to idle.
      if (errType === 'not-allowed' || errType === 'service-not-allowed' || errType === 'audio-capture') {
        recognitionRef.current = null;
        setCallStatus('idle');
        return;
      }
      // Recoverable (network, aborted) — retry only if still in listening state.
      if (inCallRef.current && callStatusRef.current === 'listening') {
        setTimeout(() => startListening(), 500);
      }
    };
    rec.onend = () => {
      // onerror fires before onend — if it already set idle, don't restart.
      if (inCallRef.current && callStatusRef.current === 'listening') startListening();
    };
    rec.start();
    recognitionRef.current = rec;
    setCallStatus('listening');
  }

  async function handleCallTap() {
    // Capacitor (Android/iOS native app) — Web Speech API doesn't exist in
    // WebView, but @capacitor-community/speech-recognition is available, so
    // skip the browser-API gate. Permission flow runs inside startListening().
    if (!isNative()) {
      const win = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
      const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (!SR) {
        alert('Voice calls need Chrome, Edge, or Safari (iOS 14.5+). Please use the text chat below.');
        return;
      }
    }

    // iOS audio unlock — MUST run inside the tap gesture, before any await.
    // Plays a tiny silent WAV so subsequent <Audio> elements can play after async fetches.
    try {
      const silent = new Audio('data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABmYWN0BAAAAAAAAABkYXRhAAAAAA==');
      silent.play().catch(() => {});
    } catch {}
    // Prime speechSynthesis fallback (some Android browsers need this).
    try {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
    } catch {}

    // Mic permission warm-up — the native plugin has its own permission flow
    // (requestPermissions), so skip getUserMedia on Capacitor where the
    // WebView would falsely report mic as blocked even when the OS permission
    // is granted.
    if (!isNative()) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      } catch {
        alert('Please allow microphone access in your browser settings to start a voice call.');
        return;
      }
    }

    // Pre-check ElevenLabs quota. If low, surface a modal so the user can
    // decide whether to start now or top up first. ~850 chars/min is a
    // conservative ElevenLabs speaking-rate estimate for Indic content.
    try {
      const quotaRes = await fetch('/api/voice/quota');
      if (quotaRes.ok) {
        const quota = await quotaRes.json() as { ok: boolean; remaining: number; lowQuota: boolean };
        if (quota.ok && quota.lowQuota) {
          const minutes = Math.max(0, Math.floor(quota.remaining / 850));
          setQuotaWarning({ remaining: quota.remaining, minutes });
          return;
        }
      }
    } catch { /* quota check is best-effort; never block a call on it */ }

    startCall();
  }

  async function startCall() {
    inCallRef.current = true;
    setInCall(true);
    setTimeLeft(180);
    setCallStatus('idle');
    setCallTranscript([]);
    setStreamingText('');
    ttsQueueRef.current = [];
    callStartTimeRef.current = Date.now();
    creditsAtStartRef.current = credits;
    voiceFailuresRef.current = 0;

    const baseIntro = selectedAstrologer.introLines[language] ?? selectedAstrologer.introLines.en;
    const intro = userName ? baseIntro.replace(/\.$/, `, ${userName}.`) : baseIntro;
    setCallTranscript([{ role: 'baba', text: intro }]);
    // Strict ElevenLabs only — the intro voice MUST match the response voice.
    // If ElevenLabs fails on the intro, count it as a failure and let the user
    // try speaking. ElevenLabs may recover by the time the first response plays.
    const ok = await speakWithModal(intro, language, undefined, selectedAstrologer.gender, true, selectedAstrologer.id);
    if (!ok) voiceFailuresRef.current++;

    startListening();
  }

  async function endCall() {
    if (!inCallRef.current && !inCall) return; // already ended
    const startTime = callStartTimeRef.current;
    const creditsAtStart = creditsAtStartRef.current;
    inCallRef.current = false;

    // Tear everything down immediately — no goodbye TTS, no extra deductions.
    silentCleanup();

    // Hide the overlay right away so the user sees the close.
    setInCall(false);
    setCallStatus('idle');
    setCallTranscript([]);
    setStreamingText('');
    setTimeLeft(180);

    // Decide whether to refund a < 3-second call.
    const durationMs = startTime > 0 ? Date.now() - startTime : 0;
    const shortCall = durationMs > 0 && durationMs < 3000;

    try {
      if (shortCall) {
        // Server validates the session is fresh and refunds + clears the session.
        const refundRes = await fetch('/api/credits/refund-short-call', { method: 'POST' });
        if (refundRes.ok) {
          const refundData = await refundRes.json() as { data?: { credits?: number; refunded?: number } };
          if (typeof refundData.data?.credits === 'number') setCredits(refundData.data.credits);
          showSuccess('Call ended', 'Too short — no Dhanam charged.');
          return;
        }
      }

      // Normal path: refresh balance and show how many tokens this call cost.
      const balRes = await fetch('/api/credits/balance');
      if (balRes.ok) {
        const balData = await balRes.json() as { data?: { credits?: number } };
        const newCredits = balData.data?.credits;
        if (typeof newCredits === 'number') {
          setCredits(newCredits);
          const used = Math.max(0, creditsAtStart - newCredits);
          if (used > 0) {
            showSuccess('Call ended', `You used ${used} Dhanam on this call.`);
          } else {
            showSuccess('Call ended', 'No Dhanam charged.');
          }
        }
      }
    } catch {
      /* non-fatal */
    }
  }

  useEffect(() => {
    if (!inCall) return;
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(interval); endCall(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inCall]);

  // End the call cleanly when the user navigates away from the chat page.
  // We can't await endCall in a cleanup, so the synchronous parts (silentCleanup
  // + state reset) run inline; the refund/balance fetch is fire-and-forget.
  useEffect(() => {
    return () => {
      if (inCallRef.current) {
        const startTime = callStartTimeRef.current;
        inCallRef.current = false;
        silentCleanup();
        const durationMs = startTime > 0 ? Date.now() - startTime : 0;
        if (durationMs > 0 && durationMs < 3000) {
          // Best-effort refund — keepalive lets it survive the unload.
          try {
            fetch('/api/credits/refund-short-call', { method: 'POST', keepalive: true }).catch(() => {});
          } catch { /* ignore */ }
        }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    callTranscriptRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [callTranscript]);

  /* CallOverlay is hoisted above the component to prevent remount-flicker */

  /* ---------- Render ---------- */
  const suggestedPrompts = selectedAstrologer.suggestedPrompts;

  // Still loading data — show spinner, not the gate
  if (!dataReady || !fallbackChecked) {
    return <PageSkeleton />;
  }

  // Chat locked — generation still in progress
  if (chatReady === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center bg-bg">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl" style={{ background: 'var(--primary)', opacity: 0.15, position: 'absolute' }} />
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl relative z-10" style={{ background: 'linear-gradient(135deg, #7A96AB22, #D1E1E822)' }}>
            🔮
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-1 text-text">Yogi Baba is preparing your reading</h2>
            <p className="text-sm text-text-muted">
              Your birth chart analysis is being generated in the background.<br />
              Chat will unlock automatically once it&apos;s ready.
            </p>
          </div>
          <div className="flex gap-1.5 mt-2">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-primary/30"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.4 }}
              />
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  /* ── Astrologer Listing View ── */
  if (view === 'list') {
    return (
      <div className="min-h-screen bg-bg">
        <AnimatePresence>
          {showSessions && (
            <SessionsPanel
              sessions={sessions}
              activeSessionId={sessionId}
              loading={loadingSessions}
              onClose={() => setShowSessions(false)}
              onNewChat={startNewChat}
              onSelect={loadSessionMessages}
              onDelete={deleteSession}
            />
          )}
        </AnimatePresence>

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
          <h1 className="text-[22px] font-extrabold font-[family-name:var(--font-serif)] text-text">Chat</h1>
          <div className="flex items-center gap-2">
            <motion.button
              onClick={() => setShowSessions(true)}
              className="flex items-center gap-1.5 h-9 rounded-xl px-3 bg-transparent text-[12px] cursor-pointer text-text-muted border border-border"
              whileTap={{ scale: 0.93 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              History
            </motion.button>
            <motion.button
              className="flex items-center gap-1.5 h-9 rounded-xl px-3 text-[12px] font-bold cursor-pointer text-primary border border-primary/30 bg-primary/8"
              whileTap={{ scale: 0.93 }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M21 18v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1"/><polyline points="15 3 21 9 15 15"/><line x1="21" y1="9" x2="7" y2="9"/></svg>
              ₹{credits}
            </motion.button>
          </div>
        </div>

        {/* Specialty filter tabs */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {ALL_SPECIALTIES.map(s => (
            <motion.button
              key={s.key}
              onClick={() => setSpecialtyFilter(s.key as Specialty | 'all')}
              className="flex-shrink-0 px-4 py-1.5 rounded-full text-[12px] font-semibold border cursor-pointer transition-colors"
              style={{
                background: specialtyFilter === s.key ? 'var(--primary)' : 'transparent',
                borderColor: specialtyFilter === s.key ? 'var(--primary)' : 'var(--border)',
                color: specialtyFilter === s.key ? '#FFFFFF' : 'var(--text-secondary)',
              }}
              whileTap={{ scale: 0.95 }}
            >
              {s.label === 'all' ? 'All Astrologers' : s.label}
            </motion.button>
          ))}
        </div>

        {/* Promo banner */}
        <div className="mx-4 my-3">
          <motion.div
            className="rounded-2xl px-5 py-3.5 flex items-center gap-3 border border-primary/20"
            style={{ background: 'linear-gradient(135deg, rgba(212, 175, 55,0.12) 0%, rgba(209,225,232,0.18) 100%)' }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-primary/15">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">ON YOUR FIRST RECHARGE</p>
              <p className="text-[16px] font-extrabold leading-tight text-text">GET 150% BONUS*</p>
            </div>
          </motion.div>
        </div>

        {/* Astrologer cards */}
        <div className="px-4 pb-8 space-y-3">
          {filteredAstrologers.map((astro, i) => (
            <motion.div
              key={astro.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06 }}
              className="rounded-2xl overflow-hidden bg-surface border border-border"
            >
              <div className="flex gap-3 p-3">
                {/* Avatar col */}
                <div className="flex-shrink-0 flex flex-col items-center gap-1 w-[76px]">
                  <AstrologerAvatar imagePath={astro.imagePath} name={astro.name} size={76} />
                  <span className="text-[9px] font-semibold text-primary">✦ {astro.totalChats}</span>
                  <span className="text-[9px] text-text-muted">Total chats</span>
                </div>

                {/* Info col */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[15px] font-extrabold truncate text-text">{astro.name}</span>
                      <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/12 text-primary">AI</span>
                    </div>
                    <span className="flex-shrink-0 ml-2 text-[9px] font-bold px-2 py-0.5 rounded-md border border-primary/20 bg-primary/8 text-primary">AI ASTRO</span>
                  </div>

                  {/* Specialty tags */}
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {astro.tags.map(tag => (
                      <span
                        key={tag}
                        className="text-[10px] px-2 py-0.5 rounded-md text-text-muted border border-border bg-transparent"
                      >{tag}</span>
                    ))}
                  </div>

                  {/* Style descriptors */}
                  <div className="space-y-0.5 mb-2">
                    <p className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                      <span className="text-primary">⊕</span>{astro.style}
                    </p>
                    <p className="flex items-center gap-1.5 text-[11px] text-text-secondary">
                      <span className="text-primary">☆</span>{astro.title}
                    </p>
                  </div>

                  {/* Price + Chat button */}
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      {astro.isFree ? (
                        <span className="text-[18px] font-extrabold" style={{ color: '#10b981' }}>FREE</span>
                      ) : (
                        <span className="text-[18px] font-extrabold text-primary">{astro.priceLabel}</span>
                      )}
                    </div>
                    <motion.button
                      onClick={() => router.push(`/chat/astrologer/${astro.id}`)}
                      className="px-5 py-2 rounded-xl text-[13px] font-bold cursor-pointer border-none bg-primary text-white hover:bg-primary-ink"
                      whileTap={{ scale: 0.95 }}
                      whileHover={{ scale: 1.02 }}
                    >
                      AI Chat
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  // Gate: no Kundli yet (only in chat view)
  if (charts.length === 0) {
    return (
      <MotionPage className="min-h-screen flex items-center justify-center px-4 bg-bg">
        <FadeIn className="flex flex-col items-center text-center max-w-[320px]">
          <motion.div
            className="text-5xl mb-4"
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            {selectedAstrologer.avatar}
          </motion.div>
          <h2 className="text-lg font-extrabold text-text font-[family-name:var(--font-serif)] mb-1">
            {selectedAstrologer.name} is ready
          </h2>
          <p className="text-[12px] text-text-muted leading-relaxed mb-5">
            For personalised Vedic guidance, {selectedAstrologer.shortName} needs your birth chart first.
          </p>
          <div className="flex flex-wrap justify-center gap-1.5 mb-5">
            {['Planet readings', 'Dasha periods', 'Remedies', 'Voice call'].map(f => (
              <span key={f} className="rounded-full px-2.5 py-1 text-[10px] font-semibold border border-primary/22 bg-primary/8 text-primary">{f}</span>
            ))}
          </div>
          <motion.a href="/kundli/generate"
            className="w-full rounded-xl py-3 text-[14px] font-bold text-center no-underline block mb-3 bg-primary text-white"
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
            Generate Kundli →
          </motion.a>
          <button onClick={() => setView('list')} className="text-[12px] text-text-muted bg-transparent border-none cursor-pointer">
            ← Back to Astrologers
          </button>
        </FadeIn>
      </MotionPage>
    );
  }

  // REPORTS_DISABLED: report-generating loading gate removed — chat opens immediately

  return (
    <>
      {inCall && (
        <CallOverlay
          timeLeft={timeLeft}
          callStatus={callStatus}
          streamingText={streamingText}
          callTranscript={callTranscript}
          transcriptRef={callTranscriptRef}
          onEndCall={endCall}
          onInterrupt={interruptCall}
          personaName={selectedAstrologer.name}
          personaAvatar={selectedAstrologer.avatar}
          personaSubtitle={selectedAstrologer.title}
        />
      )}
      <AnimatePresence>
        {showSessions && (
          <SessionsPanel
            sessions={sessions}
            activeSessionId={sessionId}
            loading={loadingSessions}
            onClose={() => setShowSessions(false)}
            onNewChat={startNewChat}
            onSelect={loadSessionMessages}
            onDelete={deleteSession}
          />
        )}
      </AnimatePresence>
      <MotionPage className="mx-auto flex h-[calc(100dvh-164px)] md:h-[calc(100dvh-64px)] max-w-3xl flex-col px-3 py-4 bg-bg">

        {/* Header — linen style */}
        <FadeIn
          className="mb-3 flex items-center gap-3 -mx-3 px-3 py-2 rounded-xl bg-surface border-b border-border"
        >
          <motion.button
            onClick={() => requestLeave(() => {})}
            className="flex-shrink-0 flex items-center gap-1 text-[12px] bg-transparent border-none cursor-pointer text-text-muted"
            whileTap={{ scale: 0.93 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </motion.button>
          <AstrologerAvatar
            imagePath={selectedAstrologer.imagePath}
            name={selectedAstrologer.name}
            size={36}
            rounded="full"
            bordered={false}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-semibold leading-tight text-text">{selectedAstrologer.name}</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/12 text-primary">AI</span>
            </div>
            <p className="text-[11px] truncate text-primary">{loading ? 'typing...' : selectedAstrologer.title}</p>
          </div>
          {/* Right side controls */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Timer on desktop/tablet (hidden on mobile) */}
            {chatStarted && (
              <div
                className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono font-semibold border border-primary/25 text-primary bg-primary/8"
                style={{ minWidth: 48 }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                {String(Math.floor(chatElapsed / 60)).padStart(2,'0')}:{String(chatElapsed % 60).padStart(2,'0')}
              </div>
            )}
            {/* End chat on desktop/tablet (hidden on mobile) */}
            {chatStarted && (
              <motion.button
                onClick={() => requestLeave(() => {})}
                className="hidden sm:flex rounded-full px-2.5 py-1 cursor-pointer text-[10px] font-bold border items-center gap-1"
                style={{
                  background: 'rgba(220,38,38,0.10)',
                  color: '#ef4444',
                  border: '1px solid rgba(220,38,38,0.25)',
                }}
                whileTap={{ scale: 0.92 }}
                title="End chat"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                End
              </motion.button>
            )}
            {/* Filter toggle */}
            <motion.button
              onClick={() => setShowFilter(f => !f)}
              className="rounded-full p-2 cursor-pointer bg-transparent border-none"
              style={{ color: showFilter ? 'var(--primary)' : 'var(--text-muted)' }}
              whileTap={{ scale: 0.9 }}
              title="Filter"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              </svg>
            </motion.button>
            {/* History */}
            <motion.button
              onClick={() => setShowSessions(true)}
              className="rounded-full p-2 cursor-pointer bg-transparent border-none text-text-muted"
              whileTap={{ scale: 0.9 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </motion.button>
            {/* Voice call — hidden behind a permission gate. Users unlock the
               button by redeeming the IWANTCALL coupon on the /credits page
               (sets users.voice_call_enabled = true). The chat page picks
               that flag straight off the persisted user record from useStore. */}
            {user?.voice_call_enabled && (
              <div className="relative flex items-center">
                <motion.button
                  onClick={handleCallTap}
                  disabled={inCall || !VOICE_SUPPORTED_LANGS.includes(language)}
                  className="rounded-full p-2 cursor-pointer bg-primary/12 border-none text-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  whileTap={{ scale: 0.9 }}
                  title={
                    inCall
                      ? 'Call in progress'
                      : !VOICE_SUPPORTED_LANGS.includes(language)
                        ? `Voice call not available in this language yet — Coming Soon`
                        : `Start voice call with ${selectedAstrologer.shortName}`
                  }
                  aria-label="Start voice call"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                </motion.button>
                {!VOICE_SUPPORTED_LANGS.includes(language) && (
                  <span
                    className="absolute -top-2 -right-1 text-[7px] font-bold uppercase tracking-wide px-1 rounded-full pointer-events-none"
                    style={{ background: 'var(--primary)', color: '#fff', lineHeight: '14px' }}
                  >
                    Soon
                  </span>
                )}
              </div>
            )}
          </div>
        </FadeIn>

        {/* Bottom row: Timer and End button (mobile only) */}
        {chatStarted && (
          <FadeIn
            className="mb-3 flex items-center gap-2 -mx-3 px-3 py-2 rounded-xl sm:hidden bg-surface border-b border-border"
          >
            {/* Elapsed timer */}
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono font-semibold border border-primary/25 text-primary bg-primary/8"
              style={{ minWidth: 48 }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              {String(Math.floor(chatElapsed / 60)).padStart(2,'0')}:{String(chatElapsed % 60).padStart(2,'0')}
            </div>
            {/* End chat button */}
            <motion.button
              onClick={() => requestLeave(() => {})}
              className="rounded-full px-2.5 py-1 cursor-pointer text-[10px] font-bold flex items-center gap-1"
              style={{
                background: 'rgba(220,38,38,0.10)',
                color: '#ef4444',
                border: '1px solid rgba(220,38,38,0.25)',
              }}
              whileTap={{ scale: 0.92 }}
              title="End chat"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              End
            </motion.button>
          </FadeIn>
        )}

        {/* Collapsible Filter Panel */}
        <AnimatePresence>
          {showFilter && (
            <motion.div
              key="filter-panel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden mb-3"
            >
              <div className="rounded-xl px-3 py-3 space-y-3 bg-surface border border-border">
                {/* Section label */}
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Filters</p>

                {/* Language row */}
                <div className="flex items-start gap-2.5">
                  <label className="text-[11px] font-medium w-16 flex-shrink-0 pt-1 text-text-muted">Language</label>
                  <div className="flex flex-wrap gap-1.5">
                    {LANGUAGES.map((lang) => (
                      <motion.button
                        key={lang.code}
                        type="button"
                        onClick={() => setLanguage(lang.code)}
                        className="relative flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
                        style={language === lang.code
                          ? { border: '1px solid var(--primary)', backgroundColor: 'rgba(212, 175, 55,0.15)', color: 'var(--text)' }
                          : { border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text-muted)' }
                        }
                        whileTap={{ scale: 0.95 }}
                        title={!lang.voiceSupported ? `${lang.label} voice — Coming Soon` : undefined}
                      >
                        {lang.label}
                        {!lang.voiceSupported && (
                          <span
                            className="text-[8px] font-bold uppercase tracking-wide px-1 py-0.5 rounded"
                            style={{ background: 'rgba(124,58,237,0.15)', color: 'var(--primary)', lineHeight: 1 }}
                          >
                            Soon
                          </span>
                        )}
                      </motion.button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages */}
        <div className="flex-1 space-y-3 overflow-y-auto pb-3">
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <motion.div
                  className="text-4xl mb-2"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  {selectedAstrologer.avatar}
                </motion.div>
                <p className="text-[13px] font-semibold mb-0.5 text-text">{selectedAstrologer.name}</p>
                <p className="text-[11px] text-text-muted">Ask about {selectedAstrologer.tags.join(', ').toLowerCase()}</p>
                <motion.div
                  className="mt-3 flex flex-wrap justify-center gap-1.5"
                  variants={staggerContainer}
                  initial="initial"
                  animate="animate"
                >
                  {suggestedPrompts.map((s) => (
                    <motion.button
                      key={s}
                      variants={staggerItem}
                      onClick={() => { setInput(s); inputRef.current?.focus(); }}
                      className="rounded-full px-2.5 py-1 text-[11px] transition-colors border border-border text-text-muted"
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.96 }}
                    >
                      {s}
                    </motion.button>
                  ))}
                </motion.div>
              </div>
            </div>
          )}

          {/* Chart zoom modal — opened by tapping the chart card */}
          {activeChart && (
            <ChartZoomModal
              isOpen={chartZoomOpen}
              onClose={() => setChartZoomOpen(false)}
              title="Birth Chart"
            >
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <NorthIndianChart chartData={activeChart.chart_data as any} ascendantHouse={1} size={520} />
            </ChartZoomModal>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg) => {
              // Chart card bubble — rendered on the first message after 2s
              if (msg.isChartCard && activeChart && activeProfile) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const cd = activeChart.chart_data as any;
                const dobFormatted = new Date(activeProfile.dob + 'T00:00:00').toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'short', year: 'numeric',
                });
                return (
                  <motion.div
                    key={msg.id}
                    className="flex justify-start items-end gap-1.5"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                  >
                    <AstrologerAvatar
                      imagePath={selectedAstrologer.imagePath}
                      name={selectedAstrologer.name}
                      size={28}
                      rounded="full"
                      bordered={false}
                    />
                    <div className="rounded-2xl rounded-bl-sm overflow-hidden max-w-[78%] bg-surface border border-border">
                      <button
                        type="button"
                        onClick={() => setChartZoomOpen(true)}
                        aria-label="Tap to zoom chart"
                        title="Tap to zoom"
                        className="block w-full p-3 pb-2 text-left cursor-zoom-in transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <NorthIndianChart chartData={cd} ascendantHouse={1} size={220} />
                      </button>
                      <div className="px-4 pb-3 pt-2 border-t border-border">
                        <p className="text-[13px] font-semibold text-text">
                          {activeProfile.name}
                        </p>
                        <p className="text-[11px] mt-0.5 text-text-muted">
                          {dobFormatted} · {activeProfile.tob}
                        </p>
                        <p className="text-[11px] text-text-muted">
                          {activeProfile.pob}
                        </p>
                      </div>
                      <div className="px-4 py-2.5 bg-primary/5 border-t border-border">
                        <p className="text-[12px] italic text-text-muted">
                          This is your birth chart — I&apos;m analyzing it for you ✨
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              }

              return (
                <motion.div
                  key={msg.id}
                  className={`flex items-end gap-1.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  initial={{ opacity: 0, y: 16, x: msg.role === 'user' ? 20 : -20 }}
                  animate={{ opacity: 1, y: 0, x: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  {msg.role === 'assistant' && (
                    <AstrologerAvatar
                      imagePath={selectedAstrologer.imagePath}
                      name={selectedAstrologer.name}
                      size={28}
                      rounded="full"
                      bordered={false}
                      className="mb-0.5"
                    />
                  )}
                  <div
                    className={`max-w-[80%] px-3 py-2.5 ${
                      msg.role === 'user'
                        ? 'bg-primary text-white rounded-[16px_16px_3px_16px]'
                        : 'bg-surface border border-border text-text rounded-[16px_16px_16px_3px]'
                    }`}
                  >
                    {msg.role === 'user'
                      ? <p className="text-[13px] text-white">{msg.content}</p>
                      : <>
                          <StructuredChatResponse text={msg.content} />
                          <ProductCards text={msg.content} />
                        </>
                    }
                    <div className="mt-1 text-[9px] flex items-center justify-between gap-1 text-text-muted">
                      <div className="flex items-center gap-1">
                        {/* Speaker — works on web (browser SpeechSynthesis) and native */}
                        {msg.role === 'assistant' && (
                          <button
                            onClick={async () => {
                              if (speakingMsgId === msg.id) {
                                try { await stopSpeaking(); } finally { setSpeakingMsgId(null); }
                              } else {
                                setSpeakingMsgId(msg.id);
                                // try/finally so the pause icon never gets stuck if the TTS engine
                                // rejects (missing language data, plugin error, etc).
                                try {
                                  await speak({ text: msg.content, language: userLang });
                                } finally {
                                  setSpeakingMsgId(null);
                                }
                              }
                            }}
                            className="opacity-60 hover:opacity-100 transition-opacity"
                            title={speakingMsgId === msg.id ? 'Stop' : 'Read aloud'}
                          >
                            {speakingMsgId === msg.id
                              ? <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                              : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                            }
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span>{msg.timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                        {msg.role === 'user' && <MessageTicks status={msg.status} />}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Streaming reply — shows tokens live as they arrive */}
          {loading && streamingReply && (
            <motion.div
              className="flex justify-start items-end gap-1.5"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <AstrologerAvatar
                imagePath={selectedAstrologer.imagePath}
                name={selectedAstrologer.name}
                size={28}
                rounded="full"
                bordered={false}
                className="mb-0.5"
              />
              <div className="max-w-[80%] px-3 py-2.5 bg-surface border border-border text-text rounded-[16px_16px_16px_3px]">
                <FormattedText text={streamingReply} />
                <span className="inline-block w-1.5 h-3.5 rounded-sm ml-0.5 animate-pulse bg-primary" />
              </div>
            </motion.div>
          )}

          {/* Engaging interim messages + cycling thinking label while API processes */}
          {loading && !streamingReply && (
            <>
              <AnimatePresence>
                {shownInterimMsgs.map((msg, idx) => (
                  <motion.div
                    key={`interim-${idx}`}
                    className="flex justify-start items-end gap-1.5"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                  >
                    <AstrologerAvatar
                      imagePath={selectedAstrologer.imagePath}
                      name={selectedAstrologer.name}
                      size={28}
                      rounded="full"
                      bordered={false}
                    />
                    <div className="px-4 py-3 text-sm max-w-[78%] bg-surface border border-border rounded-[16px_16px_16px_3px] text-text-muted italic">
                      {msg}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {!streamingReply && (
                <motion.div
                  className="flex justify-start items-end gap-1.5"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <AstrologerAvatar
                    imagePath={selectedAstrologer.imagePath}
                    name={selectedAstrologer.name}
                    size={28}
                    rounded="full"
                    bordered={false}
                  />
                  <div className="px-4 py-3 flex items-center gap-2 bg-surface border border-border rounded-[16px_16px_16px_3px]">
                    <DotsSkeleton />
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={thinkingLabelIdx}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="text-[11px] text-text-muted"
                      >
                        {THINKING_LABELS[thinkingLabelIdx]}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick-reply chips — appear when the AI ends its last message with a "?". */}
        {(() => {
          if (loading) return null;
          // Find the last assistant message; bail if a user reply already follows.
          let lastAssistantContent: string | null = null;
          for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            if (m.role === 'user') return null;
            if (m.role === 'assistant' && !m.isChartCard && m.content) {
              lastAssistantContent = m.content;
              break;
            }
          }
          if (!lastAssistantContent) return null;
          const askedQ = extractAskedQuestion(lastAssistantContent);
          if (!askedQ) return null;
          const labels = QUICK_REPLIES[language] ?? QUICK_REPLIES.en;
          const chips: Array<{ key: string; label: string; isSkip?: boolean }> = [
            { key: 'yes',    label: labels.yes },
            { key: 'no',     label: labels.no },
            { key: 'unsure', label: labels.unsure },
            { key: 'skip',   label: labels.skip, isSkip: true },
          ];
          return (
            <motion.div
              key="quick-replies"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18 }}
              className="flex flex-wrap gap-1.5 mb-2"
              aria-label="Quick replies to the astrologer's question"
            >
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => {
                    if (c.isSkip) {
                      // Persist as skipped so the AI moves on without re-asking.
                      saveFollowUpAnswer(askedQ, '__skipped__');
                      // Locally drop the trailing question from the rendered message
                      // so the chips disappear immediately.
                      setMessages(prev => {
                        const next = [...prev];
                        for (let i = next.length - 1; i >= 0; i--) {
                          if (next[i].role === 'assistant' && !next[i].isChartCard) {
                            next[i] = { ...next[i], content: next[i].content.replace(askedQ, '').trim() };
                            break;
                          }
                        }
                        return next;
                      });
                      return;
                    }
                    sendMessage(c.label);
                  }}
                  className="rounded-full px-3 py-1.5 text-[12px] font-medium border border-primary/30 bg-primary/8 text-primary hover:bg-primary/15 active:scale-95 transition-all cursor-pointer"
                >
                  {c.label}
                </button>
              ))}
            </motion.div>
          );
        })()}

        {/* Typing pill — visible while the AI is generating a reply */}
        <AnimatePresence>
          {loading && (
            <motion.div
              key="typing-pill"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-1.5 mx-auto mb-2 px-3 py-1.5 rounded-full text-[11px] font-medium border border-primary/25 bg-primary/8 text-primary"
              style={{ width: 'fit-content' }}
              aria-live="polite"
            >
              <span className="text-sm leading-none">✦</span>
              <span>{selectedAstrologer.shortName} {thinkingPhase === 'thinking' ? 'is thinking' : 'is typing'}</span>
              <span className="flex gap-0.5 ml-0.5">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="w-1 h-1 rounded-full bg-primary"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.0, repeat: Infinity, delay: i * 0.18 }}
                  />
                ))}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input */}
        <div className="pt-3 flex gap-2 items-center border-t border-border">
          {/* Mic button — STT, works on web (Chrome) and native Android */}
          <button
            title={recording ? 'Tap to stop' : 'Speak your question'}
            onClick={async () => {
              if (recording) {
                await stopSpeechRecognition();
                setRecording(false);
              } else {
                setRecording(true);
                const text = await startSpeechRecognition({ language: userLang });
                setRecording(false);
                if (text) setInput(text);
              }
            }}
            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border transition-all ${
              recording
                ? 'bg-red-500/20 border-red-400 animate-pulse'
                : 'bg-surface-2 border-border hover:border-primary'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke={recording ? '#ef4444' : 'currentColor'} strokeWidth="2" strokeLinecap="round">
              <rect x="9" y="2" width="6" height="12" rx="3"/>
              <path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="22"/>
              <line x1="8" y1="22" x2="16" y2="22"/>
            </svg>
          </button>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={recording ? 'Listening…' : 'Ask about your chart...'}
            disabled={loading}
            className="flex-1 rounded-[10px] px-4 py-2.5 text-[13px] focus:outline-none disabled:opacity-50 bg-surface-2 border border-border text-text focus:border-primary"
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all active:scale-95 disabled:opacity-40 border-none cursor-pointer bg-primary hover:bg-primary-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </MotionPage>

      {/* Leave-chat confirmation modal */}
      <AnimatePresence>
        {leaveConfirm && (
          <>
            <motion.div
              key="leave-backdrop"
              className="fixed inset-0 z-[90] bg-[rgba(36,28,21,0.35)] backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLeaveConfirm(null)}
            />
            <motion.div
              key="leave-modal"
              className="fixed z-[91] left-1/2 bottom-24 w-[calc(100%-2rem)] max-w-sm rounded-2xl p-5 shadow-2xl bg-surface border border-border"
              style={{ x: '-50%' }}
              initial={{ opacity: 0, y: 32, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            >
              <p className="text-[15px] font-bold mb-1 text-text">Leave this chat?</p>
              <p className="text-[12px] mb-5 text-text-muted">You haven&apos;t ended this session. Your messages stay saved either way.</p>
              <div className="flex gap-2">
                <button
                  onClick={leaveConfirm.onEnd}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold cursor-pointer"
                  style={{ backgroundColor: 'rgba(220,38,38,0.12)', color: '#ef4444', border: '1px solid rgba(220,38,38,0.28)' }}
                >
                  End chat
                </button>
                <button
                  onClick={() => setLeaveConfirm(null)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold cursor-none cursor-pointer bg-surface-2 border border-border text-text"
                >
                  Keep chatting
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Voice-quota warning modal — shown before starting a call when ElevenLabs budget is low */}
      <AnimatePresence>
        {quotaWarning && (
          <>
            <motion.div
              key="quota-backdrop"
              className="fixed inset-0 z-[90] bg-[rgba(8,6,4,0.55)] backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setQuotaWarning(null)}
            />
            <motion.div
              key="quota-modal"
              className="fixed z-[91] left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-sm rounded-2xl p-6 shadow-2xl bg-surface border border-border"
              style={{ x: '-50%', y: '-50%' }}
              initial={{ opacity: 0, y: 'calc(-50% + 16px)', scale: 0.96 }}
              animate={{ opacity: 1, y: '-50%', scale: 1 }}
              exit={{ opacity: 0, y: 'calc(-50% + 16px)', scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(245,158,11,0.06))',
                    border: '1px solid rgba(245,158,11,0.32)',
                  }}
                >
                  ⚠️
                </div>
                <div>
                  <p className="text-[16px] font-bold text-text leading-tight">Voice quota running low</p>
                  <p className="text-[12px] text-text-muted mt-0.5">Your call may end early.</p>
                </div>
              </div>

              <div
                className="rounded-xl p-4 mb-5"
                style={{
                  background: 'rgba(245,158,11,0.06)',
                  border: '1px solid rgba(245,158,11,0.18)',
                }}
              >
                <p className="text-[11px] uppercase tracking-wider text-text-muted mb-1">Estimated talk time left</p>
                <p className="text-[14px] font-bold leading-none" style={{ color: '#F59E0B' }}>
                  {quotaWarning.minutes < 1
                    ? 'Less than a minute'
                    : `~${quotaWarning.minutes} min${quotaWarning.minutes === 1 ? '' : 's'}`}
                </p>
                <p className="text-[11px] text-text-muted mt-2">
                  Based on {quotaWarning.remaining.toLocaleString()} characters of remaining voice budget.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setQuotaWarning(null)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold cursor-pointer bg-surface-2 border border-border text-text"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setQuotaWarning(null); startCall(); }}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold cursor-pointer text-white"
                  style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)', border: '1px solid rgba(245,158,11,0.5)' }}
                >
                  Start call anyway
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ChatPageInner />
    </Suspense>
  );
}
