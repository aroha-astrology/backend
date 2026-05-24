'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   PALM_METADATA
   Samudrika Shastra properties for BOTH hands.

   Coordinate system: SVG viewBox 0 0 260 330, y increases downward.
   Back-camera orientation:
     • LEFT  palm → thumb appears on the RIGHT of the image → no mirror
     • RIGHT palm → thumb appears on the LEFT  of the image → x = 260 − x

   All right-palm coordinates are the arithmetic mirror of the left-palm
   coordinates so they are usable on any canvas/API without SVG transforms.
═══════════════════════════════════════════════════════════════════════════ */
export const PALM_METADATA = {
  viewBox: '0 0 260 330',
  strokeSpec: '0.75 px, no gradient, anatomical precision',

  /* ── Per-hand Vedic interpretation ─────────────────────────────────── */
  handMeta: {
    left: {
      vedicName: 'Vāma Hasta',
      devanagari: 'वाम हस्त',
      samudrikaRole: 'Passive / Natal hand',
      backCameraOrientation: 'thumb on RIGHT of image (no mirror applied)',
      governs: [
        'Birth-given potential — Janma karma',
        'Subconscious tendencies and inherited traits',
        'Constitutional health at birth',
        'Past-life impressions carried into this incarnation',
      ],
      traditional: {
        male: 'Secondary — reveals birth potential and Sanchita (accumulated) karma',
        female: 'Primary — reveals active Kriyamana karma and present destiny',
      },
      philosophicalBasis:
        'The left (Candra / Moon) side receives cosmic impressions. ' +
        'Lines here show what the soul carried into this birth.',
    },
    right: {
      vedicName: 'Dakṣiṇa Hasta',
      devanagari: 'दक्षिण हस्त',
      samudrikaRole: 'Active / Manifest hand',
      backCameraOrientation: 'thumb on LEFT of image (x = 260 − x mirror)',
      governs: [
        'Current and future karma — Kriyamana karma',
        'Waking consciousness and deliberate actions',
        'How birth potential is being expressed today',
        'Present trajectory of destiny',
      ],
      traditional: {
        male: 'Primary — reveals active karma and current destiny path',
        female: 'Secondary — reveals birth potential and Sanchita karma',
      },
      philosophicalBasis:
        'The right (Sūrya / Sun) side executes karma in the manifest world. ' +
        'Lines here show what the soul is creating in this incarnation.',
    },
  },

  /* ── Rekha (palm line) Samudrika properties ─────────────────────────── */
  rekhas: {
    bhagya: {
      vedicName: 'Bhagya Rekha', devanagari: 'भाग्य रेखा',
      englishName: 'Fate Line',
      alias: ['Karma Rekha', 'Saturn Line'],
      planet: 'Saturn (Śani)', element: 'Earth',
      origin: 'Manibandha (wrist)',
      termination: 'Śani Parvat (Saturn mount — middle finger base)',
      governs: ['career', 'material destiny', 'social position', 'accumulated karma'],
      auspicious: 'Long, straight, unbroken; rises to Saturn mount',
      inauspicious: 'Absent, chained, broken',
      classicalRef: 'Hasta Sāmudrika Śāstra, adhyāya 5, śloka 7–19',
    },
    ayu: {
      vedicName: 'Āyu Rekha', devanagari: 'आयु रेखा',
      englishName: 'Life Line',
      alias: ['Jīva Rekha', 'Venus Line'],
      planet: 'Venus (Śukra)', element: 'Water',
      origin: 'First interdigital space (Tarjanī–Aṅguṣṭha web)',
      termination: 'Manibandha, encircling Śukra Parvat',
      governs: ['vitality', 'constitution', 'resilience', 'major life transitions'],
      auspicious: 'Deep arc fully encircling Venus mount; reaches wrist; no breaks',
      inauspicious: 'Short; chained; island = specific health event; break = trauma',
      classicalRef: 'Hasta Sāmudrika Śāstra, adhyāya 3, śloka 14–28',
    },
    matru: {
      vedicName: 'Mātṛ Rekha', devanagari: 'मातृ रेखा',
      englishName: 'Head Line',
      alias: ['Mastīṣka Rekha', 'Mental Line'],
      planet: 'Mercury (Budha) / Moon (Candra)', element: 'Air',
      origin: 'Shared with Life Line at first interdigital space',
      termination: 'Percussion edge / Candra (Luna) mount',
      governs: ['intellect', 'memory', 'career orientation', 'decision-making'],
      auspicious: 'Clear, long, slight slope toward Luna; no islands',
      inauspicious: 'Short; chained; break = mental event',
      classicalRef: 'Hasta Sāmudrika Śāstra, adhyāya 4, śloka 3–22',
    },
    hridaya: {
      vedicName: 'Hṛdaya Rekha', devanagari: 'हृदय रेखा',
      englishName: 'Heart Line',
      alias: ['Prem Rekha', 'Emotion Line'],
      planet: 'Sun (Sūrya) / Venus (Śukra)', element: 'Fire',
      origin: 'Budha Parvat (Mercury mount — pinky base)',
      termination: 'Guru Parvat (Jupiter mount — index finger base)',
      governs: ['emotional depth', 'love', 'cardiac health', 'empathy'],
      auspicious: 'Deep, curves upward to Jupiter; no breaks or islands',
      inauspicious: 'Chained; break = emotional rupture',
      classicalRef: 'Hasta Sāmudrika Śāstra, adhyāya 3, śloka 29–48',
    },
  },

  /* ── Navagraha Parvat definitions ────────────────────────────────────── */
  parvatMeta: {
    guru:    { planet: 'Jupiter (Guru)',     navagrahaIndex: 1, finger: 'Index (Tarjanī)',       governs: ['wisdom','dharma','authority','prosperity'] },
    shani:   { planet: 'Saturn (Śani)',      navagrahaIndex: 2, finger: 'Middle (Madhyamā)',     governs: ['discipline','karma','resilience','service'] },
    surya:   { planet: 'Sun (Sūrya)',        navagrahaIndex: 3, finger: 'Ring (Anāmikā)',        governs: ['fame','recognition','creativity','vitality'] },
    budha:   { planet: 'Mercury (Budha)',    navagrahaIndex: 4, finger: 'Pinky (Kaniṣṭhā)',      governs: ['communication','business','wit','health'] },
    shukra:  { planet: 'Venus (Śukra)',      navagrahaIndex: 6, finger: 'Thenar / thumb base',   governs: ['love','beauty','material pleasures','art'] },
    mangalU: { planet: 'Upper Mars (Mangal+)',navagrahaIndex: 5,finger: 'Between Guru & Śukra', governs: ['courage','assertiveness','aggression'] },
    mangalL: { planet: 'Lower Mars (Mangal−)',navagrahaIndex: 5,finger: 'Hypothenar upper',     governs: ['endurance','resistance','stoicism'] },
    chandra: { planet: 'Moon (Candra)',      navagrahaIndex: 7, finger: 'Hypothenar lower',      governs: ['intuition','travel','imagination','emotion'] },
    rahu:    { planet: 'Rahu / Ketu',        navagrahaIndex: 8, finger: 'Palm centre',           governs: ['hidden karma','transformation','fate'] },
  },

  /* ── Auspicious symbols ──────────────────────────────────────────────── */
  symbols: {
    yava: {
      vedicName: 'Yava', devanagari: 'यव',
      english: 'Barley Grain',
      location: 'Thumb interphalangeal (IP) joint',
      shape: 'Vesica piscis — narrow ellipse aligned to thumb axis (−45° rotation)',
      significance: 'Exceptional fortune, royal lineage, long prosperous life',
      classicalRef: 'Hasta Sāmudrika Śāstra, adhyāya 9, śloka 3',
    },
  },

  /* ── Hand-specific SVG coordinates ──────────────────────────────────── */
  hands: {
    /* LEFT palm — back camera: thumb on RIGHT — no SVG mirror */
    left: {
      palmPath:
        'M 24 316 ' +
        'C 10 298, 8 272, 12 244 C 16 220, 20 206, 22 200 ' +
        'C 24 196, 30 194, 34 192 ' +
        'C 33 178, 32 148, 32 118 C 33 98, 37 82, 42 76 ' +
        'C 43 72, 48 71, 52 75 C 55 79, 56 104, 55 134 ' +
        'C 54 160, 54 170, 56 181 ' +
        'C 58 191, 62 199, 66 199 C 70 199, 74 191, 76 181 ' +
        'C 74 163, 73 110, 74 76 C 75 58, 81 47, 88 51 ' +
        'C 93 55, 93 110, 91 175 ' +
        'C 91 187, 95 194, 101 194 C 105 194, 109 187, 111 177 ' +
        'C 109 159, 108 98, 109 60 C 111 33, 118 20, 126 28 ' +
        'C 132 36, 131 94, 129 156 C 127 173, 129 183, 133 185 ' +
        'C 135 191, 139 194, 143 190 C 147 187, 149 179, 149 171 ' +
        'C 147 153, 146 104, 149 72 C 151 52, 158 44, 164 55 ' +
        'C 169 67, 169 122, 165 170 ' +
        'L 167 187 C 171 202, 177 210, 184 210 ' +
        'C 194 206, 213 186, 227 168 C 235 154, 243 146, 245 153 ' +
        'C 247 161, 241 169, 231 172 C 219 176, 207 190, 197 202 ' +
        'C 191 215, 187 241, 184 267 C 181 286, 167 303, 149 311 ' +
        'C 119 321, 69 321, 24 316 Z',

      rekhas: {
        bhagya: 'M 108 310 C 110 282, 112 252, 113 224 C 114 206, 116 196, 117 186',
        ayu:    'M 183 210 C 188 226, 192 244, 191 260 C 190 278, 184 294, 173 305 C 162 315, 149 320, 135 320',
        matru:  'M 183 210 C 158 215, 126 220, 94 226 C 70 230, 46 232, 26 236',
        hridaya:'M 48 178 C 66 170, 92 164, 114 162 C 133 161, 149 165, 158 172',
      },

      mounts: {
        guru:    { x: 148, y: 186 },
        shani:   { x: 114, y: 179 },
        surya:   { x: 79,  y: 186 },
        budha:   { x: 46,  y: 194 },
        shukra:  { x: 192, y: 252 },
        mangalU: { x: 170, y: 204 },
        mangalL: { x: 22,  y: 230 },
        chandra: { x: 22,  y: 268 },
        rahu:    { x: 96,  y: 232 },
      },

      // PIP and DIP joint crease marks [{ cx, y, hw (half-width) }]
      jointCreases: [
        { cx: 43,  y: 112, hw: 9  }, { cx: 43,  y: 152, hw: 10 }, // Pinky DIP/PIP
        { cx: 83,  y: 93,  hw: 8  }, { cx: 83,  y: 139, hw: 9  }, // Ring DIP/PIP
        { cx: 119, y: 75,  hw: 10 }, { cx: 119, y: 127, hw: 11 }, // Middle DIP/PIP
        { cx: 157, y: 93,  hw: 8  }, { cx: 157, y: 137, hw: 9  }, // Index DIP/PIP
      ],

      yava: { cx: 213, cy: 181 }, // thumb IP joint — rotate −45°
    },

    /* RIGHT palm — back camera: thumb on LEFT — all x = 260 − x_left */
    right: {
      palmPath:
        'M 236 316 ' +
        'C 250 298, 252 272, 248 244 C 244 220, 240 206, 238 200 ' +
        'C 236 196, 230 194, 226 192 ' +
        'C 227 178, 228 148, 228 118 C 227 98, 223 82, 218 76 ' +
        'C 217 72, 212 71, 208 75 C 205 79, 204 104, 205 134 ' +
        'C 206 160, 206 170, 204 181 ' +
        'C 202 191, 198 199, 194 199 C 190 199, 186 191, 184 181 ' +
        'C 186 163, 187 110, 186 76 C 185 58, 179 47, 172 51 ' +
        'C 167 55, 167 110, 169 175 ' +
        'C 169 187, 165 194, 159 194 C 155 194, 151 187, 149 177 ' +
        'C 151 159, 152 98, 151 60 C 149 33, 142 20, 134 28 ' +
        'C 128 36, 129 94, 131 156 C 133 173, 131 183, 127 185 ' +
        'C 125 191, 121 194, 117 190 C 113 187, 111 179, 111 171 ' +
        'C 113 153, 114 104, 111 72 C 109 52, 102 44, 96 55 ' +
        'C 91 67, 91 122, 95 170 ' +
        'L 93 187 C 89 202, 83 210, 76 210 ' +
        'C 66 206, 47 186, 33 168 C 25 154, 17 146, 15 153 ' +
        'C 13 161, 19 169, 29 172 C 41 176, 53 190, 63 202 ' +
        'C 69 215, 73 241, 76 267 C 79 286, 93 303, 111 311 ' +
        'C 141 321, 191 321, 236 316 Z',

      rekhas: {
        bhagya: 'M 152 310 C 150 282, 148 252, 147 224 C 146 206, 144 196, 143 186',
        ayu:    'M 77 210 C 72 226, 68 244, 69 260 C 70 278, 76 294, 87 305 C 98 315, 111 320, 125 320',
        matru:  'M 77 210 C 102 215, 134 220, 166 226 C 190 230, 214 232, 234 236',
        hridaya:'M 212 178 C 194 170, 168 164, 146 162 C 127 161, 111 165, 102 172',
      },

      mounts: {
        guru:    { x: 112, y: 186 },
        shani:   { x: 146, y: 179 },
        surya:   { x: 181, y: 186 },
        budha:   { x: 214, y: 194 },
        shukra:  { x: 68,  y: 252 },
        mangalU: { x: 90,  y: 204 },
        mangalL: { x: 238, y: 230 },
        chandra: { x: 238, y: 268 },
        rahu:    { x: 164, y: 232 },
      },

      jointCreases: [
        { cx: 217, y: 112, hw: 9  }, { cx: 217, y: 152, hw: 10 }, // Pinky DIP/PIP
        { cx: 177, y: 93,  hw: 8  }, { cx: 177, y: 139, hw: 9  }, // Ring DIP/PIP
        { cx: 141, y: 75,  hw: 10 }, { cx: 141, y: 127, hw: 11 }, // Middle DIP/PIP
        { cx: 103, y: 93,  hw: 8  }, { cx: 103, y: 137, hw: 9  }, // Index DIP/PIP
      ],

      yava: { cx: 47, cy: 181 }, // thumb IP joint — rotate +45° (mirrored)
    },
  },
} as const;

