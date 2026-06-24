// jyotish-screens-3.jsx — Kundli viewer, Chat, Life Journey

// ─────────────────────────────────────────────────────────────
// 6. KUNDLI VIEWER — Desktop
// ─────────────────────────────────────────────────────────────
const TABS_KUNDLI = ['Chart', 'Planets', 'Dasha', 'Yogas', 'Doshas', 'Divisional'];
const PLANET_DATA = [
  { p: 'Su', name: 'Sun',     sign: 'Leo',    deg: '23°14′', house: 1,  state: 'Own',      retro: false },
  { p: 'Mo', name: 'Moon',    sign: 'Scorpio', deg: '09°02′', house: 4,  state: 'Neutral',  retro: false },
  { p: 'Ma', name: 'Mars',    sign: 'Scorpio', deg: '17°41′', house: 4,  state: 'Own',      retro: false },
  { p: 'Me', name: 'Mercury', sign: 'Virgo',  deg: '01°55′', house: 2,  state: 'Exalted',  retro: true  },
  { p: 'Ju', name: 'Jupiter', sign: 'Taurus', deg: '08°22′', house: 10, state: 'Neutral',  retro: false },
  { p: 'Ve', name: 'Venus',   sign: 'Libra',  deg: '14°07′', house: 3,  state: 'Own',      retro: false },
  { p: 'Sa', name: 'Saturn',  sign: 'Aquarius',deg:'22°38′', house: 7,  state: 'Own',      retro: false },
  { p: 'Ra', name: 'Rahu',    sign: 'Gemini', deg: '19°55′', house: 11, state: 'Neutral',  retro: true  },
  { p: 'Ke', name: 'Ketu',    sign: 'Sagit.', deg: '19°55′', house: 5,  state: 'Neutral',  retro: true  },
];

