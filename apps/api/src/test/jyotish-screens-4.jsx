// jyotish-screens-4.jsx — Couple Match, Vastu, Gemstone, Buy Tokens, Profile, Premium Report

// ─────────────────────────────────────────────────────────────
// 9. COUPLE MATCH — Desktop
// ─────────────────────────────────────────────────────────────
function CoupleMatchDesktop() {
  const gunas = [
    { name: 'Varna', score: 1, max: 1 }, { name: 'Vasya', score: 2, max: 2 },
    { name: 'Tara', score: 3, max: 3 }, { name: 'Yoni', score: 3, max: 4 },
    { name: 'Graha Maitri', score: 4, max: 5 }, { name: 'Gana', score: 5, max: 6 },
    { name: 'Bhakoot', score: 7, max: 7 }, { name: 'Nadi', score: 8, max: 8 },
  ];
  const total = gunas.reduce((a, g) => a + g.score, 0);
  const maxTotal = gunas.reduce((a, g) => a + g.max, 0);

  return (
    <div style={{ height: '100%', background: 'var(--bg)', overflowY: 'auto', padding: '40px 56px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="j-eyebrow" style={{ marginBottom: 8 }}>Compatibility · Guna Milan</div>
        <h1 className="j-display" style={{ fontSize: 42, margin: '0 0 32px', lineHeight: 1.1 }}>
          Two skies, compared.
        </h1>

        {/* two chart cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 1fr', gap: 0, alignItems: 'center', marginBottom: 40 }}>
          <div className="j-card" style={{ padding: 28, textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: 'var(--primary-ink)', margin: '0 auto 14px' }}>A</div>
            <div className="j-display" style={{ fontSize: 22, marginBottom: 4 }}>Aanya Sharma</div>
            <div className="j-mono" style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>14 Mar 1996 · Leo Asc · Scorpio Moon</div>
            <NorthIndianChart size={160} ascendant="Le" planets={{ 1: 'Su', 4: ['Mo','Ma'], 7: 'Sa', 10: 'Ju' }}/>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 20 }}>
            <div style={{ fontSize: 28 }}>♥</div>
            <div className="j-mono" style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 700 }}>{total}/{maxTotal}</div>
          </div>

          <div className="j-card" style={{ padding: 28, textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: 'var(--accent)', margin: '0 auto 14px' }}>R</div>
            <div className="j-display" style={{ fontSize: 22, marginBottom: 4 }}>Rajan Mehta</div>
            <div className="j-mono" style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>22 Aug 1993 · Aries Asc · Aries Moon</div>
            <NorthIndianChart size={160} ascendant="Ar" planets={{ 1: 'Ma', 5: ['Su','Me'], 9: 'Ju', 11: 'Ve' }}/>
          </div>
        </div>

        {/* score summary */}
        <div className="j-card" style={{ padding: 28, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <div className="j-eyebrow" style={{ marginBottom: 4 }}>Ashta Koota Score</div>
              <div className="j-display" style={{ fontSize: 42, color: 'var(--primary)' }}>{total} <span style={{ fontSize: 20, color: 'var(--text-muted)' }}>/ {maxTotal}</span></div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="j-premium"><Icons.star size={11}/> Good Match</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Above 18 is auspicious. Above 24 is excellent.</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {gunas.map(g => (
              <div key={g.name} style={{ padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{g.name}</div>
                <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', marginBottom: 5 }}>
                  <div style={{ height: '100%', background: g.score === g.max ? 'var(--success)' : g.score > g.max * 0.5 ? 'var(--primary)' : 'var(--accent)', width: `${(g.score / g.max) * 100}%`, borderRadius: 2 }}/>
                </div>
                <div className="j-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{g.score}/{g.max}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AI narration */}
        <div className="j-card" style={{ padding: 28, background: 'linear-gradient(135deg, #E8F0F4 0%, #fff 100%)', borderColor: 'rgba(122,150,171,0.18)' }}>
          <div className="j-eyebrow" style={{ color: 'var(--primary)', marginBottom: 12 }}>Yogi Baba's Reading</div>
          <p style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--text-2)', margin: '0 0 20px', fontStyle: 'italic' }}>
            "A Leo-Aries pairing — two fire signs meeting. The Nadi score is a full 8, suggesting real compatibility at the elemental level. Bhakoot and Tara are strong. Where you'll need patience is Yoni (3/4) — your emotional rhythms differ. This is solvable with awareness, not a blocker."
          </p>
          <button className="j-btn j-btn-primary" style={{ fontSize: 13 }}>Full compatibility report <span className="j-token" style={{ marginLeft: 6 }}><TokenGlyph size={10}/> 4</span></button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 10. VASTU — Mobile
// ─────────────────────────────────────────────────────────────
function VastuMobile() {
  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <Icons.arrowL size={20} style={{ color: 'var(--text-2)' }}/>
        <div style={{ flex: 1 }}>
          <div className="j-eyebrow" style={{ fontSize: 10 }}>Vastu Shastra</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Home Analysis</div>
        </div>
        <span className="j-premium"><Icons.star size={11}/> Pro</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
        {/* compass rose SVG */}
        <div className="j-card" style={{ padding: 28, marginBottom: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div className="j-eyebrow" style={{ alignSelf: 'flex-start', fontSize: 10 }}>Floor plan · Brahmasthan mapping</div>
          <svg width={220} height={220} viewBox="0 0 220 220" style={{ color: 'var(--text-2)' }}>
            {/* outer square */}
            <rect x={10} y={10} width={200} height={200} fill="none" stroke="currentColor" strokeWidth="1"/>
            {/* 3x3 vastu grid */}
            {[76, 143].map(v => (
              <React.Fragment key={v}>
                <line x1={v} y1={10} x2={v} y2={210} stroke="currentColor" strokeWidth="0.7" strokeDasharray="3 3"/>
                <line x1={10} y1={v} x2={210} y2={v} stroke="currentColor" strokeWidth="0.7" strokeDasharray="3 3"/>
              </React.Fragment>
            ))}
            {/* Brahmasthan center */}
            <circle cx={110} cy={110} r={30} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.5"/>
            <text x={110} y={106} textAnchor="middle" fontSize="9" fill="var(--accent)" fontFamily="var(--font-mono)" fontWeight="700">BRAHMA</text>
            <text x={110} y={119} textAnchor="middle" fontSize="9" fill="var(--accent)" fontFamily="var(--font-mono)">STHAN</text>
            {/* directions */}
            {[['N',110,20],['S',110,205],['E',205,110],['W',15,110],['NE',20,20],['SE',200,20],['SW',20,200],['NW',200,200]].map(([d,x,y]) => (
              <text key={d} x={x} y={y} textAnchor="middle" fontSize="10" fill="var(--text-muted)" fontFamily="var(--font-mono)" fontWeight="600">{d}</text>
            ))}
            {/* zone labels */}
            {[['Ishanya',110,45],['Agni',178,45],['Yama',178,178],['Nairutya',40,178],['Vayu',40,45]].map(([l,x,y]) => (
              <text key={l} x={x} y={y} textAnchor="middle" fontSize="8" fill="var(--text-dim)" fontFamily="var(--font-body)">{l}</text>
            ))}
          </svg>

          <div style={{ width: '100%', padding: '12px 16px', background: 'var(--surface-2)', borderRadius: 10, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
            Upload your floor plan or describe room layout to begin.
          </div>
          <button className="j-btn j-btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
            <Icons.plus size={14}/> Upload floor plan
          </button>
        </div>

        {/* wisdom loader */}
        <div style={{ padding: '16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', marginBottom: 20 }}>
          <WisdomLoader section="vastu" size="sm"/>
        </div>

        {/* quick tips */}
        <div className="j-eyebrow" style={{ marginBottom: 10, fontSize: 10 }}>Vastu Principles</div>
        {[['North-East · Ishanya', 'Meditation, prayer, water elements. Keep clear.'],['South-West · Nairutya', 'Master bedroom, stability, earth element.'],['Brahmasthan · Centre', 'Leave open. No heavy furniture or pillars.']].map(([k, v]) => (
          <div key={k} style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', marginBottom: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{k}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 11. GEMSTONE — Mobile
// ─────────────────────────────────────────────────────────────
const GEMS = [
  { name: 'Blue Sapphire', planet: 'Saturn', color: '#3F5BC2', soft: '#E8EDFC', fit: 98, note: 'Saturn is strong in your 10th. Blue Sapphire amplifies discipline, career, and resilience. Wear on right middle finger, Saturday.' },
  { name: 'Yellow Sapphire', planet: 'Jupiter', color: '#B8893F', soft: 'var(--accent-soft)', fit: 82, note: 'Jupiter Mahadasha active. Pukhraj strengthens wisdom, fortune, and growth during this expansive period.' },
  { name: 'Emerald', planet: 'Mercury', color: '#2D8C5A', soft: 'var(--success-soft)', fit: 71, note: 'Mercury is exalted in your 2nd house. Panna enhances communication, intellect, and financial acumen.' },
];

function GemstoneMobile() {
  const [active, setActive] = React.useState(0);
  const gem = GEMS[active];

  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <Icons.arrowL size={20}/>
        <div>
          <div className="j-eyebrow" style={{ fontSize: 10 }}>Gemstone Recommendation</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Your Ratnas</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
        {/* gem selector */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, overflowX: 'auto', paddingBottom: 4 }}>
          {GEMS.map((g, i) => (
            <button key={g.name} onClick={() => setActive(i)} style={{ flexShrink: 0, padding: '10px 16px', background: i === active ? g.soft : 'var(--surface)', border: `1px solid ${i === active ? g.color + '40' : 'var(--border)'}`, borderRadius: 'var(--r-pill)', fontFamily: 'var(--font-body)', cursor: 'pointer', fontSize: 13, fontWeight: i === active ? 700 : 400, color: i === active ? g.color : 'var(--text-2)' }}>
              {g.name}
            </button>
          ))}
        </div>

        {/* gem hero */}
        <div className="j-card" style={{ padding: 28, marginBottom: 20, background: gem.soft, borderColor: gem.color + '30', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          {/* gem SVG illustration */}
          <svg width={100} height={100} viewBox="0 0 100 100">
            <polygon points="50,10 85,35 85,65 50,90 15,65 15,35" fill={gem.color + '22'} stroke={gem.color} strokeWidth="1.5"/>
            <polygon points="50,10 85,35 50,50" fill={gem.color + '44'} stroke={gem.color} strokeWidth="0.8"/>
            <polygon points="50,10 15,35 50,50" fill={gem.color + '33'} stroke={gem.color} strokeWidth="0.8"/>
            <polygon points="15,35 85,35 50,50" fill={gem.color + '55'} stroke={gem.color} strokeWidth="0.8"/>
            <polygon points="15,35 15,65 50,50" fill={gem.color + '44'} stroke={gem.color} strokeWidth="0.8"/>
            <polygon points="85,35 85,65 50,50" fill={gem.color + '33'} stroke={gem.color} strokeWidth="0.8"/>
          </svg>

          <div style={{ textAlign: 'center' }}>
            <div className="j-display" style={{ fontSize: 26, marginBottom: 4 }}>{gem.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Rules {gem.planet} · {gem.fit}% compatibility</div>
          </div>

          <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: gem.color, width: `${gem.fit}%`, borderRadius: 3, transition: 'width 500ms var(--ease)' }}/>
          </div>
        </div>

        <div className="j-card" style={{ padding: 20, marginBottom: 20 }}>
          <div className="j-eyebrow" style={{ marginBottom: 8, fontSize: 10 }}>Why this stone?</div>
          <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--text-2)', margin: 0 }}>{gem.note}</p>
        </div>

        <WisdomLoader section="gemstone" size="sm"/>

        <div style={{ marginTop: 24 }}>
          <button className="j-btn j-btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px' }}>
            Get certified stone recommendation <span className="j-premium" style={{ marginLeft: 8 }}><Icons.star size={10}/>Pro</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 12. BUY TOKENS — Mobile
// ─────────────────────────────────────────────────────────────
const PLANS = [
  { name: 'Starter', tokens: 10, price: '₹99', note: 'For a quick reading', popular: false },
  { name: 'Explorer', tokens: 50, price: '₹299', note: 'Most popular · 6x value', popular: true },
  { name: 'Seeker', tokens: 150, price: '₹699', note: 'Deep dive into all reports', popular: false },
  { name: 'Yogi', tokens: 500, price: '₹1,799', note: 'Unlimited readings for a year', popular: false },
];

function BuyTokensMobile() {
  const [selected, setSelected] = React.useState(1);

  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <Icons.arrowL size={20}/>
        <div>
          <div className="j-eyebrow" style={{ fontSize: 10 }}>Credits</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Buy Tokens</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <div className="j-token"><TokenGlyph size={11}/> 48</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
        <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 24 }}>
          Each token unlocks one reading, chart feature, or message to Yogi Baba.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
          {PLANS.map((p, i) => (
            <div key={p.name} onClick={() => setSelected(i)} style={{ padding: '18px 20px', background: i === selected ? 'linear-gradient(135deg, #E8F0F4 0%, var(--surface) 100%)' : 'var(--surface)', border: `1.5px solid ${i === selected ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 'var(--r-lg)', cursor: 'pointer', position: 'relative', transition: 'all 200ms' }}>
              {p.popular && <div style={{ position: 'absolute', top: -10, right: 16, background: 'var(--primary)', color: '#fff', fontSize: 11, padding: '2px 10px', borderRadius: 999, fontWeight: 700 }}>Popular</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 3 }}>{p.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span className="j-mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{p.tokens}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>tokens</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.note}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="j-display" style={{ fontSize: 22, color: i === selected ? 'var(--primary)' : 'var(--text)' }}>{p.price}</div>
                  {i === selected && <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto', marginTop: 6 }}><Icons.check size={12} style={{ color: '#fff' }}/></div>}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <input className="j-input" placeholder="Coupon code" style={{ borderRadius: 12 }}/>
        </div>

        <button className="j-btn j-btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '15px', fontSize: 15, borderRadius: 'var(--r-lg)' }}>
          Pay {PLANS[selected].price} via Razorpay
        </button>
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          Secure payment · Instant delivery · No subscription
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 13. PROFILE / SETTINGS — Mobile
// ─────────────────────────────────────────────────────────────
function ProfileMobile() {
  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Profile</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
        {/* avatar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div style={{ width: 76, height: 76, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-soft), var(--primary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700, color: '#fff' }}>A</div>
          <div className="j-display" style={{ fontSize: 24 }}>Aanya Sharma</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>aanya@gmail.com</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="j-token"><TokenGlyph size={11}/> 48 tokens</div>
            <span className="j-premium"><Icons.star size={11}/> Premium</span>
          </div>
        </div>

        {/* chart summary */}
        <div className="j-card" style={{ padding: 20, marginBottom: 20 }}>
          <div className="j-eyebrow" style={{ marginBottom: 12, fontSize: 10 }}>Birth Details</div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <NorthIndianChart size={90} ascendant="Le" planets={{ 1: 'Su', 4: 'Mo', 7: 'Sa', 10: 'Ju' }}/>
            <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div><span style={{ color: 'var(--text-muted)' }}>Born</span> 14 Mar 1996, 08:22</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Place</span> Mumbai, MH</div>
              <div><span style={{ color: 'var(--text-muted)' }}>Asc</span> <span className="j-mono">Leo 23°14′</span></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Moon</span> <span className="j-mono">Scorpio 09°02′</span></div>
              <div><span style={{ color: 'var(--text-muted)' }}>Nakshatra</span> Anuradha</div>
            </div>
          </div>
        </div>

        {/* settings sections */}
        {[{ section: 'Preferences', items: ['Language · English', 'Notification settings', 'Ayanamsa · Lahiri'] },
          { section: 'Account', items: ['Saved charts', 'Purchase history', 'Refer a friend · ₹50/referral'] },
          { section: 'More', items: ['About Jyotish AI', 'Privacy policy', 'Sign out'] }
        ].map(({ section, items }) => (
          <div key={section} style={{ marginBottom: 20 }}>
            <div className="j-eyebrow" style={{ marginBottom: 8, fontSize: 10 }}>{section}</div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
              {items.map((item, i) => (
                <div key={item} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderTop: i > 0 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}>
                  <span style={{ fontSize: 14 }}>{item}</span>
                  <Icons.arrowDown size={16} style={{ transform: 'rotate(-90deg)', color: 'var(--text-muted)' }}/>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 14. PREMIUM REPORT — Long scroll, Desktop
// ─────────────────────────────────────────────────────────────
const CHAPTERS = ['Life Overview', 'Personality & Soul', 'Career & Purpose', 'Relationships', 'Wealth & Fortune', 'Health & Vitality', 'Year Ahead 2025'];

function PremiumReportDesktop() {
  const [activeChapter, setActiveChapter] = React.useState(0);
  const [loading, setLoading] = React.useState(false);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* TOC sidebar */}
      <div style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '24px 0' }}>
        <div style={{ padding: '0 20px 20px' }}>
          <div className="j-eyebrow" style={{ marginBottom: 4, fontSize: 10 }}>Premium Report</div>
          <div className="j-display" style={{ fontSize: 18, lineHeight: 1.2 }}>Aanya Sharma</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>40 pages · 7 chapters</div>
        </div>
        <div className="j-divider" style={{ margin: '0 20px 16px' }}/>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 12px' }}>
          {CHAPTERS.map((c, i) => (
            <div key={c} onClick={() => { setActiveChapter(i); setLoading(i >= 4); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, cursor: 'pointer', background: activeChapter === i ? 'var(--primary-soft)' : 'transparent', marginBottom: 2, transition: 'background 150ms' }}>
              <span className="j-mono" style={{ fontSize: 11, width: 20, color: activeChapter === i ? 'var(--primary-ink)' : 'var(--text-dim)', fontWeight: 700, flexShrink: 0 }}>0{i + 1}</span>
              <span style={{ fontSize: 13, fontWeight: activeChapter === i ? 600 : 400, color: activeChapter === i ? 'var(--primary-ink)' : 'var(--text-2)' }}>{c}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: '16px 12px 0' }}>
          <button className="j-btn j-btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: 12, padding: '10px' }}><Icons.reports size={14}/> Download PDF</button>
        </div>
      </div>

      {/* report content */}
      <div style={{ overflowY: 'auto', padding: '48px 64px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '70%', gap: 24 }}>
            <Constellation width={160} height={90} opacity={0.5}/>
            <WisdomLoader section="report" size="lg"/>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>This chapter takes 2–3 minutes to compose</div>
          </div>
        ) : (
          <div style={{ maxWidth: 680 }}>
            <div className="j-eyebrow" style={{ color: 'var(--primary)', marginBottom: 12 }}>Chapter {activeChapter + 1} of {CHAPTERS.length}</div>
            <h1 className="j-display" style={{ fontSize: 52, lineHeight: 1.0, margin: '0 0 8px' }}>{CHAPTERS[activeChapter]}</h1>
            <div className="j-mono" style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 40 }}>Aanya Sharma · Leo Ascendant · Anuradha Nakshatra</div>

            <p style={{ fontSize: 17, lineHeight: 1.75, color: 'var(--text-2)', marginBottom: 28, borderLeft: '2px solid var(--primary)', paddingLeft: 20, fontStyle: 'italic' }}>
              "A Leo rising is a visible soul — not from vanity, but from gravity. People orient toward you before you have said a word. The burden of this is learning to choose what you radiate."
            </p>

            <p style={{ fontSize: 16, lineHeight: 1.75, color: 'var(--text-2)', marginBottom: 24 }}>
              With the Sun placed in your first house in its own sign, and Jupiter in the tenth, your life has a particular shape: outward achievement comes naturally, but it takes some years before the inner life catches up with the outer reputation. The early Saturn-Sun tension in your chart points to a recurring lesson — that authority is earned, not claimed.
            </p>

            <p style={{ fontSize: 16, lineHeight: 1.75, color: 'var(--text-2)', marginBottom: 24 }}>
              The Moon in Scorpio in the fourth house adds depth that the public rarely sees. Your inner world is intense, almost oceanic. This is where your real decisions are made — not in meetings or on paper, but in the quiet after midnight.
            </p>

            <div className="j-card" style={{ padding: 24, marginBottom: 28, background: 'var(--surface-2)' }}>
              <div className="j-eyebrow" style={{ marginBottom: 8, fontSize: 10 }}>Key Planetary Signature</div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                {[['Asc', 'Leo 23°14′'], ['Sun', 'Leo 1H (Own)'], ['Moon', 'Scorpio 4H'], ['Jupiter', 'Taurus 10H']].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{k}</div>
                    <div style={{ fontWeight: 600 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            <p style={{ fontSize: 16, lineHeight: 1.75, color: 'var(--text-2)' }}>
              The Jupiter period currently active (2023–2042) will be the most consequential two decades of your life. What you build now — in relationships, in work, in knowledge — will be the foundation from which the second half unfolds.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { CoupleMatchDesktop, VastuMobile, GemstoneMobile, BuyTokensMobile, ProfileMobile, PremiumReportDesktop });
