// jyotish-components.jsx — shared component library
// Loaded as Babel; exports to window.

// ─────────────────────────────────────────────────────────────
// WISDOM BANK — section-relevant astrological microcopy
// ─────────────────────────────────────────────────────────────
const WISDOM_BANK = {
  onboarding: [
    "Aligning the planets at your moment of birth…",
    "Reading what the sky was saying when you arrived…",
    "Your nakshatra is being mapped…",
    "Locating the ascendant of this lifetime.",
  ],
  dashboard: [
    "Saturn rewards patience — your insights are arriving.",
    "The cosmos doesn't rush. Neither do we.",
    "Today's planetary weather is forming.",
  ],
  kundli: [
    "Drawing your rashi chart — the blueprint of your soul.",
    "Placing 9 planets across 12 houses.",
    "The lagna is being computed to the second.",
  ],
  dasha: [
    "Tracing the river of your life — Vimshottari at work.",
    "Mapping 120 years of cosmic rhythm.",
  ],
  career: [
    "Mercury is reviewing your tenth house…",
    "Your karmic profession is being decoded.",
  ],
  marriage: [
    "Comparing two skies — guna milan in progress.",
    "Venus is matching frequencies.",
  ],
  health: ["The Sun governs vitality — checking its strength in your chart."],
  wealth: [
    "Jupiter expands fortune — measuring its placement.",
    "Reading your dhana yogas.",
  ],
  vastu: [
    "Vastu Purusha is being mapped onto your space.",
    "Aligning the eight directions — Ishanya to Nairutya.",
    "Brahmasthan is the heart of every home.",
  ],
  gemstone: ["Matching crystal frequencies to your planets."],
  muhurta: ["Searching auspicious windows in time…"],
  tarot: ["Shuffling the cards — the deck listens to your question."],
  palm: ["Tracing your life-line, heart-line and head-line."],
  dreams: ["Symbols travel between worlds — decoding yours."],
  panchang: ["Reading today's tithi, vara, nakshatra, yoga and karana."],
  chat: [
    "Yogi Baba is consulting the shastras…",
    "An ancient mind is forming a modern answer.",
  ],
  report: [
    "Hand-writing your 40-page cosmic biography…",
    "Stitching together 7 chapters of your life.",
  ],
  horoscope: ["Today's planetary weather is forming…"],
  karma: ["Tracing past-life imprints in your chart."],
  prashna: ["The moment you asked is itself the answer — analysing now."],
};

