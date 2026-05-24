// jyotish-screens-1.jsx — Design System, WisdomLoader showcase, Landing/Login

// ─────────────────────────────────────────────────────────────
// 1. DESIGN SYSTEM PAGE
// ─────────────────────────────────────────────────────────────
function DesignSystemPage() {
  const Swatch = ({ name, val, ink }) => (
    <div style={{ width: 120 }}>
      <div style={{ height: 70, background: val, borderRadius: 8, border: '1px solid var(--border)' }}/>
      <div style={{ marginTop: 8, fontSize: 11, fontWeight: 600 }}>{name}</div>
      <div className="j-mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{val}</div>
    </div>
  );

  return (
    <div style={{ padding: '64px 80px', background: 'var(--bg)', minHeight: '100%', color: 'var(--text)' }}>
      <header style={{ marginBottom: 56 }}>
        <div className="j-eyebrow">Foundations</div>
        <h1 className="j-display" style={{ fontSize: 56, margin: '12px 0 8px' }}>The Jyotish System</h1>
        <p style={{ fontSize: 18, color: 'var(--text-2)', maxWidth: 620, lineHeight: 1.6 }}>
          Editorial calm. Type does the heavy lifting. Cosmic motifs appear only as accents,
          like a single faint star in a clear sky.
        </p>
      </header>

      <section style={{ marginBottom: 64 }}>
        <div className="j-eyebrow">01 · Color</div>
        <h2 className="j-display" style={{ fontSize: 28, margin: '8px 0 24px' }}>Palette</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
          <Swatch name="Linen · bg" val="#EAE7E2"/>
          <Swatch name="Lifted · surface" val="#F7F5F2"/>
          <Swatch name="Sky · surface-2" val="#D1E1E8"/>
          <Swatch name="Slate · surface-3" val="#B9C8D9"/>
          <Swatch name="Deep slate · ink" val="#2C3A48"/>
          <Swatch name="Muted" val="#7A8A96"/>
          <Swatch name="Primary · slate blue" val="#7A96AB"/>
          <Swatch name="Primary soft" val="#D1E1E8"/>
          <Swatch name="Blush · accent" val="#FCC4C6"/>
          <Swatch name="Peach · accent soft" val="#FED3D6"/>
          <Swatch name="Mint · success" val="#CFE9E2"/>
          <Swatch name="Danger" val="#C26870"/>
        </div>
      </section>

      <section style={{ marginBottom: 64 }}>
        <div className="j-eyebrow">02 · Typography</div>
        <h2 className="j-display" style={{ fontSize: 28, margin: '8px 0 24px' }}>Voice</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', rowGap: 24, alignItems: 'baseline' }}>
          <div className="j-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Display · Cinzel</div>
          <div className="j-display" style={{ fontSize: 64 }}>Ancient wisdom.</div>
          <div className="j-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Display · 40</div>
          <div className="j-display" style={{ fontSize: 40 }}>Modern clarity.</div>
          <div className="j-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Body · Inter 18</div>
          <div style={{ fontSize: 18, lineHeight: 1.6, maxWidth: 600 }}>
            The chart is a map of the moment you arrived. Read with patience and it reveals a quiet logic.
          </div>
          <div className="j-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Body · 16</div>
          <div style={{ fontSize: 16, color: 'var(--text-2)' }}>Default reading size for paragraphs and lists.</div>
          <div className="j-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Eyebrow</div>
          <div className="j-eyebrow">Today · Tuesday, 14 May</div>
          <div className="j-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>Mono · JetBrains</div>
          <div className="j-mono" style={{ fontSize: 16 }}>Su 23°14′ · Mo 09°02′ · Ma 17°41′</div>
        </div>
      </section>

      <section style={{ marginBottom: 64 }}>
        <div className="j-eyebrow">03 · Components</div>
        <h2 className="j-display" style={{ fontSize: 28, margin: '8px 0 24px' }}>Building blocks</h2>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 24 }}>
          <button className="j-btn j-btn-primary">Read my chart <Icons.arrow size={14}/></button>
          <button className="j-btn j-btn-secondary">Save for later</button>
          <button className="j-btn j-btn-ghost">Skip</button>
          <span className="j-token"><TokenGlyph/> 1 token</span>
          <span className="j-premium"><Icons.star size={11}/> Premium</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, maxWidth: 900 }}>
          <div className="j-card" style={{ padding: 24 }}>
            <div className="j-eyebrow" style={{ marginBottom: 6 }}>Card · default</div>
            <div className="j-display" style={{ fontSize: 22, marginBottom: 6 }}>Mahadasha</div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>You are in Jupiter for 7 more years.</div>
          </div>
          <div className="j-card" style={{ padding: 24 }}>
            <div className="j-eyebrow" style={{ marginBottom: 12 }}>Loader</div>
            <WisdomLoader section="kundli" size="sm"/>
          </div>
          <div className="j-card" style={{ padding: 24 }}>
            <div className="j-eyebrow" style={{ marginBottom: 12 }}>Empty state</div>
            <Constellation width={100} height={50}/>
            <div style={{ fontSize: 14, marginTop: 8, color: 'var(--text-2)' }}>
              <em>Saturn says: nothing here yet.</em>
            </div>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: 64 }}>
        <div className="j-eyebrow">04 · Spacing & radius</div>
        <h2 className="j-display" style={{ fontSize: 28, margin: '8px 0 24px' }}>Rhythm</h2>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
          {[4,8,12,16,24,32,48,64].map(s => (
            <div key={s} style={{ textAlign: 'center' }}>
              <div style={{ width: s, height: s, background: 'var(--primary)', borderRadius: 2, margin: '0 auto' }}/>
              <div className="j-mono" style={{ fontSize: 10, marginTop: 6, color: 'var(--text-muted)' }}>{s}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="j-eyebrow">05 · Motion</div>
        <h2 className="j-display" style={{ fontSize: 28, margin: '8px 0 24px' }}>Tempo</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, maxWidth: 800, fontSize: 13 }}>
          {[
            ['Page enter', '400ms · ease-out · 8px slide'],
            ['Card hover', '150ms · lift 1px + glow'],
            ['List stagger', '60ms each child'],
            ['Streaming text', '35ms per char + cursor'],
            ['Wisdom rotate', '2800ms cycle · fade'],
            ['Reduced motion', 'all ambient → off'],
          ].map(([k, v]) => (
            <div key={k} className="j-card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 600 }}>{k}</div>
              <div className="j-mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{v}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 2. WISDOM LOADER SHOWCASE
// ─────────────────────────────────────────────────────────────
function WisdomShowcasePage() {
  const sections = Object.keys(WISDOM_BANK);
  return (
    <div style={{ padding: '64px 80px', background: 'var(--bg)', minHeight: '100%' }}>
      <header style={{ marginBottom: 56, maxWidth: 720 }}>
        <div className="j-eyebrow">Component · 〈WisdomLoader /〉</div>
        <h1 className="j-display" style={{ fontSize: 48, margin: '12px 0 16px' }}>
          We replaced spinners with wisdom.
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--text-2)' }}>
          Every loading state in Jyotish AI surfaces a quiet, section-relevant line that rotates every 2.8 seconds.
          A pulsing dot. No spinning gold. A few seconds of waiting becomes a few seconds of contemplation.
        </p>
      </header>

      <section style={{ marginBottom: 56 }}>
        <div className="j-eyebrow" style={{ marginBottom: 20 }}>Anatomy</div>
        <div className="j-card" style={{ padding: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 60 }}>
          <WisdomLoader section="onboarding" size="lg"/>
        </div>
        <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, fontSize: 13 }}>
          <div>
            <div className="j-eyebrow" style={{ marginBottom: 4 }}>Pulse dot</div>
            <span style={{ color: 'var(--text-muted)' }}>6 · primary · 1.6s ease-in-out</span>
          </div>
          <div>
            <div className="j-eyebrow" style={{ marginBottom: 4 }}>Wisdom line</div>
            <span style={{ color: 'var(--text-muted)' }}>Italic body · fades 2.8s · cycles</span>
          </div>
          <div>
            <div className="j-eyebrow" style={{ marginBottom: 4 }}>Optional progress</div>
            <span style={{ color: 'var(--text-muted)' }}>Hairline 1px bar · primary fill</span>
          </div>
        </div>
      </section>

      <section>
        <div className="j-eyebrow" style={{ marginBottom: 20 }}>All 21 contexts · live</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, background: 'var(--border)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
          {sections.map((s) => (
            <div key={s} style={{ background: 'var(--surface)', padding: '20px 24px' }}>
              <div className="j-mono" style={{ fontSize: 10, color: 'var(--primary-ink)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>{s}</div>
              <WisdomLoader section={s} size="sm"/>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 3. LANDING / LOGIN — Desktop
// ─────────────────────────────────────────────────────────────
function LandingDesktop() {
  return (
    <div style={{ position: 'relative', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <div className="j-starfield" style={{ opacity: 0.35 }}/>
      <div className="j-orb" style={{ top: '-100px', right: '-80px', width: 400, height: 400, opacity: 0.6 }}/>
      <div className="j-orb" style={{ bottom: '-120px', left: '20%', width: 320, height: 320, background: 'radial-gradient(circle, rgba(184,137,63,.15) 0%, transparent 70%)' }}/>

      {/* nav */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '24px 56px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 5 }}>
        <div className="j-display" style={{ fontSize: 18, letterSpacing: '0.2em' }}>JYOTISH</div>
        <div style={{ display: 'flex', gap: 28, fontSize: 14, color: 'var(--text-2)' }}>
          <a className="j-link" style={{ borderBottom: 'none' }}>How it works</a>
          <a className="j-link" style={{ borderBottom: 'none' }}>Tools</a>
          <a className="j-link" style={{ borderBottom: 'none' }}>Premium</a>
          <a className="j-link" style={{ borderBottom: 'none' }}>About</a>
        </div>
        <button className="j-btn j-btn-secondary" style={{ padding: '8px 16px' }}>Sign in</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', height: '100%', alignItems: 'center', gap: 80, padding: '0 80px', position: 'relative', zIndex: 2 }}>
        <div>
          <div className="j-eyebrow" style={{ color: 'var(--primary)' }}>Vedic astrology · Reborn</div>
          <h1 className="j-display" style={{ fontSize: 96, lineHeight: 1.0, margin: '20px 0 14', color: 'var(--text)' }}>
            Ancient<br/>wisdom.<br/><em style={{ fontWeight: 400, color: 'var(--primary)' }}>Modern clarity.</em>
          </h1>
          <p style={{ fontSize: 19, lineHeight: 1.6, color: 'var(--text-2)', maxWidth: 480, marginBottom: 36 }}>
            Your full Vedic kundli, computed to the second. Then read aloud — gently, plainly — by an AI that has studied the shastras so you don't have to.
          </p>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <button className="j-btn j-btn-primary" style={{ padding: '14px 24px', fontSize: 15 }}>
              Begin your reading <Icons.arrow size={16}/>
            </button>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Free for the first chart · No card required
            </span>
          </div>

          <div style={{ marginTop: 48, display: 'flex', gap: 32, fontSize: 13, color: 'var(--text-muted)' }}>
            <div>
              <div className="j-display" style={{ fontSize: 28, color: 'var(--text)' }}>120k</div>
              <div>charts read</div>
            </div>
            <div>
              <div className="j-display" style={{ fontSize: 28, color: 'var(--text)' }}>25+</div>
              <div>Vedic tools</div>
            </div>
            <div>
              <div className="j-display" style={{ fontSize: 28, color: 'var(--text)' }}>4.9</div>
              <div>★ App Store</div>
            </div>
          </div>
        </div>

        {/* sample chart preview */}
        <div style={{ position: 'relative' }}>
          <div className="j-card" style={{ padding: 32, background: 'var(--surface)', position: 'relative' }}>
            <div className="j-eyebrow" style={{ marginBottom: 4 }}>Sample reading</div>
            <div className="j-display" style={{ fontSize: 22, marginBottom: 20 }}>Aanya · b. 14 Mar 1996</div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <NorthIndianChart size={240} ascendant="Le"
                planets={{ 1: 'Su', 4: ['Mo','Ma'], 7: 'Ve', 10: ['Ju','Me'], 11: 'Sa', 5: 'Ra', 11: ['Sa','Ke'] }}/>
            </div>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 1.55, color: 'var(--text-2)', fontStyle: 'italic' }}>
              "A Leo ascendant with Jupiter in the tenth — your work will always feel slightly larger than the room you're in. Trust the size."
            </div>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
              <span>Yogi Baba · 7s ago</span>
              <span className="j-mono">Asc 23°14′ Le</span>
            </div>
          </div>
          {/* floating constellation */}
          <div style={{ position: 'absolute', top: -40, right: -30 }}>
            <Constellation width={120} height={70} opacity={0.5}/>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 3b. LANDING / LOGIN — Mobile
// ─────────────────────────────────────────────────────────────
function LandingMobile() {
  return (
    <div style={{ height: '100%', background: 'var(--bg)', position: 'relative', overflow: 'hidden' }}>
      <div className="j-starfield" style={{ opacity: 0.4 }}/>
      <div className="j-orb" style={{ top: -80, right: -60, width: 240, height: 240, opacity: 0.7 }}/>
      <div className="j-orb" style={{ bottom: 100, left: -40, width: 200, height: 200, background: 'radial-gradient(circle, rgba(184,137,63,.18) 0%, transparent 70%)' }}/>

      <div style={{ padding: '24px 14 0', position: 'relative', zIndex: 2 }}>
        <div className="j-display" style={{ fontSize: 14, letterSpacing: '0.25em' }}>JYOTISH</div>
      </div>

      <div style={{ padding: '60px 14 0', position: 'relative', zIndex: 2 }}>
        <div className="j-eyebrow" style={{ color: 'var(--primary)', marginBottom: 16 }}>Vedic · Reborn</div>
        <h1 className="j-display" style={{ fontSize: 48, lineHeight: 1.05, margin: '0 0 20px' }}>
          Ancient<br/>wisdom.
        </h1>
        <h1 className="j-display" style={{ fontSize: 48, lineHeight: 1.05, margin: '0 0 14', fontStyle: 'italic', fontWeight: 400, color: 'var(--primary)' }}>
          Modern clarity.
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--text-2)', marginBottom: 36 }}>
          Your full Vedic kundli, computed to the second. Read aloud — gently, plainly — by an AI that has studied the shastras.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button className="j-btn j-btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: 15 }}>
            Continue with Google
          </button>
          <button className="j-btn j-btn-secondary" style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: 15 }}>
            Continue with Apple
          </button>
          <button className="j-btn j-btn-ghost" style={{ width: '100%', justifyContent: 'center', padding: '14px', fontSize: 15 }}>
            Sign in with email
          </button>
        </div>

        <div style={{ marginTop: 32, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
          By continuing you agree to our Terms.<br/>
          The first chart is on us.
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 32, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <Constellation width={200} height={50} opacity={0.4}/>
      </div>
    </div>
  );
}

Object.assign(window, { DesignSystemPage, WisdomShowcasePage, LandingDesktop, LandingMobile });