function KundliDesktop() {
  const [tab, setTab] = React.useState('Chart');

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* sidebar */}
      <div style={{ width: 220, background: 'var(--surface)', borderRight: '1px solid var(--border)', padding: '16px 0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '8px 20px 20px' }}>
          <div className="j-display" style={{ fontSize: 13, letterSpacing: '0.2em' }}>JYOTISH</div>
        </div>
        <div style={{ padding: '0 12px', marginBottom: 8 }}>
          <div style={{ padding: '10px 10px', background: 'var(--primary-soft)', borderRadius: 10, fontSize: 13, color: 'var(--primary-ink)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icons.chart size={15}/> Birth Chart
          </div>
        </div>
        {['Life Journey', 'Horoscope', 'Career', 'Couple Match', 'Gemstone', 'Chat with Yogi Baba'].map(l => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>{l}</div>
        ))}
      </div>

      {/* content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
          <div>
            <div className="j-eyebrow">Birth chart</div>
            <h1 className="j-display" style={{ fontSize: 36, margin: '4px 0 4px' }}>Aanya Sharma</h1>
            <div className="j-mono" style={{ fontSize: 13, color: 'var(--text-muted)' }}>14 Mar 1996 · 08:22 · Mumbai, Maharashtra</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="j-btn j-btn-secondary" style={{ padding: '8px 16px', fontSize: 13 }}>Share</button>
            <button className="j-btn j-btn-primary" style={{ padding: '8px 16px', fontSize: 13 }}>
              <Icons.reports size={14}/> Download PDF
            </button>
          </div>
        </div>

        {/* tabs */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 28, background: 'var(--surface-2)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
          {TABS_KUNDLI.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, background: tab === t ? 'var(--surface)' : 'transparent', color: tab === t ? 'var(--text)' : 'var(--text-muted)', boxShadow: tab === t ? 'var(--shadow-sm)' : 'none', transition: 'all 150ms', fontFamily: 'var(--font-body)' }}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'Chart' && (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 28 }}>
            <div className="j-card" style={{ padding: 28, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                {['North Indian', 'South Indian'].map(s => (
                  <button key={s} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, background: s === 'North Indian' ? 'var(--primary)' : 'transparent', color: s === 'North Indian' ? '#fff' : 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{s}</button>
                ))}
              </div>
              <NorthIndianChart size={260} ascendant="Le"
                planets={{ 1: 'Su', 4: ['Mo','Ma'], 3: 'Ve', 10: ['Ju','Me'], 7: 'Sa', 11: 'Ra', 5: 'Ke' }}/>
              <div style={{ textAlign: 'center' }}>
                <div className="j-mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Lagna (Ascendant)</div>
                <div className="j-display" style={{ fontSize: 20, marginTop: 4 }}>Leo · 23°14′</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* planet table */}
              <div className="j-card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                  <div className="j-eyebrow">Planetary Positions</div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      {['Planet', 'Sign', 'Degrees', 'House', 'State'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '.05em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PLANET_DATA.map((p, i) => (
                      <tr key={p.p} style={{ borderTop: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(122,150,171,.06)' }}>
                        <td style={{ padding: '10px 16px', fontWeight: 600 }}>
                          <span className="j-mono" style={{ background: 'var(--primary-soft)', color: 'var(--primary-ink)', padding: '2px 7px', borderRadius: 5, fontSize: 12, marginRight: 8 }}>{p.p}</span>
                          {p.name}
                          {p.retro && <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--text-muted)' }}>ⓡ</span>}
                        </td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-2)' }}>{p.sign}</td>
                        <td style={{ padding: '10px 16px' }} className="j-mono">{p.deg}</td>
                        <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{p.house}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: 12, padding: '2px 9px', borderRadius: 999, background: p.state === 'Exalted' ? 'var(--success-soft)' : p.state === 'Own' ? 'var(--primary-soft)' : 'var(--surface-2)', color: p.state === 'Exalted' ? 'var(--success)' : p.state === 'Own' ? 'var(--primary-ink)' : 'var(--text-muted)', fontWeight: 600 }}>{p.state}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'Dasha' && (
          <div className="j-card" style={{ padding: 28 }}>
            <div className="j-eyebrow" style={{ marginBottom: 16 }}>Vimshottari Dasha — 120 year cycle</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[['Rahu', '1989–2007', false],['Jupiter', '2007–2023', false],['Saturn', '2023–2042', true],['Mercury', '2042–2059', false],['Ketu', '2059–2066', false]].map(([p, yr, cur]) => (
                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', borderRadius: 10, background: cur ? 'var(--primary-soft)' : 'var(--surface-2)', border: `1px solid ${cur ? 'rgba(110,91,217,0.2)' : 'transparent'}` }}>
                  <span className="j-mono" style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: cur ? 'var(--primary)' : 'var(--surface)', color: cur ? '#fff' : 'var(--text-2)', borderRadius: 7, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{p.slice(0,2)}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p} Mahadasha</div>
                    <div className="j-mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{yr}</div>
                  </div>
                  {cur && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary-ink)', background: 'var(--primary-soft)', padding: '3px 10px', borderRadius: 999 }}>Active</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {!['Chart','Dasha'].includes(tab) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '80px 0', color: 'var(--text-muted)' }}>
            <Constellation width={160} height={90} opacity={0.5}/>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontStyle: 'italic', marginBottom: 8 }}>Saturn says: nothing here yet.</div>
              <button className="j-btn j-btn-secondary" style={{ fontSize: 13 }}>Generate {tab} report <span className="j-token" style={{ marginLeft: 4 }}><TokenGlyph size={10}/> 2</span></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 7. CHAT WITH YOGI BABA — Mobile
// ─────────────────────────────────────────────────────────────
const CHAT_MESSAGES = [
  { from: 'user', text: 'Should I take this new job offer in Delhi?' },
  { from: 'yogi', text: 'A Saturn in the 10th house question — the most serious kind. Let me read your chart first.\n\nWith Saturn placed in your 10th house (career) in its own sign Aquarius, you are built for responsibility and systems. The question isn\'t whether you\'re capable — you are. The question is whether this move aligns with your current Saturn antardasha, which runs until mid-2025.\n\nDelhi, as a northern city, sits in an auspicious direction from Mumbai for you. Venus rules your 4th (home) and you\'re in a Jupiter period — expansion is favoured.\n\nMy reading: yes, but negotiate the joining date. After 20 April is cleaner than before.' },
];

function ChatMobile() {
  const [input, setInput] = React.useState('');
  const [streaming, setStreaming] = React.useState(true);

  return (
    <div style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* header */}
      <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>☿</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Yogi Baba</div>
          <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>● Online · reads your chart</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <div className="j-token"><TokenGlyph size={10}/> 48</div>
        </div>
      </div>

      {/* pinned chart context */}
      <div style={{ padding: '10px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12 }}>
          <span>Asc <span className="j-mono">Leo 23°</span></span>
          <span>Moon <span className="j-mono">Scorpio</span></span>
          <span>Jupiter MD <span className="j-mono">2023–42</span></span>
        </div>
      </div>

      {/* messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* suggested prompts */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          {['What does my dasha say?', 'Career in 2025?', 'When to get married?'].map(s => (
            <button key={s} style={{ padding: '7px 13px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, fontSize: 12, cursor: 'pointer', color: 'var(--text-2)', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>{s}</button>
          ))}
        </div>

        {CHAT_MESSAGES.map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, justifyContent: m.from === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end' }}>
            {m.from === 'yogi' && (
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>☿</div>
            )}
            <div style={{ maxWidth: '82%', background: m.from === 'user' ? 'var(--primary)' : 'var(--surface)', color: m.from === 'user' ? '#fff' : 'var(--text)', border: m.from === 'yogi' ? '1px solid var(--border)' : 'none', borderRadius: m.from === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', padding: '12px 16px', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-line' }}>
              {m.from === 'yogi' && streaming && i === CHAT_MESSAGES.length - 1 ? (
                <StreamingText text={m.text} speed={18} cursor={true} onDone={() => setStreaming(false)}/>
              ) : m.text}
            </div>
          </div>
        ))}

        {streaming && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingLeft: 40 }}>
            <WisdomLoader section="chat" size="sm"/>
          </div>
        )}
      </div>

      {/* input */}
      <div style={{ padding: '12px 16px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '10px 16px', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.4, minHeight: 42 }}>
            Ask about your chart…
          </div>
          <button style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icons.send size={15}/>
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>
          <TokenGlyph size={10}/> 1 token per message
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 8. LIFE JOURNEY TIMELINE — Desktop
// ─────────────────────────────────────────────────────────────
const DASHAS = [
  { p: 'Ketu',    yr: '1989–1996', age: '0–7',   status: 'past',    note: 'Formative years. Ketu energy — spiritual restlessness, unusual early experiences.' },
  { p: 'Venus',   yr: '1996–2016', age: '7–27',  status: 'past',    note: 'Long Venus period. Beauty, relationships and creativity dominated.' },
  { p: 'Sun',     yr: '2016–2022', age: '27–33', status: 'past',    note: 'Identity crystallised. Leadership emerged. Father-figure themes.' },
  { p: 'Moon',    yr: '2022–2023', age: '33–34', status: 'past',    note: 'Emotional tide. Domestic changes. Mother-figure themes.' },
  { p: 'Mars',    yr: '2023–2024', age: '34–35', status: 'active',  note: 'Active drive. Ambition spikes. Caution with conflict.' },
  { p: 'Rahu',    yr: '2024–2042', age: '35–53', status: 'future',  note: 'Long Rahu period. Worldly ambition. Unusual path. International.' },
  { p: 'Jupiter', yr: '2042–2058', age: '53–69', status: 'future',  note: 'Wisdom phase. Teaching, philosophy, expansion.' },
  { p: 'Saturn',  yr: '2058–2077', age: '69–88', status: 'future',  note: 'Legacy-building. Slow, deep, lasting work.' },
];

function LifeJourneyDesktop() {
  const [hovered, setHovered] = React.useState('Mars');
  const active = DASHAS.find(d => d.p === hovered) || DASHAS[4];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* sidebar */}
      <div style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '24px 24px 16px' }}>
          <div className="j-display" style={{ fontSize: 13, letterSpacing: '0.2em', marginBottom: 20 }}>JYOTISH</div>
          <div className="j-eyebrow">Life Journey</div>
          <h2 className="j-display" style={{ fontSize: 22, margin: '6px 0 0' }}>Aanya Sharma</h2>
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 10 }}>
            Vimshottari system · 120-year cycle mapped to your lagna
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '0 12px 24px' }}>
          {DASHAS.map(d => (
            <div key={d.p} onClick={() => setHovered(d.p)} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', background: hovered === d.p ? 'var(--primary-soft)' : 'transparent', marginBottom: 2, transition: 'background 150ms' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: d.status === 'active' ? 'var(--primary)' : d.status === 'past' ? 'var(--text-dim)' : 'var(--border-strong)', border: d.status === 'active' ? '2px solid white' : '2px solid transparent', boxShadow: d.status === 'active' ? '0 0 0 2px var(--primary)' : 'none', flexShrink: 0 }}/>
                <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '3px 0' }}/>
              </div>
              <div>
                <div style={{ fontWeight: hovered === d.p ? 700 : 500, fontSize: 14, color: hovered === d.p ? 'var(--primary-ink)' : 'var(--text)' }}>{d.p}</div>
                <div className="j-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.yr} · Age {d.age}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* detail */}
      <div style={{ overflowY: 'auto', padding: '48px 56px' }}>
        <div style={{ maxWidth: 680 }}>
          <div className="j-eyebrow" style={{ color: active.status === 'active' ? 'var(--primary)' : 'var(--text-muted)', marginBottom: 12 }}>
            {active.status === 'active' ? '⬤ Currently active' : active.status === 'past' ? 'Past period' : 'Future period'}
          </div>
          <h1 className="j-display" style={{ fontSize: 64, lineHeight: 1.0, margin: '0 0 8px' }}>{active.p}</h1>
          <div className="j-mono" style={{ fontSize: 16, color: 'var(--text-muted)', marginBottom: 32 }}>Mahadasha · {active.yr} · Age {active.age}</div>

          {active.status === 'active' || active.status === 'past' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="j-card" style={{ padding: 28 }}>
                <div className="j-eyebrow" style={{ marginBottom: 12 }}>What this period brings</div>
                <p style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--text-2)', margin: 0 }}>{active.note}</p>
              </div>

              {active.status === 'active' && (
                <div className="j-card" style={{ padding: 28, borderColor: 'rgba(122,150,171,0.2)', background: 'linear-gradient(135deg, #E8F0F4 0%, #fff 100%)' }}>
                  <div className="j-eyebrow" style={{ color: 'var(--primary)', marginBottom: 12 }}>AI guidance · Mars period</div>
                  <p style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--text-2)', margin: '0 0 16px' }}>
                    "Mars ignites. In this brief window before Rahu's long arc begins, the ground is clear for action. Start the thing you have been rehearsing in your head."
                  </p>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <button className="j-btn j-btn-primary" style={{ fontSize: 13, padding: '9px 18px' }}>
                      Full phase reading <span className="j-token" style={{ marginLeft: 6 }}><TokenGlyph size={10}/> 2</span>
                    </button>
                    <button className="j-btn j-btn-ghost" style={{ fontSize: 13 }}>Ask Yogi Baba</button>
                  </div>
                </div>
              )}

              {/* sub-dashas */}
              <div className="j-card" style={{ padding: 24 }}>
                <div className="j-eyebrow" style={{ marginBottom: 14 }}>Antar Dashas within {active.p}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['Ma–Ma', 'Ma–Ra', 'Ma–Ju', 'Ma–Sa', 'Ma–Me'].map((ad, i) => (
                    <div key={ad} style={{ padding: '7px 14px', background: i === 0 ? 'var(--primary-soft)' : 'var(--surface-2)', borderRadius: 8, fontSize: 12, fontWeight: 600, color: i === 0 ? 'var(--primary-ink)' : 'var(--text-muted)' }} className="j-mono">{ad}</div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="j-card" style={{ padding: 28 }}>
                <div className="j-eyebrow" style={{ marginBottom: 12 }}>Preview</div>
                <p style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--text-2)', margin: 0 }}>{active.note}</p>
              </div>
              <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: 'var(--text-muted)' }}>
                <Constellation width={140} height={70} opacity={0.4}/>
                <div style={{ fontStyle: 'italic', fontSize: 14 }}>This period begins in {active.yr.split('–')[0]}.</div>
                <button className="j-btn j-btn-secondary" style={{ fontSize: 13 }}>Generate future reading <span className="j-token" style={{ marginLeft: 6 }}><TokenGlyph size={10}/> 3</span></button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { KundliDesktop, ChatMobile, LifeJourneyDesktop });