// ─────────────────────────────────────────────────────────────
// WisdomLoader — the brand differentiator
// ─────────────────────────────────────────────────────────────
function WisdomLoader({ section = 'dashboard', size = 'md', progress, paused = false, dotColor }) {
  const lines = WISDOM_BANK[section] || WISDOM_BANK.dashboard;
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % lines.length), 2800);
    return () => clearInterval(t);
  }, [paused, lines.length]);

  const sz = {
    sm: { font: 12, gap: 8, dot: 5 },
    md: { font: 14, gap: 10, dot: 6 },
    lg: { font: 17, gap: 14, dot: 8 },
  }[size];

  const dotC = dotColor || 'var(--primary)';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: sz.gap, color: 'var(--text-muted)' }}>
      <span style={{
        width: sz.dot, height: sz.dot, borderRadius: '50%',
        background: dotC,
        animation: 'j-pulse 1.6s ease-in-out infinite',
        flexShrink: 0,
      }} />
      <span key={i} style={{
        fontFamily: 'var(--font-body)',
        fontStyle: 'italic',
        fontSize: sz.font,
        lineHeight: 1.4,
        animation: 'j-fade 2.8s ease-in-out infinite',
      }}>{lines[i]}</span>
      {typeof progress === 'number' && (
        <span style={{
          marginLeft: 8, height: 1, width: 60,
          background: 'var(--border)', position: 'relative', overflow: 'hidden',
        }}>
          <span style={{
            position: 'absolute', inset: 0,
            background: dotC, width: `${progress}%`,
            transition: 'width 600ms var(--ease)',
          }} />
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Icons — minimal hairline strokes
// ─────────────────────────────────────────────────────────────
const I = ({ d, size = 18, sw = 1.5, fill = 'none' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {typeof d === 'string' ? <path d={d}/> : d}
  </svg>
);
const Icons = {
  home: (p) => <I {...p} d="M3 11l9-8 9 8M5 9v11h5v-7h4v7h5V9"/>,
  chart: (p) => <I {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6l12.8 12.8M5.6 18.4l12.8-12.8"/></>}/>,
  chat: (p) => <I {...p} d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>,
  reports: (p) => <I {...p} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 13h6M9 17h6"/>,
  more: (p) => <I {...p} d={<><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></>} sw={2}/>,
  yogi: (p) => <I {...p} d={<><path d="M12 2C9 2 7 4 7 7c0 2 1 3.5 2.5 4.5L9 14l-4 1c-2 .5-3 2-3 4v3h20v-3c0-2-1-3.5-3-4l-4-1-.5-2.5C16 10.5 17 9 17 7c0-3-2-5-5-5z"/></>}/>,
  bell: (p) => <I {...p} d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"/>,
  star: (p) => <I {...p} d="M12 2l2.6 6.5L21 9l-5 4.5L17.5 21 12 17.5 6.5 21 8 13.5 3 9l6.4-.5z"/>,
  sun: (p) => <I {...p} d={<><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>}/>,
  moon: (p) => <I {...p} d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>,
  heart: (p) => <I {...p} d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 000-7.8z"/>,
  briefcase: (p) => <I {...p} d={<><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></>}/>,
  coin: (p) => <I {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5C9 8.1 10.3 7 12 7s3 1.1 3 2.5S13.7 12 12 12s-3 1.1-3 2.5S10.3 17 12 17s3-1.1 3-2.5"/></>}/>,
  gem: (p) => <I {...p} d="M6 3h12l4 6-10 12L2 9z M2 9h20 M11 3l-3 6 4 12 4-12-3-6"/>,
  home2: (p) => <I {...p} d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1z"/>,
  scroll: (p) => <I {...p} d="M8 3h12a2 2 0 012 2v3H8V5a2 2 0 00-2-2zm0 0a2 2 0 012 2v14a2 2 0 002 2H6a2 2 0 01-2-2v-2h6"/>,
  search: (p) => <I {...p} d={<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/></>}/>,
  plus: (p) => <I {...p} d="M12 5v14M5 12h14"/>,
  arrow: (p) => <I {...p} d="M5 12h14M13 6l6 6-6 6"/>,
  arrowL: (p) => <I {...p} d="M19 12H5M11 18l-6-6 6-6"/>,
  arrowDown: (p) => <I {...p} d="M6 9l6 6 6-6"/>,
  check: (p) => <I {...p} d="M5 12l5 5L20 7"/>,
  x: (p) => <I {...p} d="M6 6l12 12M18 6L6 18"/>,
  send: (p) => <I {...p} d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>,
  mic: (p) => <I {...p} d={<><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></>}/>,
  user: (p) => <I {...p} d={<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></>}/>,
  settings: (p) => <I {...p} d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></>}/>,
  calendar: (p) => <I {...p} d={<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>}/>,
  pause: (p) => <I {...p} d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/>,
  play: (p) => <I {...p} d="M6 4l14 8L6 20z" fill="currentColor"/>,
};

// ─────────────────────────────────────────────────────────────
// North Indian Kundli (SVG)
// Diamond chart with 12 houses; planets shown as 2-letter abbreviations
// ─────────────────────────────────────────────────────────────
function NorthIndianChart({ planets = {}, size = 280, ascendant = 'Ar' }) {
  // Standard north-Indian layout: house 1 = top diamond
  // Planet positions are approximate centers for each house cell
  const w = size, h = size;
  const m = 2;
  const stroke = 'currentColor';
  const planetPos = {
    1:  { x: w/2, y: h*0.18 },
    2:  { x: w*0.22, y: h*0.10 },
    3:  { x: w*0.10, y: h*0.22 },
    4:  { x: w*0.20, y: h*0.5 },
    5:  { x: w*0.10, y: h*0.78 },
    6:  { x: w*0.22, y: h*0.90 },
    7:  { x: w/2, y: h*0.82 },
    8:  { x: w*0.78, y: h*0.90 },
    9:  { x: w*0.90, y: h*0.78 },
    10: { x: w*0.80, y: h*0.5 },
    11: { x: w*0.90, y: h*0.22 },
    12: { x: w*0.78, y: h*0.10 },
  };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ color: 'var(--text-2)' }}>
      <rect x={m} y={m} width={w-2*m} height={h-2*m} fill="none" stroke={stroke} strokeWidth="1"/>
      <line x1={m} y1={m} x2={w-m} y2={h-m} stroke={stroke} strokeWidth="0.7"/>
      <line x1={w-m} y1={m} x2={m} y2={h-m} stroke={stroke} strokeWidth="0.7"/>
      <polygon points={`${w/2},${m} ${w-m},${h/2} ${w/2},${h-m} ${m},${h/2}`} fill="none" stroke={stroke} strokeWidth="0.7"/>
      {/* house numbers */}
      {Object.entries(planetPos).map(([n, p]) => (
        <text key={'n'+n} x={p.x} y={p.y - 14} textAnchor="middle"
          fontFamily="var(--font-mono)" fontSize="9" fill="var(--text-dim)" opacity="0.7">{n}</text>
      ))}
      {/* planets */}
      {Object.entries(planets).map(([house, names]) => {
        const p = planetPos[+house];
        if (!p) return null;
        const arr = Array.isArray(names) ? names : [names];
        return arr.map((nm, idx) => (
          <text key={house+'-'+idx} x={p.x} y={p.y + idx * 14}
            textAnchor="middle" fontFamily="var(--font-mono)" fontSize="11"
            fontWeight="500" fill="var(--text)">{nm}</text>
        ));
      })}
      {/* ascendant marker */}
      <text x={w/2} y={h*0.05} textAnchor="middle"
        fontFamily="var(--font-mono)" fontSize="10" fill="var(--primary)" fontWeight="600">
        Asc · {ascendant}
      </text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Tiny constellation accent
// ─────────────────────────────────────────────────────────────
function Constellation({ width = 140, height = 80, opacity = 0.4 }) {
  const pts = [
    [10, 60], [40, 30], [70, 50], [90, 20], [120, 40], [130, 70],
  ];
  return (
    <svg width={width} height={height} viewBox="0 0 140 80" style={{ opacity, color: 'var(--primary)' }}>
      <polyline points={pts.map(p => p.join(',')).join(' ')}
        fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 3"/>
      {pts.map(([x,y], i) => (
        <circle key={i} cx={x} cy={y} r={i === 1 || i === 4 ? 2.5 : 1.5} fill="currentColor"/>
      ))}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Token glyph ⟁
// ─────────────────────────────────────────────────────────────
function TokenGlyph({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" style={{ display: 'inline-block', verticalAlign: '-1px' }}>
      <polygon points="6,1 11,10 1,10" fill="none" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="6" cy="7.2" r="1.1" fill="currentColor"/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Streaming text — characters fade in word-by-word
// ─────────────────────────────────────────────────────────────
function StreamingText({ text, speed = 35, cursor = true, onDone }) {
  const [shown, setShown] = React.useState(0);
  React.useEffect(() => {
    if (shown >= text.length) { onDone && onDone(); return; }
    const t = setTimeout(() => setShown((s) => s + 1), speed);
    return () => clearTimeout(t);
  }, [shown, text]);
  return (
    <span>
      {text.slice(0, shown)}
      {cursor && shown < text.length && (
        <span style={{
          display: 'inline-block', width: 2, height: '1em',
          background: 'var(--primary)', verticalAlign: '-2px', marginLeft: 2,
          animation: 'j-cursor 1s steps(1) infinite',
        }}/>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Frame primitives — phone & desktop "screens" that look real
// ─────────────────────────────────────────────────────────────
function PhoneFrame({ children, statusBar = true, label }) {
  return (
    <div style={{
      width: 380, height: 780, background: 'var(--bg)',
      borderRadius: 44, border: '8px solid #8A9EAC',
      boxShadow: '0 30px 60px rgba(60,80,100,0.14), 0 4px 12px rgba(60,80,100,0.06)',
      overflow: 'hidden', position: 'relative',
      fontFamily: 'var(--font-body)',
    }}>
      {/* notch */}
      <div style={{
        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
        width: 110, height: 28, background: '#8A9EAC', borderRadius: 14, zIndex: 30,
      }}/>
      {statusBar && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 14 0', fontSize: 14, fontWeight: 600, zIndex: 25,
          color: 'var(--text-muted)',
        }}>
          <span>9:41</span>
          <span style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11 }}>
            <span>•••</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>5G</span>
            <span style={{
              display: 'inline-block', width: 22, height: 11, border: '1px solid currentColor',
              borderRadius: 3, position: 'relative',
            }}>
              <span style={{ position: 'absolute', inset: 1, background: 'currentColor', width: '70%' }}/>
            </span>
          </span>
        </div>
      )}
      <div style={{ position: 'absolute', inset: 0, paddingTop: 50, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function DesktopFrame({ children, width = 1280, height = 820, url = 'app.jyotish.ai/dashboard' }) {
  return (
    <div style={{
      width, height, background: 'var(--bg)',
      borderRadius: 12, border: '1px solid var(--border-strong)',
      boxShadow: '0 20px 50px rgba(60,80,100,0.10), 0 4px 12px rgba(60,80,100,0.04)',
      overflow: 'hidden', fontFamily: 'var(--font-body)',
    }}>
      <div style={{
        height: 36, background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['#F5A8B0','#F5CFA0','#A8D4C0'].map(c => (
            <span key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c }}/>
          ))}
        </div>
        <div style={{
          marginLeft: 24, padding: '4px 14px', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 6, fontSize: 12,
          color: 'var(--text-muted)', flex: 1, maxWidth: 360,
          fontFamily: 'var(--font-mono)',
        }}>{url}</div>
      </div>
      <div style={{ height: height - 36, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

Object.assign(window, {
  WisdomLoader, WISDOM_BANK,
  Icons, NorthIndianChart, Constellation, TokenGlyph, StreamingText,
  PhoneFrame, DesktopFrame,
});