/* ═══════════════════════════════════════════════════════════════════════════
   PalmCaptureGuide component — clean hand outline only.
═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  hand: 'left' | 'right';
  status?: 'idle' | 'searching' | 'detected' | 'aligned' | 'capturing' | 'lowlight' | 'error';
}

export function PalmCaptureGuide({ hand: _hand, status: _status = 'idle' }: Props) {
  return (
    <div className="relative w-full h-full select-none" aria-hidden>
      <CornerBracket position="topLeft" />
      <CornerBracket position="topRight" />
      <CornerBracket position="bottomLeft" />
      <CornerBracket position="bottomRight" />
    </div>
  );
}

/* ── Corner bracket ──────────────────────────────────────────────────────── */

function CornerBracket({
  position,
}: {
  position: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
}) {
  const place: Record<typeof position, string> = {
    topLeft:     'top-[12%] left-[3%]',
    topRight:    'top-[12%] right-[3%] rotate-90',
    bottomLeft:  'bottom-[14%] left-[3%] -rotate-90',
    bottomRight: 'bottom-[14%] right-[3%] rotate-180',
  };
  return (
    <svg
      className={`absolute ${place[position]} w-8 h-8 pointer-events-none`}
      viewBox="0 0 32 32"
      fill="none"
      stroke="rgba(229,231,235,0.5)"
      strokeWidth={1.5}
      strokeLinecap="square"
    >
      <path d="M 2 12 L 2 2 L 12 2" />
    </svg>
  );
}
