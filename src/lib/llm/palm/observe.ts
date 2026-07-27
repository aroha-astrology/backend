// =============================================================================
// Palm reading Stage A — vision observation
// =============================================================================
// The ONLY stage that ever sees a pixel. Temperature 0.1 (see
// PALM_OBSERVE_PROFILE) for reproducibility — the same palm photographed
// twice should measure the same. Output is PURE MEASUREMENT: no
// interpretation, no prose, no meaning. Stage B (interpret.ts) turns these
// facts into a reading; this module must never do that job itself.
//
// Schema condensed from the legacy, previously-shipped implementation at
// apps/api/src/lib/palm/bedrockAnalysis.ts (Bedrock/Claude) — ported to the
// live backend's multimodal ChatMessage shape and Gemini's OpenAI-compatible
// vision input format.
// =============================================================================

import { cleanJsonString } from '../horoscope.js';
import type { ChatMessage } from '../../../config/llm.js';
import type {
  PalmHandObservations,
  PalmMounts,
  PalmMajorLine,
  PalmMajorLines,
  Development,
  LineLength,
  LineDepth,
} from '../../astro-engine/palm/palm-types.js';

const SYSTEM_PROMPT = `You are a precision measurement instrument for palmistry photographs, not an interpreter. You MEASURE ONLY: which lines are present, their length/depth/breaks/islands, mount development, finger/thumb geometry, fingerprint patterns, and any special markings. You NEVER interpret what a measurement means — that is a separate system's job. Always rate image quality first, honestly. If a feature is not visible in the photograph, mark it absent/normal rather than guessing. For each major line that is present, ALSO trace its path as "polyline": an ordered array of 4-8 [x,y] points, each normalized to the [0.0, 1.0] range of the FIRST (front-view) image supplied, where (0,0) is the top-left corner and (1,1) is the bottom-right corner — this is used to draw the line over the user's own photo, so trace the ACTUAL visible crease, not a generic path. Omit "polyline" entirely for a line that isn't clearly traceable. Return ONLY a single JSON object matching the schema in the user message — no markdown fences, no prose outside the JSON.`;

const OBSERVE_SCHEMA_HINT = `{
  "hand": "left|right",
  "imageQuality": {"score":0-10,"lineVisibility":0-10,"lighting":0-10,"focus":0-10,"framing":0-10},
  "handType": {"element":"Earth|Air|Fire|Water","palmShape":"square|rectangular|narrow|wide","skinTexture":"coarse|medium|fine"},
  "mounts": {"jupiter":"flat|normal|prominent","saturn":"...","apollo":"...","mercury":"...","venus":"...","luna":"...","marsUpper":"...","marsLower":"...","rahuPlain":"..."},
  "majorLines": {
    "lifeLine": {"present":bool,"length":"short|medium|long","depth":"faint|medium|deep","breaks":0,"islands":0,"polyline":[[0.0,0.0]]},
    "heartLine": {"present":bool,"length":"...","depth":"...","endingPosition":"jupiter|saturn|mercury|percussion","chains":bool,"polyline":[[0.0,0.0]]},
    "headLine": {"present":bool,"length":"...","depth":"...","separation":"attached to life|separated|very separated","polyline":[[0.0,0.0]]},
    "fateLine": {"present":bool,"length":"...","depth":"...","polyline":[[0.0,0.0]]}
  },
  "minorLines": {
    "marriageLines": {"count":0,"forked":bool,"islands":bool},
    "childrenLines": {"count":0},
    "intuitionLine": {"present":bool},
    "travelLines": {"count":0}
  },
  "thumb": {"flexibility":"stiff|normal|flexible|hypermobile","setAngle":"high|medium|low"},
  "fingerprints": [{"finger":"thumb|index|middle|ring|little","pattern":"loop|whorl|arch"}],
  "specialMarkings": [{"symbol":"star|triangle|square|cross|fish|trident|mysticCross|yava|shankh","location":"string"}]
}`;

export interface ObserveInput {
  hand: 'left' | 'right';
  frames: Array<{ slot: string; dataUrl: string }>;
}

