// jyotish-screens-2.jsx — Onboarding chat, Dashboard

// ─────────────────────────────────────────────────────────────
// 4. ONBOARDING CHAT — Mobile
// ─────────────────────────────────────────────────────────────
const ONBOARDING_STEPS = [
  { q: "What's your full name?", type: 'text', placeholder: 'Aanya Sharma', icon: '✦' },
  { q: "Your date of birth?", type: 'date', placeholder: '14 March 1996', icon: '◌' },
  { q: "What time were you born?", type: 'time', placeholder: '08:22 AM', icon: '◎' },
  { q: "How certain are you about the time?", type: 'choice', options: ['Exact', 'Approximate', 'Unknown'], icon: '◈' },
  { q: "Place of birth?", type: 'location', placeholder: 'Mumbai, Maharashtra', icon: '◉' },
  { q: "Your gender?", type: 'choice', options: ['Male', 'Female', 'Other'], icon: '◑' },
];

function OnboardingMobile({ step = 3 }) {
  const [curStep, setCurStep] = React.useState(step);
  const [loading, setLoading] = React.useState(false);
  const isLast = curStep === ONBOARDING_STEPS.length;
  const cur = ONBOARDING_STEPS[Math.min(curStep - 1, ONBOARDING_STEPS.length - 1)];

  const advance = () => {
    if (curStep < ONBOARDING_STEPS.length) setCurStep(s => s + 1);
    else { setLoading(true); setTimeout(() => setLoading(false), 4000); }
  };

  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* header */}
      <div style={{ padding: '16px 24px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div className="j-display" style={{ fontSize: 13, letterSpacing: '0.2em' }}>JYOTISH</div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{Math.min(curStep, ONBOARDING_STEPS.length)}/{ONBOARDING_STEPS.length}</span>
      </div>

      {/* progress */}
      <div style={{ padding: '0 24px 20px', flexShrink: 0 }}>
        <div style={{ height: 2, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'var(--primary)', width: `${(Math.min(curStep, ONBOARDING_STEPS.length) / ONBOARDING_STEPS.length) * 100}%`, transition: 'width 400ms var(--ease)' }}/>
        </div>
      </div>

      {/* chat area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* yogi baba avatar */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
            ☿
          </div>
          <div style={{ maxWidth: '78%' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5, fontWeight: 600 }}>YOGI BABA</div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px 16px 16px 4px', padding: '12px 16px', fontSize: 15, lineHeight: 1.5 }}>
              {loading ? (
                <WisdomLoader section="onboarding" size="sm"/>
              ) : (
                <StreamingText text={cur.q} speed={40} cursor={!loading}/>
              )}
            </div>
          </div>
        </div>

        {/* previous answers shown as bubbles */}
        {!loading && Array.from({ length: curStep - 1 }, (_, i) => i).slice(-3).map((prevI) => (
          <div key={prevI} style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <div style={{ maxWidth: '70%', background: 'var(--primary)', color: '#fff', borderRadius: '16px 16px 4px 16px', padding: '10px 16px', fontSize: 14, lineHeight: 1.4 }}>
              {ONBOARDING_STEPS[prevI].type === 'choice' ? ONBOARDING_STEPS[prevI].options[0] : ['Aanya Sharma', '14 March 1996', '08:22 AM'][prevI] || '—'}
            </div>
          </div>
        ))}
      </div>

      {/* input area */}
      {!loading && (
        <div style={{ padding: '12px 24px 24px', flexShrink: 0, borderTop: '1px solid var(--border)' }}>
          {cur.type === 'choice' ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {cur.options.map(opt => (
                <button key={opt} onClick={advance} className="j-btn j-btn-secondary" style={{ padding: '10px 18px', borderRadius: 'var(--r-pill)', fontSize: 14 }}>{opt}</button>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input className="j-input" placeholder={cur.placeholder} style={{ flex: 1, padding: '14px 16px', borderRadius: 24 }}/>
              <button onClick={advance} style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--primary)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', flexShrink: 0 }}>
                <Icons.arrow size={16}/>
              </button>
            </div>
          )}
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 8 }}>
            {ONBOARDING_STEPS.map((_, i) => (
              <div key={i} style={{ width: i === curStep - 1 ? 20 : 6, height: 6, borderRadius: 3, background: i < curStep ? 'var(--primary)' : 'var(--border)', transition: 'all 300ms var(--ease)' }}/>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 5. DASHBOARD — Desktop
// ─────────────────────────────────────────────────────────────
function DashboardDesktop() {
  const sidebarItems = [
    { label: 'Today', items: [{ icon: 'home', label: 'Dashboard', active: true }, { icon: 'calendar', label: 'Panchang' }] },
    { label: 'My Chart', items: [{ icon: 'chart', label: 'Birth Chart' }, { icon: 'scroll', label: 'Life Journey' }, { icon: 'arrowDown', label: 'Vargas' }] },
    { label: 'Predictions', items: [{ icon: 'sun', label: 'Horoscope' }, { icon: 'heart', label: 'Couple Match' }, { icon: 'briefcase', label: 'Career Report' }, { icon: 'coin', label: 'Wealth Report' }] },
    { label: 'Tools', items: [{ icon: 'gem', label: 'Gemstone' }, { icon: 'home2', label: 'Vastu' }, { icon: 'star', label: 'Muhurta' }] },
    { label: 'Reports', items: [{ icon: 'reports', label: 'Premium Report' }] },
    { label: 'Account', items: [{ icon: 'user', label: 'Profile' }, { icon: 'settings', label: 'Settings' }] },
  ];

  const insightCards = [
    { label: 'Personality', color: 'var(--primary-soft)', text: 'Leo rising with Saturn in the 10th — a natural authority who earns trust slowly. You feel most alive when working at scale.' },
    { label: 'Career', color: '#E8F4EC', text: 'Jupiter mahadasha favours expansion. The next 18 months are ideal for building something that outlasts the moment.' },
    { label: 'Love', color: '#FCE8E8', text: 'Venus in Libra softens Scorpio\'s intensity. Partnership works when honesty is the foundation, not the exception.' },
    { label: 'Wealth', color: 'var(--accent-soft)', text: 'Dhana yoga active — but slow-building. This is the year to plant, not harvest.' },
  ];

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* sidebar */}
      <div style={{ width: 220, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto', padding: '16px 0' }}>
        <div style={{ padding: '8px 20px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="j-display" style={{ fontSize: 13, letterSpacing: '0.2em' }}>JYOTISH</div>
        </div>
        {sidebarItems.map(({ label, items }) => (
          <div key={label} style={{ marginBottom: 4 }}>
            <div className="j-eyebrow" style={{ padding: '10px 20px 6px', fontSize: 10 }}>{label}</div>
            {items.map(({ icon, label: l, active }) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', fontSize: 13, cursor: 'pointer', background: active ? 'var(--primary-soft)' : 'transparent', color: active ? 'var(--primary-ink)' : 'var(--text-2)', fontWeight: active ? 600 : 400, borderRadius: '0', transition: 'background 150ms' }}>
                {React.createElement(Icons[icon] || Icons.home, { size: 15 })}
                {l}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* main */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
        {/* topbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <div>
            <div className="j-eyebrow">Tuesday, 14 May 2024</div>
            <h1 className="j-display" style={{ fontSize: 32, margin: '4px 0 0' }}>Good morning, Aanya.</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="j-token" style={{ fontSize: 12 }}><TokenGlyph size={12}/> 48</div>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-soft), var(--primary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff' }}>A</div>
          </div>
        </div>

        {/* current dasha hero */}
        <div className="j-card" style={{ padding: '14 32px', marginBottom: 24, background: 'linear-gradient(135deg, #E8F0F4 0%, var(--surface) 100%)', borderColor: 'rgba(122,150,171,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="j-eyebrow" style={{ marginBottom: 8 }}>Current Mahadasha</div>
            <div className="j-display" style={{ fontSize: 40 }}>Jupiter</div>
            <div style={{ fontSize: 15, color: 'var(--text-muted)', marginTop: 6 }}>
              Ends Sep 2029 · 7 years, 2 months remaining
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
              <span style={{ fontSize: 13, background: 'var(--primary-soft)', color: 'var(--primary-ink)', padding: '4px 12px', borderRadius: 999, fontWeight: 600 }}>Antardasha: Saturn</span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Begins expansion through structure</span>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <NorthIndianChart size={180} ascendant="Le" planets={{ 1: ['Su'], 4: ['Mo','Ma'], 7: 'Ve', 10: ['Ju','Me'], 11: 'Sa', 5: 'Ra', 12: 'Ke' }}/>
          </div>
        </div>

        {/* AI insight cards */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
            <div>
              <div className="j-eyebrow">Ai Insights</div>
              <h2 className="j-display" style={{ fontSize: 22, margin: '4px 0 0' }}>Your current sky</h2>
            </div>
            <button className="j-btn j-btn-ghost" style={{ fontSize: 13 }}>See all <Icons.arrow size={13}/></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {insightCards.map(({ label, color, text }) => (
              <div key={label} className="j-card" style={{ padding: 20, cursor: 'pointer' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: color, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {label === 'Love' ? <Icons.heart size={14}/> : label === 'Career' ? <Icons.briefcase size={14}/> : label === 'Wealth' ? <Icons.coin size={14}/> : <Icons.sun size={14}/>}
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55 }}>{text.slice(0, 80)}…</div>
              </div>
            ))}
          </div>
        </div>

        {/* bottom row: today transits + quick tools */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
          <div className="j-card" style={{ padding: 24 }}>
            <div className="j-eyebrow" style={{ marginBottom: 12 }}>Today's Transit Highlights</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[['Moon → Virgo', 'Exact 14:22 · Analytical, grounding', 'Mo'],['Mars conjunct Ketu', 'Karmic action · Handle with care', 'Ma'],['Venus trine Jupiter', 'Social ease, creative luck', 'Ve']].map(([t, d, p]) => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 10 }}>
                  <span className="j-mono" style={{ fontSize: 11, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--primary-soft)', color: 'var(--primary-ink)', borderRadius: 6, flexShrink: 0, fontWeight: 700 }}>{p}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{t}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="j-card" style={{ padding: 24 }}>
            <div className="j-eyebrow" style={{ marginBottom: 12 }}>Quick Tools</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[['Chat with Yogi Baba', 'chat'], ['Daily Panchang', 'calendar'], ['Muhurta Finder', 'star'], ['Couple Match', 'heart']].map(([l, ic]) => (
                <div key={l} className="j-card" style={{ padding: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, fontWeight: 500 }}>
                  {React.createElement(Icons[ic] || Icons.home, { size: 14, style: { color: 'var(--primary)' } })}
                  {l}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 5b. DASHBOARD — Mobile
// ─────────────────────────────────────────────────────────────
function DashboardMobile() {
  const features = [
    { icon: 'sun', label: 'Horoscope', bg: '#FFF9EC' },
    { icon: 'chart', label: 'Birth Chart', bg: 'var(--primary-soft)' },
    { icon: 'heart', label: 'Couple', bg: '#FCE8E8' },
    { icon: 'briefcase', label: 'Career', bg: '#E8F4EC' },
    { icon: 'coin', label: 'Wealth', bg: 'var(--accent-soft)' },
    { icon: 'home2', label: 'Vastu', bg: '#EEF8F0' },
    { icon: 'gem', label: 'Gemstone', bg: '#F0ECFC' },
    { icon: 'scroll', label: 'Reports', bg: 'var(--surface-2)' },
  ];

  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* greeting */}
        <div style={{ padding: '16px 22px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="j-display" style={{ fontSize: 22 }}>Good morning,</div>
            <div className="j-display" style={{ fontSize: 22, color: 'var(--primary)', fontStyle: 'italic' }}>Aanya.</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="j-token" style={{ fontSize: 11 }}><TokenGlyph size={11}/> 48</div>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-soft), var(--primary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>A</div>
          </div>
        </div>

        {/* dasha card */}
        <div style={{ margin: '0 16px 20px', padding: '20px', background: 'linear-gradient(135deg, #E8F0F4 0%, #fff 100%)', border: '1px solid rgba(122,150,171,0.2)', borderRadius: 'var(--r-lg)' }}>
          <div className="j-eyebrow" style={{ marginBottom: 6, fontSize: 10 }}>Mahadasha · Jupiter</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5, maxWidth: 200 }}>
                Expansion through structure. Build slowly, build once.
              </div>
              <div style={{ marginTop: 10 }}>
                <span style={{ fontSize: 11, background: 'var(--primary-soft)', color: 'var(--primary-ink)', padding: '3px 10px', borderRadius: 999, fontWeight: 600 }}>Ends Sep 2029</span>
              </div>
            </div>
            <NorthIndianChart size={90} ascendant="Le" planets={{ 1: 'Su', 4: 'Mo', 10: 'Ju' }}/>
          </div>
        </div>

        {/* today */}
        <div style={{ padding: '0 16px', marginBottom: 16 }}>
          <div className="j-eyebrow" style={{ marginBottom: 10, fontSize: 10 }}>Today · 14 May</div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '14px 16px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, fontStyle: 'italic' }}>
            "Moon enters Virgo at 14:22. Ideal for analysis, sorting and practical decisions — avoid emotional confrontation."
          </div>
        </div>

        {/* feature grid */}
        <div style={{ padding: '0 16px', marginBottom: 24 }}>
          <div className="j-eyebrow" style={{ marginBottom: 10, fontSize: 10 }}>Tools</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {features.map(({ icon, label, bg }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: bg, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {React.createElement(Icons[icon] || Icons.home, { size: 20, style: { color: 'var(--text-2)' } })}
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-2)', textAlign: 'center' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AI loader inline */}
        <div style={{ margin: '0 16px 24px', padding: '16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
          <div className="j-eyebrow" style={{ marginBottom: 10, fontSize: 10 }}>Insights loading</div>
          <WisdomLoader section="dashboard" size="sm"/>
        </div>
      </div>

      {/* bottom tab bar */}
      <div style={{ height: 68, background: 'var(--surface)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', flexShrink: 0, position: 'relative' }}>
        {[{ icon: 'home', label: 'Home', active: true }, { icon: 'chart', label: 'Chart' }, { icon: 'chat', label: 'Chat' }, { icon: 'reports', label: 'Reports' }, { icon: 'more', label: 'More' }].map(({ icon, label, active }) => (
          <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', color: active ? 'var(--primary)' : 'var(--text-muted)' }}>
            {React.createElement(Icons[icon] || Icons.home, { size: 22 })}
            <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
          </div>
        ))}
        {/* floating ask btn */}
        <div style={{ position: 'absolute', top: -24, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
          <button style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(122,150,171,0.35)' }}>
            <Icons.yogi size={20}/>
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { OnboardingMobile, DashboardDesktop, DashboardMobile });