export function buildObserveMessages(input: ObserveInput): ChatMessage[] {
  const slotList = input.frames.map((f) => f.slot).join(', ');
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Measure the ${input.hand} hand shown in the following ${input.frames.length} photograph(s) (captured angles: ${slotList}). Return ONLY a JSON object matching exactly this shape:\n${OBSERVE_SCHEMA_HINT}`,
        },
        ...input.frames.map((f) => ({
          type: 'image_url' as const,
          image_url: { url: f.dataUrl },
        })),
      ],
    },
  ];
}

const DEVELOPMENTS = new Set<Development>(['flat', 'normal', 'prominent']);
const MOUNT_KEYS: Array<keyof PalmMounts> = [
  'jupiter',
  'saturn',
  'apollo',
  'mercury',
  'venus',
  'luna',
  'marsUpper',
  'marsLower',
  'rahuPlain',
];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function parseMounts(raw: unknown): PalmMounts | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const mounts = {} as PalmMounts;
  for (const key of MOUNT_KEYS) {
    const value = obj[key];
    mounts[key] =
      typeof value === 'string' && DEVELOPMENTS.has(value as Development)
        ? (value as Development)
        : 'normal';
  }
  return mounts;
}

/** A well-formed polyline point: exactly [x,y], both finite numbers in [0,1]. Anything else
 * (a model emitting a stray string, an out-of-range coordinate, wrong tuple length) drops the
 * WHOLE polyline rather than rendering a garbled/off-canvas overlay — see the "malformed
 * polyline" test. The line's other measured fields stay intact either way. */
function isValidPolylinePoint(p: unknown): p is [number, number] {
  return (
    Array.isArray(p) &&
    p.length === 2 &&
    typeof p[0] === 'number' &&
    typeof p[1] === 'number' &&
    p[0] >= 0 &&
    p[0] <= 1 &&
    p[1] >= 0 &&
    p[1] <= 1
  );
}

function parsePolyline(raw: unknown): Array<[number, number]> | undefined {
  if (!Array.isArray(raw) || raw.length < 2) return undefined;
  return raw.every(isValidPolylinePoint) ? raw : undefined;
}

function parseMajorLine(raw: unknown): PalmMajorLine {
  if (typeof raw !== 'object' || raw === null) return { present: false };
  const obj = raw as Record<string, unknown>;
  const line: PalmMajorLine = { present: obj.present === true };
  if (typeof obj.length === 'string') line.length = obj.length as LineLength;
  if (typeof obj.depth === 'string') line.depth = obj.depth as LineDepth;
  if (typeof obj.breaks === 'number') line.breaks = obj.breaks;
  if (typeof obj.islands === 'number') line.islands = obj.islands;
  if (typeof obj.forks === 'boolean') line.forks = obj.forks;
  if (typeof obj.chains === 'boolean') line.chains = obj.chains;
  if (typeof obj.endingPosition === 'string') line.endingPosition = obj.endingPosition;
  if (typeof obj.separation === 'string') line.separation = obj.separation;
  const polyline = parsePolyline(obj.polyline);
  if (polyline) line.polyline = polyline;
  return line;
}

function parseMajorLines(raw: unknown): PalmMajorLines | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  if (
    !('lifeLine' in obj) ||
    !('heartLine' in obj) ||
    !('headLine' in obj) ||
    !('fateLine' in obj)
  ) {
    return null;
  }
  return {
    lifeLine: parseMajorLine(obj.lifeLine),
    heartLine: parseMajorLine(obj.heartLine),
    headLine: parseMajorLine(obj.headLine),
    fateLine: parseMajorLine(obj.fateLine),
    ...(obj.sunLine ? { sunLine: parseMajorLine(obj.sunLine) } : {}),
  };
}

/**
 * Parses Stage A's response into the typed observation shape. Structurally
 * defensive rather than exhaustively field-by-field strict (same posture as
 * match-report.ts's parseSections): the two load-bearing blocks (mounts,
 * majorLines) must be present and well-formed or the whole reading is
 * unusable and this returns null so the caller throws/refunds; individual
 * leaf fields that are missing/malformed fall back to safe defaults rather
 * than failing the entire reading over one bad enum value.
 */
export function parseObserveResponse(raw: string): PalmHandObservations | null {
  try {
    const data = JSON.parse(cleanJsonString(raw)) as Record<string, unknown>;

    const mounts = parseMounts(data.mounts);
    if (!mounts) return null;
    const majorLines = parseMajorLines(data.majorLines);
    if (!majorLines) return null;

    const iq = (data.imageQuality ?? {}) as Record<string, unknown>;
    const ht = (data.handType ?? {}) as Record<string, unknown>;
    const ml = (data.minorLines ?? {}) as Record<string, unknown>;
    const th = (data.thumb ?? {}) as Record<string, unknown>;

    const num = (v: unknown, fallback: number) =>
      typeof v === 'number' && !Number.isNaN(v) ? clamp(v, 0, 10) : fallback;

    return {
      hand: data.hand === 'left' ? 'left' : 'right',
      imageQuality: {
        score: num(iq.score, 5),
        lineVisibility: num(iq.lineVisibility, 5),
        lighting: num(iq.lighting, 5),
        focus: num(iq.focus, 5),
        framing: num(iq.framing, 5),
      },
      handType: {
        element: (['Earth', 'Air', 'Fire', 'Water'] as const).includes(ht.element as never)
          ? (ht.element as 'Earth' | 'Air' | 'Fire' | 'Water')
          : 'Earth',
        palmShape: (['square', 'rectangular', 'narrow', 'wide'] as const).includes(
          ht.palmShape as never,
        )
          ? (ht.palmShape as 'square' | 'rectangular' | 'narrow' | 'wide')
          : 'square',
        skinTexture: (['coarse', 'medium', 'fine'] as const).includes(ht.skinTexture as never)
          ? (ht.skinTexture as 'coarse' | 'medium' | 'fine')
          : 'medium',
      },
      mounts,
      majorLines,
      minorLines: {
        marriageLines: {
          count:
            typeof (ml.marriageLines as Record<string, unknown>)?.count === 'number'
              ? ((ml.marriageLines as Record<string, unknown>).count as number)
              : 0,
          forked: (ml.marriageLines as Record<string, unknown>)?.forked === true,
          islands: (ml.marriageLines as Record<string, unknown>)?.islands === true,
        },
        childrenLines: {
          count:
            typeof (ml.childrenLines as Record<string, unknown>)?.count === 'number'
              ? ((ml.childrenLines as Record<string, unknown>).count as number)
              : 0,
        },
        intuitionLine: { present: (ml.intuitionLine as Record<string, unknown>)?.present === true },
        travelLines: {
          count:
            typeof (ml.travelLines as Record<string, unknown>)?.count === 'number'
              ? ((ml.travelLines as Record<string, unknown>).count as number)
              : 0,
        },
      },
      thumb: {
        flexibility: (['stiff', 'normal', 'flexible', 'hypermobile'] as const).includes(
          th.flexibility as never,
        )
          ? (th.flexibility as 'stiff' | 'normal' | 'flexible' | 'hypermobile')
          : 'normal',
        setAngle: (['high', 'medium', 'low'] as const).includes(th.setAngle as never)
          ? (th.setAngle as 'high' | 'medium' | 'low')
          : 'medium',
      },
      fingerprints: Array.isArray(data.fingerprints)
        ? (data.fingerprints as unknown[]).filter(
            (f): f is PalmHandObservations['fingerprints'][number] =>
              typeof f === 'object' && f !== null && 'finger' in f && 'pattern' in f,
          )
        : [],
      specialMarkings: Array.isArray(data.specialMarkings)
        ? (data.specialMarkings as unknown[]).filter(
            (m): m is PalmHandObservations['specialMarkings'][number] =>
              typeof m === 'object' && m !== null && 'symbol' in m && 'location' in m,
          )
        : [],
    };
  } catch {
    return null;
  }
}
