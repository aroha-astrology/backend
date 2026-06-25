// Server-only: @react-pdf/renderer PDF component — Vedic Numerology Report (70–100 pages)
import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { LoShuGrid, ChallengeNumbers, ZodiacInfo, NamePlanes, KuaData } from '@aroha-astrology/astro-engine';

// =============================================================================
// Types
// =============================================================================

export interface NumerologyReportData {
  name: string;
  dob: string;
  gender: 'male' | 'female';
  mulank: number;
  bhagyank: number;
  kua: KuaData;
  zodiac: ZodiacInfo;
  loShuGrid: LoShuGrid;
  challengeNumbers: ChallengeNumbers;
  soulUrge: number;
  personality: number;
  nameNumber: number;
  namePlanes: NamePlanes;
  monthlyForecast: Array<{ month: string; year: number; calendarMonth: number; personalMonth: number; personalYear: number }>;
  aiContent: {
    mulankData: Record<string, unknown>;
    bhagyankData: Record<string, unknown>;
    zodiacLucky: Record<string, unknown>;
    compat: Record<string, unknown>;
    healthCareer: Record<string, unknown>;
    loShuName: Record<string, unknown>;
    forecastRemedies: Record<string, unknown>;
    palmData: Record<string, unknown> | null;
  };
}

// =============================================================================
// Design tokens — Purple/Parchment style (Astro Arun Pandit inspired)
// =============================================================================

const C = {
  // Purple spectrum (cover, dividers, headers)
  purple: '#3d1a6e',
  purpleDark: '#1a0840',
  purpleMid: '#5a2a96',
  purpleLight: '#7a3abc',
  purplePale: '#e8daf5',
  // Parchment (content page backgrounds)
  parchment: '#f5ead5',
  parchmentDark: '#e8d8b8',
  parchmentDeep: '#d4c098',
  // Gold accents
  gold: '#c9a227',
  goldLight: '#e8c84a',
  goldPale: '#f5e8a0',
  goldDeep: '#a07810',
  // Text colors
  inkDark: '#1a0e40',   // dark purple-navy for headings
  inkBody: '#2d1b00',   // dark brown for body text on parchment
  inkMid: '#5a4a30',    // medium brown for secondary text
  inkLight: '#8a7a60',  // light brown for captions
  // Utility
  white: '#ffffff',
  maroon: '#6b0f1a',
  green: '#2d6a2a',
  orange: '#b05a10',
  red: '#8b1a1a',
};

const BODY = 11;
const SMALL = 9.5;
const TINY = 8.5;
const LH = 1.75;

// =============================================================================
// Styles
// =============================================================================

const S = StyleSheet.create({
  // ── Content pages: parchment background ───────────────────────────────
  // paddingTop: 48 leaves room for the fixed absolute header band
  page: { backgroundColor: C.parchment, color: C.inkBody, fontFamily: 'Helvetica', padding: 36, paddingTop: 52, paddingBottom: 52, fontSize: BODY },
  pageInner: { paddingHorizontal: 36, paddingTop: 16, paddingBottom: 52 },
  coverPage: { backgroundColor: C.purpleDark, color: C.white, padding: 0 },

  // ── Purple header band on content pages (position absolute, full width) ──
  pageHeader: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: C.purple, paddingVertical: 10, paddingHorizontal: 36, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: C.gold },
  pageHeaderTitle: { fontSize: SMALL, color: C.white, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1.5, flex: 1 },
  pageHeaderRight: { fontSize: TINY, color: C.goldDeep },

  // ── Cover ──────────────────────────────────────────────────────────────
  coverTopBand: { backgroundColor: C.purple, borderBottomWidth: 3, borderBottomColor: C.gold, paddingVertical: 40, paddingHorizontal: 48, alignItems: 'center' },
  coverOrnament: { width: 60, height: 2, backgroundColor: C.gold, marginVertical: 10 },
  coverTitle: { fontSize: 28, color: C.white, fontFamily: 'Helvetica-Bold', letterSpacing: 3, textAlign: 'center', textTransform: 'uppercase' },
  coverTitleSub: { fontSize: 11, color: C.goldDeep, marginTop: 6, textAlign: 'center', letterSpacing: 2, textTransform: 'uppercase' },
  coverMidSection: { backgroundColor: C.purpleDark, paddingHorizontal: 48, paddingVertical: 32, alignItems: 'center', flex: 1 },
  coverNameBanner: { borderWidth: 2, borderColor: C.gold, borderRadius: 4, paddingVertical: 12, paddingHorizontal: 40, marginTop: 10, alignItems: 'center' },
  coverName: { fontSize: 28, fontFamily: 'Helvetica-Bold', color: C.gold, textAlign: 'center', letterSpacing: 1 },
  coverDob: { fontSize: 12, color: C.purplePale, textAlign: 'center', marginTop: 8 },
  coverDividerLine: { borderBottomWidth: 1, borderBottomColor: C.gold, marginTop: 28, marginBottom: 8, width: 200 },
  coverPillRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 24 },
  coverPill: { backgroundColor: C.purple, borderWidth: 1, borderColor: C.gold, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', minWidth: 90 },
  coverPillLabel: { fontSize: TINY, color: C.goldDeep, textTransform: 'uppercase', letterSpacing: 0.8 },
  coverPillValue: { fontSize: 22, color: C.gold, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  coverPillSub: { fontSize: TINY, color: C.purplePale, marginTop: 2, textAlign: 'center' },
  coverLuckyBox: { borderWidth: 1, borderColor: C.gold, borderRadius: 4, padding: 16, marginTop: 20, width: '100%' },
  coverLuckyTitle: { fontSize: SMALL, color: C.gold, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
  coverFooterBand: { backgroundColor: C.purple, borderTopWidth: 2, borderTopColor: C.gold, paddingVertical: 10, paddingHorizontal: 48, alignItems: 'center' },
  coverFooter: { fontSize: TINY, color: C.purplePale, textAlign: 'center' },

  // ── Section divider pages ─────────────────────────────────────────────
  dividerPage: { backgroundColor: C.purple, padding: 0, flex: 1 },
  dividerTopAccent: { height: 4, backgroundColor: C.gold },
  dividerBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 60 },
  dividerChapterNum: { fontSize: 72, color: C.gold, fontFamily: 'Helvetica-Bold', opacity: 0.3 },
  dividerTitle: { fontSize: 28, color: C.white, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginTop: -10, textTransform: 'uppercase', letterSpacing: 2 },
  dividerSubtitle: { fontSize: 13, color: C.purplePale, textAlign: 'center', marginTop: 12, lineHeight: 1.6 },
  dividerLine: { width: 80, height: 2, backgroundColor: C.gold, marginVertical: 20 },
  dividerBottomAccent: { height: 4, backgroundColor: C.gold },

  // ── Chapter header on parchment pages ─────────────────────────────────
  chapterBand: { backgroundColor: C.purple, paddingVertical: 10, paddingHorizontal: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center' },
  chapterNumBadge: { backgroundColor: C.gold, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  chapterNumText: { fontSize: SMALL, color: C.purpleDark, fontFamily: 'Helvetica-Bold' },
  chapterTitle: { fontSize: 16, color: C.white, fontFamily: 'Helvetica-Bold', flex: 1 },
  chapterSub: { fontSize: TINY, color: C.purplePale, marginTop: 2 },
  sectionTitle: { fontSize: 13, color: C.purple, fontFamily: 'Helvetica-Bold', marginTop: 16, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: C.gold, paddingBottom: 4 },
  subTitle: { fontSize: 11, color: C.inkDark, fontFamily: 'Helvetica-Bold', marginTop: 10, marginBottom: 4 },

  // ── Cards (parchment style) ────────────────────────────────────────────
  card: { backgroundColor: C.parchmentDark, borderWidth: 1, borderColor: C.parchmentDeep, borderRadius: 4, padding: 14, marginBottom: 12 },
  cardGold: { backgroundColor: C.parchmentDark, borderWidth: 1, borderColor: C.gold, borderRadius: 4, padding: 14, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: C.gold },
  cardPurple: { backgroundColor: C.purplePale, borderWidth: 1, borderColor: C.purple, borderRadius: 4, padding: 14, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: C.purple },
  cardAccent: { backgroundColor: C.parchmentDark, borderWidth: 1, borderColor: C.purpleMid, borderRadius: 4, padding: 14, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: C.purpleMid },

  // ── Text (dark ink on parchment) ──────────────────────────────────────
  body: { fontSize: BODY, color: C.inkBody, lineHeight: LH, marginBottom: 5 },
  bodySmall: { fontSize: SMALL, color: C.inkBody, lineHeight: LH, marginBottom: 3 },
  label: { fontSize: TINY, color: C.inkMid, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  goldText: { fontSize: BODY, color: C.goldDeep, fontFamily: 'Helvetica-Bold' },
  purpleText: { fontSize: BODY, color: C.purple, fontFamily: 'Helvetica-Bold' },
  highlight: { fontSize: BODY + 1, color: C.inkDark, fontFamily: 'Helvetica-Bold', lineHeight: LH },
  mantraText: { fontSize: 13, color: C.purple, fontFamily: 'Helvetica-Bold', lineHeight: 1.8, textAlign: 'center', marginVertical: 8 },

  // ── Layout ─────────────────────────────────────────────────────────────
  row: { flexDirection: 'row', gap: 14 },
  col: { flex: 1 },
  col2: { flex: 2 },
  divider: { borderBottomWidth: 1, borderBottomColor: C.parchmentDeep, marginVertical: 10 },
  goldDivider: { borderBottomWidth: 1, borderBottomColor: C.gold, marginVertical: 10 },
  spacer: { marginTop: 12 },

  // ── Tables (gold borders on parchment) ───────────────────────────────
  table: { borderWidth: 1, borderColor: C.gold, borderRadius: 2, marginTop: 10 },
  thead: { flexDirection: 'row', backgroundColor: C.purple, borderBottomWidth: 2, borderBottomColor: C.gold },
  trow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.parchmentDeep, backgroundColor: C.parchment },
  trowAlt: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.parchmentDeep, backgroundColor: C.parchmentDark },
  th: { flex: 1, padding: 7, fontSize: SMALL, color: C.white, fontFamily: 'Helvetica-Bold' },
  td: { flex: 1, padding: 7, fontSize: SMALL, color: C.inkBody, lineHeight: 1.5 },

  // ── Lo Shu Grid (parchment style) ────────────────────────────────────
  loShuWrap: { flexDirection: 'row', justifyContent: 'center', marginVertical: 16 },
  loShuTable: { borderWidth: 3, borderColor: C.gold },
  loShuRow: { flexDirection: 'row' },
  loShuCell: { width: 86, height: 86, borderWidth: 1, borderColor: C.gold, backgroundColor: C.parchment, alignItems: 'center', justifyContent: 'center' },
  loShuEmpty: { width: 86, height: 86, borderWidth: 1, borderColor: C.parchmentDeep, backgroundColor: C.purplePale, alignItems: 'center', justifyContent: 'center' },
  loShuNum: { fontSize: 28, color: C.purple, fontFamily: 'Helvetica-Bold' },
  loShuEmptyNum: { fontSize: 28, color: C.inkLight, fontFamily: 'Helvetica-Bold' },
  loShuDots: { fontSize: SMALL, color: C.gold, marginTop: 2 },

  // ── Badges ─────────────────────────────────────────────────────────────
  badge: { backgroundColor: C.gold, borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: C.purpleDark, fontSize: 14, fontFamily: 'Helvetica-Bold' },

  // ── Tags ───────────────────────────────────────────────────────────────
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tag: { backgroundColor: C.purplePale, borderWidth: 1, borderColor: C.purpleMid, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  tagGold: { backgroundColor: C.parchmentDark, borderWidth: 1, borderColor: C.gold, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  tagText: { fontSize: TINY, color: C.inkDark },
  tagGoldText: { fontSize: TINY, color: C.goldDeep },

  // ── Info rows ──────────────────────────────────────────────────────────
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: C.parchmentDeep },
  infoLabel: { fontSize: SMALL, color: C.inkMid },
  infoValue: { fontSize: SMALL, color: C.inkDark, fontFamily: 'Helvetica-Bold' },

  // ── Bullet list ────────────────────────────────────────────────────────
  bulletRow: { flexDirection: 'row', marginBottom: 5 },
  bulletDot: { width: 14, fontSize: BODY, color: C.purple },
  bulletText: { flex: 1, fontSize: BODY, color: C.inkBody, lineHeight: LH },

  // ── Page footer ────────────────────────────────────────────────────────
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.purple, borderTopWidth: 2, borderTopColor: C.gold, paddingVertical: 6, paddingHorizontal: 36, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: TINY, color: C.purplePale },
});

const ratingBadge = (r: string) => ({
  backgroundColor: r === 'Excellent' ? '#d4f0d0' : r === 'Good' ? '#e0f0e0' : r === 'Average' ? '#f0ead0' : '#f0d0d0',
  borderWidth: 1,
  borderColor: r === 'Excellent' ? C.green : r === 'Good' ? '#4a8f40' : r === 'Average' ? C.orange : C.red,
  borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8,
});

const ratingText = (r: string) => ({
  fontSize: TINY, fontFamily: 'Helvetica-Bold',
  color: r === 'Excellent' ? C.green : r === 'Good' ? '#4a8f40' : r === 'Average' ? C.orange : C.red,
});

// =============================================================================
// Helpers
// =============================================================================

function safe(val: unknown, fallback = '—'): string {
  if (val === null || val === undefined || val === '') return fallback;
  if (typeof val === 'string') return val || fallback;
  if (typeof val === 'number') return String(val);
  return String(val) || fallback;
}

function safeArr(val: unknown): unknown[] {
  return Array.isArray(val) ? val : [];
}

function safeObj(val: unknown): Record<string, unknown> {
  return (val && typeof val === 'object' && !Array.isArray(val)) ? val as Record<string, unknown> : {};
}

function PageHeader({ section, name }: { section: string; name: string }) {
  return (
    <View style={S.pageHeader} fixed>
      <Text style={S.pageHeaderTitle}>{section}</Text>
      <Text style={S.pageHeaderRight}>Aroha Astrology • {name}</Text>
    </View>
  );
}

function Footer({ name, section }: { name: string; section: string }) {
  return (
    <View style={S.footer} fixed>
      <Text style={S.footerText}>Aroha Astrology • Vedic Numerology Report • {name}</Text>
      <Text style={S.footerText}>{section}</Text>
    </View>
  );
}

function ChapterHeader({ number, title, subtitle }: { number: string; title: string; subtitle?: string }) {
  return (
    <View style={S.chapterBand}>
      <View style={S.chapterNumBadge}>
        <Text style={S.chapterNumText}>{number}</Text>
      </View>
      <View>
        <Text style={S.chapterTitle}>{title}</Text>
        {subtitle && <Text style={S.chapterSub}>{subtitle}</Text>}
      </View>
    </View>
  );
}

function SectionDividerPage({ number, title, subtitle }: { number: string; title: string; subtitle?: string }) {
  return (
    <Page size="A4" style={S.dividerPage}>
      <View style={S.dividerTopAccent} />
      <View style={S.dividerBody}>
        <Text style={S.dividerChapterNum}>{number}</Text>
        <Text style={S.dividerTitle}>{title}</Text>
        <View style={S.dividerLine} />
        {subtitle && <Text style={S.dividerSubtitle}>{subtitle}</Text>}
      </View>
      <View style={S.dividerBottomAccent} />
    </Page>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={S.sectionTitle}>{children}</Text>;
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <Text style={S.subTitle}>{children}</Text>;
}

function Body({ children }: { children: React.ReactNode }) {
  return <Text style={S.body}>{children}</Text>;
}

function Divider() {
  return <View style={S.divider} />;
}

function BulletList({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={S.bulletRow}>
          <Text style={S.bulletDot}>•</Text>
          <Text style={S.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={S.infoRow}>
      <Text style={S.infoLabel}>{label}</Text>
      <Text style={S.infoValue}>{value}</Text>
    </View>
  );
}

const LO_SHU_TEMPLATE = [[4, 9, 2], [3, 5, 7], [8, 1, 6]];

function LoShuGridView({ grid }: { grid: LoShuGrid }) {
  return (
    <View style={S.loShuWrap}>
      <View style={S.loShuTable}>
        {LO_SHU_TEMPLATE.map((row, ri) => (
          <View key={ri} style={S.loShuRow}>
            {row.map((num) => {
              const count = grid.frequencies[num] ?? 0;
              return count === 0 ? (
                <View key={num} style={S.loShuEmpty}>
                  <Text style={S.loShuEmptyNum}>{num}</Text>
                  <Text style={[S.loShuDots, { color: C.inkLight }]}>absent</Text>
                </View>
              ) : (
                <View key={num} style={S.loShuCell}>
                  <Text style={S.loShuNum}>{num}</Text>
                  <Text style={S.loShuDots}>{'●'.repeat(Math.min(count, 6))}</Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

// =============================================================================
// Main Document
// =============================================================================

export function NumerologyReport({ data }: { data: NumerologyReportData }) {
  const { aiContent, loShuGrid, challengeNumbers, monthlyForecast, namePlanes } = data;
  const mu = safeObj(aiContent.mulankData);
  const bh = safeObj(aiContent.bhagyankData);
  const zl = safeObj(aiContent.zodiacLucky);
  const co = safeObj(aiContent.compat);
  const hc = safeObj(aiContent.healthCareer);
  const ls = safeObj(aiContent.loShuName);
  const fr = safeObj(aiContent.forecastRemedies);

  const dobDisplay = new Date(data.dob + 'T00:00:00Z').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });

  // Header band that appears at top of every content page
  const PH = () => (
    <View style={S.pageHeader}>
      <Text style={S.pageHeaderTitle}>VEDIC NUMEROLOGY REPORT</Text>
      <Text style={S.pageHeaderRight}>Aroha Astrology  •  {data.name}</Text>
    </View>
  );

  const muPers = safeObj(mu.personality);
  const muFav = safeObj(mu.favorable_periods);
  const muUnfav = safeObj(mu.unfavorable_periods);
  const muPlanet = safeObj(mu.ruling_planet);
  const muLucky = safeObj(zl.lucky);
  const zodiacAI = safeObj(zl.zodiac);
  const deityAI = safeObj(zl.deity);
  const bhLife = safeObj(bh.life_path);
  const bhCombo = safeObj(bh.combination_with_mulank);
  const bhSecondary = safeObj(bh.secondary_traits);
  const coRomance = safeObj(co.romance);
  const hcHealth = safeObj(hc.health);
  const hcCareer = safeObj(hc.career);
  const hcDiet = safeObj(hcHealth.diet_recommendations);
  const hcLifestyle = safeObj(hcHealth.lifestyle);
  const hcDecade = safeObj(hcHealth.health_by_decade);
  const lsGrid = safeObj(ls.lo_shu);
  const lsFreq = safeObj(lsGrid.frequency_analysis);
  const lsMissing = safeObj(lsGrid.missing_numbers);
  const lsPlanes = safeObj(lsGrid.grid_planes);
  const fengShui = safeObj(ls.feng_shui);
  const fsDirs = safeObj(fengShui.lucky_directions);
  const nameNum = safeObj(ls.name_numerology);
  const nameNumNumber = safeObj(nameNum.name_number);
  const nameNumSoul = safeObj(nameNum.soul_urge);
  const nameNumPersonality = safeObj(nameNum.personality_number);
  const namePlanesAI = safeObj(nameNum.name_planes);
  const frMantras = safeObj(fr.mantras);
  const frRemedies = safeObj(fr.remedies);
  const frLuck = safeObj(fr.everyday_luck);
  const frForecast = safeArr(fr.monthly_forecast);
  const frCycles = safeArr(fr.life_cycles);

  const palm = aiContent.palmData ? safeObj(aiContent.palmData) : null;
  const palmMajor = palm ? safeObj(palm.major_lines) : null;
  const palmMinor = palm ? safeObj(palm.minor_lines) : null;
  const palmMounts = palm ? safeObj(palm.mounts) : null;

  return (
    <Document title={`Numerology Report — ${data.name}`} author="Aroha Astrology">

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* COVER PAGE                                                         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={S.coverPage}>
        {/* Top purple band */}
        <View style={S.coverTopBand}>
          <View style={S.coverOrnament} />
          <Text style={S.coverTitleSub}>Aroha Astrology Presents</Text>
          <Text style={S.coverTitle}>Vedic Numerology Report</Text>
          <Text style={S.coverTitleSub}>A Complete Numerological Blueprint • 15 Modules</Text>
          <View style={S.coverOrnament} />
        </View>

        {/* Middle section — dark purple with name and numbers */}
        <View style={S.coverMidSection}>
          <Text style={{ fontSize: 11, color: C.purplePale, marginBottom: 6, letterSpacing: 1 }}>PREPARED EXCLUSIVELY FOR</Text>
          <View style={S.coverNameBanner}>
            <Text style={S.coverName}>{data.name}</Text>
          </View>
          <Text style={S.coverDob}>{dobDisplay}  •  {data.gender === 'male' ? 'Male' : 'Female'}</Text>

          <View style={S.coverDividerLine} />

          <View style={S.coverPillRow}>
            {[
              { label: 'Mulank', value: String(data.mulank), sub: 'Psychic Number' },
              { label: 'Bhagyank', value: String(data.bhagyank), sub: 'Destiny Number' },
              { label: 'Kua', value: String(data.kua.kuaNumber), sub: data.kua.element },
              { label: 'Zodiac', value: data.zodiac.sign.slice(0, 7), sub: data.zodiac.element },
              { label: 'Soul Urge', value: String(data.soulUrge), sub: "Heart's Desire" },
              { label: 'Personality', value: String(data.personality), sub: 'Outer Self' },
              { label: 'Name No.', value: String(data.nameNumber), sub: 'Chaldean' },
            ].map((p) => (
              <View key={p.label} style={S.coverPill}>
                <Text style={S.coverPillLabel}>{p.label}</Text>
                <Text style={S.coverPillValue}>{p.value}</Text>
                <Text style={S.coverPillSub}>{p.sub}</Text>
              </View>
            ))}
          </View>

          {/* Lucky box */}
          <View style={S.coverLuckyBox}>
            <Text style={S.coverLuckyTitle}>Lucky Variables at a Glance</Text>
            <View style={S.row}>
              <View style={S.col}>
                <View style={S.infoRow}>
                  <Text style={[S.infoLabel, { color: C.purplePale }]}>Lucky Numbers</Text>
                  <Text style={[S.infoValue, { color: C.gold }]}>{safeArr(muLucky.numbers).join(', ') || '—'}</Text>
                </View>
                <View style={S.infoRow}>
                  <Text style={[S.infoLabel, { color: C.purplePale }]}>Lucky Colors</Text>
                  <Text style={[S.infoValue, { color: C.gold }]}>{safeArr(muLucky.colors).join(', ') || '—'}</Text>
                </View>
                <View style={S.infoRow}>
                  <Text style={[S.infoLabel, { color: C.purplePale }]}>Lucky Day</Text>
                  <Text style={[S.infoValue, { color: C.gold }]}>{safe(muLucky.lucky_day)}</Text>
                </View>
                <View style={[S.infoRow, { borderBottomWidth: 0 }]}>
                  <Text style={[S.infoLabel, { color: C.purplePale }]}>Ruling Planet</Text>
                  <Text style={[S.infoValue, { color: C.gold }]}>{safe(muPlanet.name)}</Text>
                </View>
              </View>
              <View style={S.col}>
                <View style={S.infoRow}>
                  <Text style={[S.infoLabel, { color: C.purplePale }]}>Lucky Dates</Text>
                  <Text style={[S.infoValue, { color: C.gold }]}>{safeArr(muLucky.dates).join(', ') || '—'}</Text>
                </View>
                <View style={S.infoRow}>
                  <Text style={[S.infoLabel, { color: C.purplePale }]}>Gemstone</Text>
                  <Text style={[S.infoValue, { color: C.gold }]}>{safe(safeObj(muLucky.gemstone).primary)}</Text>
                </View>
                <View style={S.infoRow}>
                  <Text style={[S.infoLabel, { color: C.purplePale }]}>Lucky Metal</Text>
                  <Text style={[S.infoValue, { color: C.gold }]}>{safe(muLucky.lucky_metal)}</Text>
                </View>
                <View style={[S.infoRow, { borderBottomWidth: 0 }]}>
                  <Text style={[S.infoLabel, { color: C.purplePale }]}>Kua Element</Text>
                  <Text style={[S.infoValue, { color: C.gold }]}>{data.kua.element}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Footer band */}
        <View style={S.coverFooterBand}>
          <Text style={S.coverFooter}>
            Generated by Aroha Astrology  •  {new Date().toLocaleDateString('en-IN')}  •  Confidential — Prepared exclusively for {data.name}
          </Text>
        </View>
      </Page>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* TABLE OF CONTENTS                                                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={S.page}>
        <PH />
        <View>
          <ChapterHeader number="✦" title="Table of Contents" />
          <View style={S.card}>
            {[
              ['01', 'Core Numbers Overview', 'Mulank, Bhagyank, Kua, Soul Urge, Personality'],
              ['02', 'Mulank (Psychic Number) Analysis', 'Personality, Ruling Planet, Strengths & Weaknesses'],
              ['03', 'Bhagyank (Destiny Number) Analysis', 'Life Path, Karmic Lessons, Major Themes'],
              ['04', 'Mulank + Bhagyank Combination', 'How your two core numbers interact and shape destiny'],
              ['05', 'Astrological & Spiritual Context', 'Zodiac Sign, Ruling Deity, Rituals, Fasting'],
              ['06', 'Lucky Variables', 'Numbers, Colors, Dates, Gemstones, Mantras'],
              ['07', 'Compatibility Analysis', 'Friendship & Business Matrix, Romance Compatibility'],
              ['08', 'Health Blueprint', 'Vulnerable Systems, Decade Analysis, Diet & Lifestyle'],
              ['09', 'Career & Profession Mapping', 'Ideal Professions, Business vs Service, Peak Periods'],
              ['10', 'Fortune Grid (Lo Shu)', 'Grid Analysis, Missing Numbers, Planes of Consciousness'],
              ['11', 'Feng Shui & Kua Number', 'Lucky Directions, Home & Office Advice, Element Cures'],
              ['12', 'Name Numerology', 'Name Number, Soul Urge, Personality, Four Name Planes'],
              ['13', '12-Month Forecast', 'Monthly Theme, Focus, Power Days & Affirmations'],
              ['14', 'Life Cycles (Challenge Numbers)', 'Four Phases of Life with Themes & Advice'],
              ['15', 'Remedies & Everyday Luck', 'Missing Number Remedies, Mantras, Lucky Lifestyle Tips'],
            ].map(([num, title, sub], i) => (
              <View key={i} style={[S.infoRow, { alignItems: 'flex-start' }]}>
                <Text style={[S.infoLabel, { width: 28, fontSize: BODY, color: C.purple, fontFamily: 'Helvetica-Bold' }]}>{num}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[S.infoValue, { fontSize: SMALL, color: C.inkDark }]}>{title}</Text>
                  <Text style={[S.bodySmall, { color: C.inkMid, marginBottom: 0 }]}>{sub}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        <Footer name={data.name} section="Table of Contents" />
      </Page>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 01: CORE NUMBERS OVERVIEW                                 */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="01" title="Core Numbers Overview" subtitle="Your complete numerological fingerprint" />

        <View style={S.row}>
          <View style={S.col}>
            <View style={S.cardGold}>
              <Text style={S.label}>Mulank — Psychic Number</Text>
              <Text style={[S.coverPillValue, { fontSize: 36, marginBottom: 4 }]}>{data.mulank}</Text>
              <Text style={S.bodySmall}>Derived from day of birth. Governs your instinctive nature, first impressions, and natural personality.</Text>
            </View>
            <View style={S.cardGold}>
              <Text style={S.label}>Kua Number</Text>
              <Text style={[S.coverPillValue, { fontSize: 36, marginBottom: 4 }]}>{data.kua.kuaNumber}</Text>
              <Text style={S.bodySmall}>{data.kua.element} element. Governs your Feng Shui lucky directions and spatial energy.</Text>
            </View>
            <View style={S.cardGold}>
              <Text style={S.label}>Soul Urge Number</Text>
              <Text style={[S.coverPillValue, { fontSize: 36, marginBottom: 4 }]}>{data.soulUrge}</Text>
              <Text style={S.bodySmall}>Derived from vowels in your name. Reveals your deepest inner desires and motivations.</Text>
            </View>
          </View>
          <View style={S.col}>
            <View style={S.cardAccent}>
              <Text style={S.label}>Bhagyank — Destiny Number</Text>
              <Text style={[S.coverPillValue, { fontSize: 36, marginBottom: 4, color: C.purpleMid }]}>{data.bhagyank}</Text>
              <Text style={S.bodySmall}>Derived from full date of birth. Governs your life purpose, destiny path, and karmic mission.</Text>
            </View>
            <View style={S.cardAccent}>
              <Text style={S.label}>Western Zodiac Sign</Text>
              <Text style={[S.coverPillValue, { fontSize: 20, marginBottom: 4, color: C.purpleMid }]}>{data.zodiac.sign}</Text>
              <Text style={S.bodySmall}>{data.zodiac.element} • {data.zodiac.quality} • Ruled by {data.zodiac.rulingPlanet}</Text>
              <Text style={[S.bodySmall, { color: C.inkMid, marginTop: 4 }]}>Note: This is the Western (Tropical) zodiac based on calendar dates. Vedic (Sidereal) Sun sign may differ by one sign due to ayanamsa.</Text>
            </View>
            <View style={S.cardAccent}>
              <Text style={S.label}>Personality Number</Text>
              <Text style={[S.coverPillValue, { fontSize: 36, marginBottom: 4, color: C.purpleMid }]}>{data.personality}</Text>
              <Text style={S.bodySmall}>Derived from consonants in your name. Reflects how others perceive and experience you.</Text>
            </View>
          </View>
        </View>

        <View style={S.card}>
          <Text style={S.label}>Name Numerology Summary</Text>
          <View style={S.row}>
            <View style={S.col}><InfoRow label="Name Number (Chaldean)" value={String(data.nameNumber)} /></View>
            <View style={S.col}><InfoRow label="Soul Urge Number" value={String(data.soulUrge)} /></View>
            <View style={S.col}><InfoRow label="Personality Number" value={String(data.personality)} /></View>
          </View>
          <View style={[S.row, { marginTop: 10 }]}>
            <View style={S.col}><InfoRow label="Knowledge Plane Letters" value={String(namePlanes.knowledge)} /></View>
            <View style={S.col}><InfoRow label="Strength Plane Letters" value={String(namePlanes.strength)} /></View>
            <View style={S.col}><InfoRow label="Emotional Plane Letters" value={String(namePlanes.emotional)} /></View>
            <View style={S.col}><InfoRow label="Spiritual Plane Letters" value={String(namePlanes.spiritual)} /></View>
          </View>
        </View>

        <Footer name={data.name} section="Core Numbers Overview" />
      </Page>

      <SectionDividerPage number="02" title="Mulank Analysis" subtitle={`Psychic Number ${data.mulank} — Your Instinctive Self`} />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 02: MULANK ANALYSIS — Page 1                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="02" title={`Mulank ${data.mulank} — Psychic Number Analysis`} subtitle={`Ruling Planet: ${safe(muPlanet.name)} • Day: ${safe(muPlanet.day)}`} />

        <Body>{safe(mu.overview)}</Body>

        <SectionTitle>The Ruling Planet — {safe(muPlanet.name)}</SectionTitle>
        <View style={S.cardGold}>
          <View style={S.row}>
            <View style={S.col}>
              <InfoRow label="Planet" value={safe(muPlanet.name)} />
              <InfoRow label="Associated Day" value={safe(muPlanet.day)} />
              <InfoRow label="Color" value={safe(muPlanet.color)} />
            </View>
            <View style={S.col}>
              <InfoRow label="Gemstone" value={safe(muPlanet.gemstone)} />
              <InfoRow label="Metal" value={safe(muPlanet.metal)} />
            </View>
          </View>
          <Divider />
          <Body>{safe(muPlanet.description)}</Body>
        </View>

        <SectionTitle>Core Personality</SectionTitle>
        <Body>{safe(muPers.core)}</Body>
        <SubTitle>Emotional Nature</SubTitle>
        <Body>{safe(muPers.emotional)}</Body>
        <SubTitle>Social Behaviour</SubTitle>
        <Body>{safe(muPers.social)}</Body>

        <Footer name={data.name} section="Section 02 — Mulank Analysis" />
      </Page>

      {/* MULANK — Page 2 */}
      <Page size="A4" style={S.page}>
        <PH />
        <View style={[S.chapterBand, { marginBottom: 14 }]}>
          <Text style={S.chapterTitle}>Mulank {data.mulank} — Continued</Text>
        </View>

        <SubTitle>Intellectual Style</SubTitle>
        <Body>{safe(muPers.intellectual)}</Body>
        <SubTitle>Shadow Side & Hidden Traits</SubTitle>
        <Body>{safe(muPers.shadow)}</Body>

        <SectionTitle>Relationships, Finances & Spirituality</SectionTitle>
        <View style={S.row}>
          <View style={S.col}>
            <View style={S.card}>
              <SubTitle>Relationships</SubTitle>
              <Body>{safe(mu.relationships)}</Body>
            </View>
          </View>
          <View style={S.col}>
            <View style={S.card}>
              <SubTitle>Financial Tendencies</SubTitle>
              <Body>{safe(mu.finances)}</Body>
            </View>
          </View>
        </View>
        <View style={S.card}>
          <SubTitle>Spiritual Path</SubTitle>
          <Body>{safe(mu.spirituality)}</Body>
        </View>
        <View style={S.card}>
          <SubTitle>Health Tendencies</SubTitle>
          <Body>{safe(mu.health_tendencies)}</Body>
        </View>

        <Footer name={data.name} section="Section 02 — Mulank Analysis" />
      </Page>

      {/* MULANK — Page 3: Strengths & Weaknesses */}
      <Page size="A4" style={S.page}>
        <PH />
        <View style={[S.chapterBand, { marginBottom: 14 }]}>
          <Text style={S.chapterTitle}>Mulank {data.mulank} — Strengths & Weaknesses</Text>
        </View>

        <SectionTitle>Strengths</SectionTitle>
        {safeArr(mu.strengths).map((s, i) => {
          const item = safeObj(s);
          return (
            <View key={i} style={S.bulletRow}>
              <Text style={S.bulletDot}>✦</Text>
              <View style={{ flex: 1 }}>
                <Text style={[S.goldText, { fontSize: SMALL }]}>{safe(item.title)}</Text>
                <Text style={S.bodySmall}>{safe(item.description)}</Text>
              </View>
            </View>
          );
        })}

        <Divider />
        <SectionTitle>Areas for Growth</SectionTitle>
        {safeArr(mu.weaknesses).map((w, i) => {
          const item = safeObj(w);
          return (
            <View key={i} style={S.bulletRow}>
              <Text style={[S.bulletDot, { color: C.orange }]}>▸</Text>
              <View style={{ flex: 1 }}>
                <Text style={[S.goldText, { fontSize: SMALL, color: C.orange }]}>{safe(item.title)}</Text>
                <Text style={S.bodySmall}>{safe(item.description)}</Text>
              </View>
            </View>
          );
        })}

        <Footer name={data.name} section="Section 02 — Mulank Analysis" />
      </Page>

      {/* MULANK — Page 4: Periods & Famous */}
      <Page size="A4" style={S.page}>
        <PH />
        <View style={[S.chapterBand, { marginBottom: 14 }]}>
          <Text style={S.chapterTitle}>Mulank {data.mulank} — Periods & Famous Personalities</Text>
        </View>

        <View style={S.row}>
          <View style={S.col}>
            <View style={[S.card, { borderLeftWidth: 3, borderLeftColor: C.green }]}>
              <SectionTitle>Favorable Periods</SectionTitle>
              <View style={S.tagRow}>
                {safeArr(muFav.months).map((m, i) => (
                  <View key={i} style={S.tagGold}><Text style={S.tagGoldText}>{String(m)}</Text></View>
                ))}
              </View>
              <Text style={[S.body, { marginTop: 8 }]}>{safe(muFav.description)}</Text>
            </View>
          </View>
          <View style={S.col}>
            <View style={[S.card, { borderLeftWidth: 3, borderLeftColor: C.orange }]}>
              <SectionTitle>Unfavorable Periods</SectionTitle>
              <View style={S.tagRow}>
                {safeArr(muUnfav.months).map((m, i) => (
                  <View key={i} style={S.tag}><Text style={S.tagText}>{String(m)}</Text></View>
                ))}
              </View>
              <Text style={[S.body, { marginTop: 8 }]}>{safe(muUnfav.description)}</Text>
            </View>
          </View>
        </View>

        <View style={S.row}>
          <View style={S.col}>
            <View style={S.card}>
              <SectionTitle>Lucky Numbers</SectionTitle>
              <View style={S.tagRow}>
                {safeArr(mu.lucky_numbers).map((n, i) => (
                  <View key={i} style={S.tagGold}><Text style={[S.tagGoldText, { fontSize: BODY }]}>{String(n)}</Text></View>
                ))}
              </View>
            </View>
          </View>
          <View style={S.col}>
            <View style={S.card}>
              <SectionTitle>Numbers to Avoid</SectionTitle>
              <View style={S.tagRow}>
                {safeArr(mu.numbers_to_avoid).map((n, i) => (
                  <View key={i} style={S.tag}><Text style={[S.tagText, { color: C.orange, fontSize: BODY }]}>{String(n)}</Text></View>
                ))}
              </View>
            </View>
          </View>
        </View>

        <SectionTitle>Famous Personalities with Mulank {data.mulank}</SectionTitle>
        {safeArr(mu.famous_personalities).map((p, i) => {
          const person = safeObj(p);
          return (
            <View key={i} style={S.bulletRow}>
              <Text style={S.bulletDot}>★</Text>
              <View style={{ flex: 1 }}>
                <Text style={[S.goldText, { fontSize: SMALL }]}>{safe(person.name)}</Text>
                <Text style={S.bodySmall}>{safe(person.note)}</Text>
              </View>
            </View>
          );
        })}

        <Footer name={data.name} section="Section 02 — Mulank Analysis" />
      </Page>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 03: BHAGYANK ANALYSIS                                     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="03" title={`Bhagyank ${data.bhagyank} — Destiny Number Analysis`} subtitle="Life Path • Karmic Lessons • Major Life Themes" />

        <Body>{safe(bh.overview)}</Body>

        <SectionTitle>The Life Path</SectionTitle>
        <Body>{safe(bhLife.description)}</Body>
        <SubTitle>Life Purpose</SubTitle>
        <Body>{safe(bhLife.purpose)}</Body>
        <SubTitle>The Life Journey</SubTitle>
        <Body>{safe(bhLife.journey)}</Body>

        <SectionTitle>Key Life Years</SectionTitle>
        <View style={S.cardGold}>
          <Body>{safe(bh.key_life_years)}</Body>
        </View>

        <Footer name={data.name} section="Section 03 — Bhagyank Analysis" />
      </Page>

      {/* BHAGYANK — Page 2: Karmic Lessons & Themes */}
      <Page size="A4" style={S.page}>
        <PH />
        <View style={[S.chapterBand, { marginBottom: 14 }]}>
          <Text style={S.chapterTitle}>Bhagyank {data.bhagyank} — Karmic Lessons & Major Themes</Text>
        </View>

        <SectionTitle>Karmic Lessons</SectionTitle>
        {safeArr(bh.karmic_lessons).map((l, i) => {
          const lesson = safeObj(l);
          return (
            <View key={i} style={[S.card, { marginBottom: 10 }]}>
              <Text style={S.goldText}>{safe(lesson.lesson)}</Text>
              <Text style={[S.body, { marginTop: 4 }]}>{safe(lesson.description)}</Text>
            </View>
          );
        })}

        <SectionTitle>Major Life Themes</SectionTitle>
        {safeArr(bh.major_themes).map((t, i) => {
          const theme = safeObj(t);
          return (
            <View key={i} style={S.bulletRow}>
              <Text style={S.bulletDot}>◆</Text>
              <View style={{ flex: 1 }}>
                <Text style={[S.goldText, { fontSize: SMALL }]}>{safe(theme.theme)}</Text>
                <Text style={S.bodySmall}>{safe(theme.description)}</Text>
              </View>
            </View>
          );
        })}

        <SectionTitle>Secondary Traits</SectionTitle>
        <View style={S.row}>
          <View style={S.col}>
            <View style={[S.card, { borderLeftColor: C.green, borderLeftWidth: 3 }]}>
              <SubTitle>Positive Secondary Traits</SubTitle>
              <Body>{safe(bhSecondary.positive)}</Body>
            </View>
          </View>
          <View style={S.col}>
            <View style={[S.card, { borderLeftColor: C.orange, borderLeftWidth: 3 }]}>
              <SubTitle>Challenging Secondary Traits</SubTitle>
              <Body>{safe(bhSecondary.challenging)}</Body>
            </View>
          </View>
        </View>

        <Footer name={data.name} section="Section 03 — Bhagyank Analysis" />
      </Page>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 04: COMBINATION INSIGHT                                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="04" title={`Mulank ${data.mulank} + Bhagyank ${data.bhagyank} Combination`} subtitle="How your two core numbers interact and shape your destiny" />

        <View style={S.cardGold}>
          <Body>{safe(bhCombo.overview)}</Body>
        </View>
        <SectionTitle>Combined Strengths</SectionTitle>
        <Body>{safe(bhCombo.strengths)}</Body>
        <SectionTitle>Combination Challenges</SectionTitle>
        <Body>{safe(bhCombo.challenges)}</Body>
        <SectionTitle>Practical Advice</SectionTitle>
        <View style={S.card}>
          <Body>{safe(bhCombo.advice)}</Body>
        </View>
        <SectionTitle>Life Lessons Summary</SectionTitle>
        <Body>{safe(bh.life_lessons)}</Body>

        <Footer name={data.name} section="Section 04 — Combination Insight" />
      </Page>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 05: ASTROLOGICAL & SPIRITUAL CONTEXT                      */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="05" title="Astrological & Spiritual Context" subtitle={`Western Zodiac: ${data.zodiac.sign} • Ruling Planet: ${data.zodiac.rulingPlanet}`} />

        <SectionTitle>Western Zodiac: {data.zodiac.sign}</SectionTitle>
        <View style={S.row}>
          <View style={S.col}>
            <InfoRow label="Element" value={data.zodiac.element} />
            <InfoRow label="Quality" value={data.zodiac.quality} />
            <InfoRow label="Ruling Planet" value={data.zodiac.rulingPlanet} />
          </View>
        </View>
        <Body>{safe(zodiacAI.overview)}</Body>
        <SubTitle>Behavioural Traits</SubTitle>
        <Body>{safe(zodiacAI.traits)}</Body>
        <SubTitle>Ruling Planet Influence</SubTitle>
        <Body>{safe(zodiacAI.ruling_planet_influence)}</Body>
        <SubTitle>Element Influence</SubTitle>
        <Body>{safe(zodiacAI.element_influence)}</Body>
        <SubTitle>Shadow Traits</SubTitle>
        <Body>{safe(zodiacAI.shadow_traits)}</Body>

        <Footer name={data.name} section="Section 05 — Astrological Context" />
      </Page>

      {/* SPIRITUAL CONTEXT — Deity & Rituals */}
      <Page size="A4" style={S.page}>
        <PH />
        <View style={[S.chapterBand, { marginBottom: 14 }]}>
          <Text style={S.chapterTitle}>Ruling Deity & Spiritual Practices</Text>
        </View>

        <View style={S.cardGold}>
          <Text style={[S.goldText, { fontSize: 16, marginBottom: 6 }]}>Deity: {safe(deityAI.name)}</Text>
          <InfoRow label="Planet Association" value={safe(deityAI.planet_association)} />
          <InfoRow label="Day for Worship / Fasting" value={safe(deityAI.day_for_worship)} />
          <Divider />
          <SubTitle>About This Deity</SubTitle>
          <Body>{safe(deityAI.description)}</Body>
        </View>

        <SectionTitle>Fasting Guidelines</SectionTitle>
        <View style={S.card}>
          <Body>{safe(deityAI.fasting_rules)}</Body>
        </View>

        <SectionTitle>Worship Ritual</SectionTitle>
        <View style={S.card}>
          <Body>{safe(deityAI.ritual)}</Body>
        </View>

        <SectionTitle>Deity Mantra</SectionTitle>
        <View style={S.card}>
          <Text style={S.mantraText}>{safe(deityAI.mantra)}</Text>
        </View>

        <SectionTitle>Charity Recommendation</SectionTitle>
        <Body>{safe(deityAI.charity)}</Body>

        <Footer name={data.name} section="Section 05 — Spiritual Context" />
      </Page>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 06: LUCKY VARIABLES                                        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="06" title="Lucky Variables" subtitle="Numbers, Colors, Dates, Gemstones & More" />

        <View style={S.row}>
          <View style={S.col}>
            <View style={S.cardGold}>
              <SubTitle>Lucky Numbers</SubTitle>
              <View style={S.tagRow}>
                {safeArr(muLucky.numbers).map((n, i) => (
                  <View key={i} style={S.tagGold}><Text style={[S.tagGoldText, { fontSize: 13 }]}>{String(n)}</Text></View>
                ))}
              </View>
              <Text style={[S.bodySmall, { marginTop: 8 }]}>{safe(muLucky.numbers_explanation)}</Text>
            </View>
            <View style={S.card}>
              <SubTitle>Numbers to Avoid</SubTitle>
              <View style={S.tagRow}>
                {safeArr(muLucky.numbers_to_avoid).map((n, i) => (
                  <View key={i} style={S.tag}><Text style={[S.tagText, { color: C.orange }]}>{String(n)}</Text></View>
                ))}
              </View>
              <Text style={[S.bodySmall, { marginTop: 8 }]}>{safe(muLucky.avoid_explanation)}</Text>
            </View>
            <View style={S.card}>
              <SubTitle>Lucky Colors</SubTitle>
              <View style={S.tagRow}>
                {safeArr(muLucky.colors).map((c, i) => (
                  <View key={i} style={S.tagGold}><Text style={S.tagGoldText}>{String(c)}</Text></View>
                ))}
              </View>
              <Text style={[S.bodySmall, { marginTop: 8 }]}>{safe(muLucky.colors_explanation)}</Text>
            </View>
          </View>
          <View style={S.col}>
            <View style={S.card}>
              <SubTitle>Gemstone Recommendation</SubTitle>
              <InfoRow label="Primary Gemstone" value={safe(safeObj(muLucky.gemstone).primary)} />
              <InfoRow label="Secondary Gemstone" value={safe(safeObj(muLucky.gemstone).secondary)} />
              <InfoRow label="How to Wear" value={safe(safeObj(muLucky.gemstone).how_to_wear)} />
              <Text style={[S.bodySmall, { marginTop: 6 }]}>Energising Mantra: {safe(safeObj(muLucky.gemstone).mantra_for_energising)}</Text>
            </View>
            <View style={S.card}>
              <SubTitle>Bracelet</SubTitle>
              <Body>{safe(muLucky.bracelet)}</Body>
            </View>
            <View style={S.card}>
              <SubTitle>Other Lucky Variables</SubTitle>
              <InfoRow label="Lucky Day" value={safe(muLucky.lucky_day)} />
              <InfoRow label="Lucky Metal" value={safe(muLucky.lucky_metal)} />
              <InfoRow label="Lucky Dates of Month" value={safeArr(muLucky.dates).join(', ') || '—'} />
              <InfoRow label="Lucky Years" value={safeArr(muLucky.years).join(', ') || '—'} />
              <InfoRow label="Lucky Directions" value={safeArr(muLucky.lucky_directions).join(', ') || '—'} />
            </View>
            <View style={S.card}>
              <SubTitle>Lucky Business Names</SubTitle>
              <Body>{safe(muLucky.favorable_business_names)}</Body>
            </View>
          </View>
        </View>

        <Footer name={data.name} section="Section 06 — Lucky Variables" />
      </Page>

      <SectionDividerPage number="07" title="Compatibility" subtitle="Friendship, Business & Romance — All 9 Numbers" />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 07: COMPATIBILITY — Friendship                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="07" title="Compatibility Analysis — Friendship" subtitle={`How Mulank ${data.mulank} relates to each of the 9 Mulanks in friendship`} />

        {[1, 2, 3, 4, 5].map((n) => {
          const entry = safeObj(safeObj(co.friendship)[String(n)]);
          const rating = safe(entry.rating, 'Average');
          return (
            <View key={n} style={[S.card, { marginBottom: 10 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <View style={S.badge}><Text style={S.badgeText}>{n}</Text></View>
                <Text style={[S.goldText, { flex: 1 }]}>Mulank {data.mulank} + Mulank {n}</Text>
                <View style={ratingBadge(rating)}><Text style={ratingText(rating)}>{rating}</Text></View>
              </View>
              <Body>{safe(entry.description)}</Body>
            </View>
          );
        })}

        <Footer name={data.name} section="Section 07 — Compatibility (Friendship)" />
      </Page>

      <Page size="A4" style={S.page}>
        <PH />
        <View style={[S.chapterBand, { marginBottom: 14 }]}>
          <Text style={S.chapterTitle}>Compatibility — Friendship (Continued)</Text>
        </View>

        {[6, 7, 8, 9].map((n) => {
          const entry = safeObj(safeObj(co.friendship)[String(n)]);
          const rating = safe(entry.rating, 'Average');
          return (
            <View key={n} style={[S.card, { marginBottom: 10 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <View style={S.badge}><Text style={S.badgeText}>{n}</Text></View>
                <Text style={[S.goldText, { flex: 1 }]}>Mulank {data.mulank} + Mulank {n}</Text>
                <View style={ratingBadge(rating)}><Text style={ratingText(rating)}>{rating}</Text></View>
              </View>
              <Body>{safe(entry.description)}</Body>
            </View>
          );
        })}

        <Footer name={data.name} section="Section 07 — Compatibility (Friendship)" />
      </Page>

      {/* COMPATIBILITY — Business */}
      <Page size="A4" style={S.page}>
        <PH />
        <View style={[S.chapterBand, { marginBottom: 14 }]}>
          <Text style={S.chapterTitle}>Compatibility — Business Partnership</Text>
        </View>

        {[1, 2, 3, 4, 5].map((n) => {
          const entry = safeObj(safeObj(co.business)[String(n)]);
          const rating = safe(entry.rating, 'Average');
          return (
            <View key={n} style={[S.card, { marginBottom: 10 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <View style={[S.badge, { backgroundColor: C.purpleMid }]}><Text style={S.badgeText}>{n}</Text></View>
                <Text style={[S.goldText, { flex: 1 }]}>Mulank {data.mulank} + Mulank {n} — Business</Text>
                <View style={ratingBadge(rating)}><Text style={ratingText(rating)}>{rating}</Text></View>
              </View>
              <Body>{safe(entry.description)}</Body>
            </View>
          );
        })}

        <Footer name={data.name} section="Section 07 — Compatibility (Business)" />
      </Page>

      <Page size="A4" style={S.page}>
        <PH />
        <View style={[S.chapterBand, { marginBottom: 14 }]}>
          <Text style={S.chapterTitle}>Compatibility — Business (Continued) & Romance</Text>
        </View>

        {[6, 7, 8, 9].map((n) => {
          const entry = safeObj(safeObj(co.business)[String(n)]);
          const rating = safe(entry.rating, 'Average');
          return (
            <View key={n} style={[S.card, { marginBottom: 8 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <View style={[S.badge, { backgroundColor: C.purpleMid }]}><Text style={S.badgeText}>{n}</Text></View>
                <Text style={[S.goldText, { flex: 1 }]}>Mulank {data.mulank} + Mulank {n} — Business</Text>
                <View style={ratingBadge(rating)}><Text style={ratingText(rating)}>{rating}</Text></View>
              </View>
              <Body>{safe(entry.description)}</Body>
            </View>
          );
        })}

        <Divider />
        <SectionTitle>Romance & Relationships</SectionTitle>
        <Body>{safe(coRomance.overview)}</Body>
        <SubTitle>Ideal Partner Profile</SubTitle>
        <Body>{safe(coRomance.ideal_partner_profile)}</Body>
        <View style={S.row}>
          <View style={S.col}>
            <SubTitle>Most Compatible Mulanks</SubTitle>
            <View style={S.tagRow}>
              {safeArr(coRomance.ideal_mulank_numbers).map((n, i) => (
                <View key={i} style={S.tagGold}><Text style={[S.tagGoldText, { fontSize: BODY }]}>{String(n)}</Text></View>
              ))}
            </View>
            <Text style={[S.bodySmall, { marginTop: 6 }]}>{safe(coRomance.ideal_explanation)}</Text>
          </View>
          <View style={S.col}>
            <SubTitle>Challenging Mulanks</SubTitle>
            <View style={S.tagRow}>
              {safeArr(coRomance.challenging_numbers).map((n, i) => (
                <View key={i} style={S.tag}><Text style={[S.tagText, { color: C.orange }]}>{String(n)}</Text></View>
              ))}
            </View>
            <Text style={[S.bodySmall, { marginTop: 6 }]}>{safe(coRomance.challenging_explanation)}</Text>
          </View>
        </View>

        <Footer name={data.name} section="Section 07 — Compatibility" />
      </Page>

      {/* ROMANCE — continued */}
      <Page size="A4" style={S.page}>
        <PH />
        <View style={[S.chapterBand, { marginBottom: 14 }]}>
          <Text style={S.chapterTitle}>Romance & Relationships — Continued</Text>
        </View>
        <SubTitle>Relationship Strengths</SubTitle>
        <Body>{safe(coRomance.relationship_strengths)}</Body>
        <SubTitle>Relationship Challenges</SubTitle>
        <Body>{safe(coRomance.relationship_challenges)}</Body>
        <SubTitle>Love Life Advice</SubTitle>
        <View style={S.cardGold}>
          <Body>{safe(coRomance.advice)}</Body>
        </View>
        <Footer name={data.name} section="Section 07 — Romance" />
      </Page>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 08: HEALTH                                                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="08" title="Health Blueprint" subtitle="Physical Vulnerabilities • Decade-wise Analysis • Diet & Lifestyle" />

        <Body>{safe(hcHealth.overview)}</Body>
        <SubTitle>Ruling Planet's Influence on the Body</SubTitle>
        <Body>{safe(hcHealth.ruling_planet_body)}</Body>

        <SectionTitle>Vulnerable Body Systems</SectionTitle>
        {safeArr(hcHealth.vulnerable_systems).map((vs, i) => {
          const item = safeObj(vs);
          return (
            <View key={i} style={S.bulletRow}>
              <Text style={[S.bulletDot, { color: C.orange }]}>▸</Text>
              <View style={{ flex: 1 }}>
                <Text style={[S.goldText, { fontSize: SMALL, color: C.orange }]}>{safe(item.system)}</Text>
                <Text style={S.bodySmall}>{safe(item.description)}</Text>
              </View>
            </View>
          );
        })}

        <Footer name={data.name} section="Section 08 — Health Blueprint" />
      </Page>

      {/* HEALTH — Decade & Lifestyle */}
      <Page size="A4" style={S.page}>
        <PH />
        <View style={[S.chapterBand, { marginBottom: 14 }]}>
          <Text style={S.chapterTitle}>Health — Decade-wise Analysis & Lifestyle</Text>
        </View>

        <SectionTitle>Health Through the Decades</SectionTitle>
        <View style={S.row}>
          <View style={S.col}>
            <View style={S.card}>
              <SubTitle>Childhood</SubTitle>
              <Body>{safe(hcDecade.childhood)}</Body>
            </View>
            <View style={S.card}>
              <SubTitle>Youth (20s–30s)</SubTitle>
              <Body>{safe(hcDecade.youth)}</Body>
            </View>
          </View>
          <View style={S.col}>
            <View style={S.card}>
              <SubTitle>Middle Age (40s–50s)</SubTitle>
              <Body>{safe(hcDecade.middle_age)}</Body>
            </View>
            <View style={S.card}>
              <SubTitle>Senior Years (60+)</SubTitle>
              <Body>{safe(hcDecade.senior)}</Body>
            </View>
          </View>
        </View>

        <SectionTitle>Diet & Nutrition</SectionTitle>
        <View style={S.row}>
          <View style={S.col}>
            <SubTitle>Foods to Include</SubTitle>
            <BulletList items={safeArr(hcDiet.foods_to_include).map(String)} />
          </View>
          <View style={S.col}>
            <SubTitle>Foods to Avoid</SubTitle>
            <BulletList items={safeArr(hcDiet.foods_to_avoid).map(String)} />
          </View>
        </View>
        <Body>{safe(hcDiet.dietary_advice)}</Body>

        <SectionTitle>Lifestyle Recommendations</SectionTitle>
        <SubTitle>Exercise</SubTitle><Body>{safe(hcLifestyle.exercise)}</Body>
        <SubTitle>Sleep</SubTitle><Body>{safe(hcLifestyle.sleep)}</Body>
        <SubTitle>Stress Management</SubTitle><Body>{safe(hcLifestyle.stress_management)}</Body>
        <SubTitle>Mental Health</SubTitle><Body>{safe(hcHealth.mental_health)}</Body>

        <Footer name={data.name} section="Section 08 — Health Blueprint" />
      </Page>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 09: CAREER                                                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="09" title="Career & Profession Mapping" subtitle="Ideal Professions • Business vs Service • Peak Career Periods" />

        <Body>{safe(hcCareer.overview)}</Body>

        <SectionTitle>Ideal Professions</SectionTitle>
        {safeArr(hcCareer.ideal_professions).map((p, i) => {
          const prof = safeObj(p);
          return (
            <View key={i} style={S.bulletRow}>
              <Text style={S.bulletDot}>✦</Text>
              <View style={{ flex: 1 }}>
                <Text style={[S.goldText, { fontSize: SMALL }]}>{safe(prof.profession)}</Text>
                <Text style={S.bodySmall}>{safe(prof.why)}</Text>
              </View>
            </View>
          );
        })}

        <Footer name={data.name} section="Section 09 — Career Mapping" />
      </Page>

      {/* CAREER — continued */}
      <Page size="A4" style={S.page}>
        <PH />
        <View style={[S.chapterBand, { marginBottom: 14 }]}>
          <Text style={S.chapterTitle}>Career — Business vs Service & Growth</Text>
        </View>

        <SectionTitle>Business vs. Service / Employment</SectionTitle>
        <View style={S.cardGold}><Body>{safe(hcCareer.business_vs_service)}</Body></View>

        <SectionTitle>Leadership Style</SectionTitle>
        <Body>{safe(hcCareer.leadership_style)}</Body>

        <View style={S.row}>
          <View style={S.col}>
            <View style={[S.card, { borderLeftColor: C.green, borderLeftWidth: 3 }]}>
              <SubTitle>Career Strengths</SubTitle>
              <Body>{safe(hcCareer.career_strengths)}</Body>
            </View>
          </View>
          <View style={S.col}>
            <View style={[S.card, { borderLeftColor: C.orange, borderLeftWidth: 3 }]}>
              <SubTitle>Career Challenges</SubTitle>
              <Body>{safe(hcCareer.career_challenges)}</Body>
            </View>
          </View>
        </View>

        <SectionTitle>Peak Career Periods</SectionTitle>
        <View style={S.card}><Body>{safe(hcCareer.peak_career_periods)}</Body></View>
        <SubTitle>Financial Earning Pattern</SubTitle>
        <Body>{safe(hcCareer.financial_earning_pattern)}</Body>
        <SubTitle>Ideal Work Environment</SubTitle>
        <Body>{safe(hcCareer.ideal_work_environment)}</Body>

        <Footer name={data.name} section="Section 09 — Career Mapping" />
      </Page>

      <SectionDividerPage number="10" title="Fortune Grid" subtitle="Lo Shu Grid — The Map of Your Life Energy" />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 10: LO SHU GRID                                          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="10" title="Fortune Grid — Lo Shu Analysis" subtitle={`Present: ${Object.entries(loShuGrid.frequencies).filter(([,v])=>v>0).map(([k,v])=>`${k}×${v}`).join(', ')} • Missing: ${loShuGrid.missing.join(', ') || 'None'}`} />

        <Body>{safe(lsGrid.intro)}</Body>
        <Body>{safe(lsGrid.grid_overview)}</Body>

        <LoShuGridView grid={loShuGrid} />

        <View style={S.row}>
          <View style={S.col}>
            <View style={S.card}>
              <SubTitle>Mental Plane (4–9–2)</SubTitle>
              <Body>{safe(safeObj(lsPlanes.mental_plane).description)}</Body>
            </View>
            <View style={S.card}>
              <SubTitle>Physical Plane (3–5–7)</SubTitle>
              <Body>{safe(safeObj(lsPlanes.physical_plane).description)}</Body>
            </View>
          </View>
          <View style={S.col}>
            <View style={S.card}>
              <SubTitle>Emotional Plane (8–1–6)</SubTitle>
              <Body>{safe(safeObj(lsPlanes.emotional_plane).description)}</Body>
            </View>
            <View style={S.card}>
              <SubTitle>Spiritual Plane (4–3–8)</SubTitle>
              <Body>{safe(safeObj(lsPlanes.spiritual_plane).description)}</Body>
            </View>
          </View>
        </View>

        <Footer name={data.name} section="Section 10 — Lo Shu Grid" />
      </Page>

      {/* LO SHU — Frequency Analysis */}
      <Page size="A4" style={S.page}>
        <PH />
        <View style={[S.chapterBand, { marginBottom: 14 }]}>
          <Text style={S.chapterTitle}>Lo Shu — Number Frequency Analysis</Text>
        </View>

        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
          const count = loShuGrid.frequencies[n] ?? 0;
          if (count === 0) return null;
          const entry = safeObj(lsFreq[String(n)]);
          return (
            <View key={n} style={[S.card, { marginBottom: 10 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <View style={S.badge}><Text style={S.badgeText}>{n}</Text></View>
                <Text style={[S.goldText, { flex: 1 }]}>Number {n} — Appears {count} time{count > 1 ? 's' : ''}</Text>
              </View>
              <Body>{safe(entry.interpretation)}</Body>
            </View>
          );
        })}

        <Footer name={data.name} section="Section 10 — Lo Shu Frequency" />
      </Page>

      {/* LO SHU — Missing Numbers */}
      {loShuGrid.missing.length > 0 && (
        <Page size="A4" style={S.page}>
          <View style={[S.chapterBand, { marginBottom: 14 }]}>
            <Text style={S.chapterTitle}>Lo Shu — Missing Number Analysis</Text>
          </View>

          {loShuGrid.missing.map((n) => {
            const entry = safeObj(lsMissing[String(n)]);
            return (
              <View key={n} style={[S.card, { borderLeftColor: C.orange, borderLeftWidth: 3, marginBottom: 12 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <View style={[S.badge, { backgroundColor: C.parchmentDeep }]}><Text style={[S.badgeText, { color: C.orange }]}>{n}</Text></View>
                  <Text style={[S.goldText, { color: C.orange, flex: 1 }]}>Missing Number {n}</Text>
                </View>
                <SubTitle>Traits Lacking</SubTitle>
                <Body>{safe(entry.traits_lacking)}</Body>
                <SubTitle>Life Impact</SubTitle>
                <Body>{safe(entry.life_impact)}</Body>
                <SubTitle>Remedy Overview</SubTitle>
                <Body>{safe(entry.remedy_overview)}</Body>
              </View>
            );
          })}

          <Footer name={data.name} section="Section 10 — Missing Numbers" />
        </Page>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 11: FENG SHUI & KUA                                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="11" title={`Feng Shui & Kua Number ${data.kua.kuaNumber}`} subtitle={`${data.kua.element} Element • Lucky Directions & Spatial Guidance`} />

        <View style={S.cardGold}>
          <Text style={[S.goldText, { fontSize: 14, marginBottom: 6 }]}>Kua Number {data.kua.kuaNumber} — {data.kua.element} Element</Text>
          <Body>{safe(fengShui.kua_overview)}</Body>
          <Divider />
          <Body>{safe(fengShui.element_description)}</Body>
        </View>

        <SectionTitle>Lucky Directions</SectionTitle>
        <View style={S.table}>
          <View style={S.thead}>
            <Text style={[S.th, { flex: 0.6 }]}>Purpose</Text>
            <Text style={[S.th, { flex: 0.5 }]}>Direction</Text>
            <Text style={[S.th, { flex: 2 }]}>How to Use</Text>
          </View>
          {[
            ['Success', fsDirs.success],
            ['Health', fsDirs.health],
            ['Relationship', fsDirs.relationship],
            ['Personal Growth', fsDirs.personal_growth],
          ].map(([purpose, d], i) => {
            const dir = safeObj(d);
            return (
              <View key={i} style={i % 2 === 0 ? S.trow : S.trowAlt}>
                <Text style={[S.td, { flex: 0.6, color: C.gold, fontFamily: 'Helvetica-Bold' }]}>{String(purpose)}</Text>
                <Text style={[S.td, { flex: 0.5, fontFamily: 'Helvetica-Bold' }]}>{safe(dir.direction)}</Text>
                <Text style={[S.td, { flex: 2 }]}>{safe(dir.use)}</Text>
              </View>
            );
          })}
        </View>

        <SectionTitle>Unlucky Directions</SectionTitle>
        <View style={S.tagRow}>
          {safeArr(fengShui.unlucky_directions).map((d, i) => (
            <View key={i} style={S.tag}><Text style={[S.tagText, { color: C.orange }]}>{String(d)}</Text></View>
          ))}
        </View>

        <SectionTitle>Home & Office Advice</SectionTitle>
        <View style={S.row}>
          <View style={S.col}><View style={S.card}><SubTitle>Home Setup</SubTitle><Body>{safe(fengShui.home_advice)}</Body></View></View>
          <View style={S.col}><View style={S.card}><SubTitle>Office Setup</SubTitle><Body>{safe(fengShui.office_advice)}</Body></View></View>
        </View>

        <SubTitle>Feng Shui Cures & Remedies</SubTitle>
        <Body>{safe(fengShui.feng_shui_cures)}</Body>

        <Footer name={data.name} section="Section 11 — Feng Shui & Kua" />
      </Page>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 12: NAME NUMEROLOGY                                        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="12" title="Name Numerology" subtitle={`Name: ${data.name} • Chaldean Name No. ${data.nameNumber} • Soul Urge ${data.soulUrge} • Personality ${data.personality}`} />

        <View style={S.row}>
          <View style={S.col}>
            <View style={S.cardGold}>
              <Text style={S.label}>Name Number (Chaldean)</Text>
              <Text style={[S.coverPillValue, { fontSize: 28 }]}>{data.nameNumber}</Text>
              <Body>{safe(nameNumNumber.overview)}</Body>
              <Divider />
              <Body>{safe(nameNumNumber.alignment_with_mulank)}</Body>
            </View>
          </View>
          <View style={S.col}>
            <View style={S.cardAccent}>
              <Text style={S.label}>Soul Urge Number</Text>
              <Text style={[S.coverPillValue, { fontSize: 28, color: C.purpleMid }]}>{data.soulUrge}</Text>
              <Body>{safe(nameNumSoul.overview)}</Body>
              <Divider />
              <Body>{safe(nameNumSoul.how_it_manifests)}</Body>
            </View>
          </View>
        </View>

        <View style={S.cardAccent}>
          <Text style={S.label}>Personality Number</Text>
          <Text style={[S.coverPillValue, { fontSize: 28, color: C.purpleMid }]}>{data.personality}</Text>
          <Body>{safe(nameNumPersonality.overview)}</Body>
          <Divider />
          <Body>{safe(nameNumPersonality.first_impressions)}</Body>
        </View>

        <Footer name={data.name} section="Section 12 — Name Numerology" />
      </Page>

      {/* NAME — Planes */}
      <Page size="A4" style={S.page}>
        <PH />
        <View style={[S.chapterBand, { marginBottom: 14 }]}>
          <Text style={S.chapterTitle}>Name Grid Planes — "{data.name}"</Text>
        </View>

        {[
          { key: 'knowledge', label: 'Knowledge Plane', letters: namePlanes.letters.knowledge, count: namePlanes.knowledge, desc: 'B, H, J, P, Y — Intellectual & Mental ability' },
          { key: 'strength', label: 'Strength Plane', letters: namePlanes.letters.strength, count: namePlanes.strength, desc: 'D, M, T — Physical resilience & willpower' },
          { key: 'emotional', label: 'Emotional Plane', letters: namePlanes.letters.emotional, count: namePlanes.emotional, desc: 'A, C, F, I, L, O, S — Emotional intelligence & sensitivity' },
          { key: 'spiritual', label: 'Spiritual Plane', letters: namePlanes.letters.spiritual, count: namePlanes.spiritual, desc: 'E, G, K, N, Q, R, U, V, W, X, Z — Intuition & spiritual connection' },
        ].map(({ key, label, letters, count, desc }) => {
          const planeAI = safeObj(namePlanesAI[key]);
          return (
            <View key={key} style={[S.card, { marginBottom: 14 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={S.goldText}>{label}</Text>
                <Text style={[S.goldText, { fontSize: 18 }]}>{count} letters</Text>
              </View>
              <Text style={[S.bodySmall, { color: C.inkMid, marginBottom: 6 }]}>{desc}</Text>
              <View style={S.tagRow}>
                {letters.map((l, i) => <View key={i} style={S.tag}><Text style={S.tagText}>{l}</Text></View>)}
                {letters.length === 0 && <Text style={S.bodySmall}>None present</Text>}
              </View>
              <Divider />
              <Body>{safe(planeAI.description)}</Body>
            </View>
          );
        })}

        <Footer name={data.name} section="Section 12 — Name Planes" />
      </Page>

      <SectionDividerPage number="13" title="12-Month Forecast" subtitle="Your Personal Year & Monthly Energy Predictions" />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 13: 12-MONTH FORECAST                                     */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {[0, 1].map((batch) => (
        <Page key={batch} size="A4" style={S.page}>
          <PH />
          {batch === 0 && <ChapterHeader number="13" title="12-Month Rolling Forecast" subtitle="Personal Month Themes • Focus Areas • Warnings • Power Days & Affirmations" />}
          {batch === 1 && <View style={[S.chapterBand, { marginBottom: 14 }]}><Text style={S.chapterTitle}>12-Month Forecast — Continued</Text></View>}

          {frForecast.slice(batch * 6, batch * 6 + 6).map((m, i) => {
            const month = safeObj(m);
            return (
              <View key={i} style={[S.cardGold, { marginBottom: 12 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={[S.goldText, { fontSize: 13 }]}>{safe(month.month)}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <View style={S.tag}><Text style={S.tagText}>PY {safe(month.personal_year)}</Text></View>
                    <View style={S.tagGold}><Text style={[S.tagGoldText, { fontFamily: 'Helvetica-Bold' }]}>PM {safe(month.personal_month)}</Text></View>
                  </View>
                </View>
                <Text style={[S.highlight, { marginBottom: 4 }]}>{safe(month.theme)}</Text>
                <Body>{safe(month.overview)}</Body>
                <View style={S.row}>
                  <View style={S.col}>
                    <Text style={[S.bodySmall, { color: C.green, fontFamily: 'Helvetica-Bold', marginTop: 4 }]}>Focus On:</Text>
                    <Text style={S.bodySmall}>{safe(month.what_to_focus_on)}</Text>
                  </View>
                  <View style={S.col}>
                    <Text style={[S.bodySmall, { color: C.orange, fontFamily: 'Helvetica-Bold', marginTop: 4 }]}>Avoid:</Text>
                    <Text style={S.bodySmall}>{safe(month.what_to_avoid)}</Text>
                  </View>
                </View>
                <Text style={[S.bodySmall, { color: C.inkMid, marginTop: 4 }]}>Power Days: {safe(month.power_days)}</Text>
                <Text style={[S.bodySmall, { color: C.goldDeep, fontFamily: 'Helvetica-Bold', marginTop: 4 }]}>"{safe(month.affirmation)}"</Text>
              </View>
            );
          })}

          <Footer name={data.name} section="Section 13 — 12-Month Forecast" />
        </Page>
      ))}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 14: LIFE CYCLES                                           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="14" title="Challenge of Life — Life Cycles" subtitle="Four Life Phases • Challenge Numbers • Themes, Lessons & Advice" />

        {(frCycles.length > 0 ? frCycles : challengeNumbers.phases.map((p) => ({
          phase: p.phase, age_range: p.ageRange, challenge_number: p.challenge,
          overview: '', key_lessons: '', opportunities: '', pitfalls: '', advice: '',
        }))).map((cycle) => {
          const c = safeObj(cycle);
          return (
            <View key={String(c.phase)} style={[S.cardGold, { marginBottom: 14 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <View style={S.badge}><Text style={S.badgeText}>{String(c.challenge_number)}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={[S.goldText, { fontSize: 14 }]}>Phase {String(c.phase)} — Challenge Number {String(c.challenge_number)}</Text>
                  <Text style={[S.bodySmall, { color: C.inkMid }]}>Age {String(c.age_range)}</Text>
                </View>
              </View>
              <Body>{safe(c.overview)}</Body>
              <View style={S.row}>
                <View style={S.col}>
                  <SubTitle>Key Lessons</SubTitle>
                  <Text style={S.bodySmall}>{safe(c.key_lessons)}</Text>
                </View>
                <View style={S.col}>
                  <SubTitle>Opportunities</SubTitle>
                  <Text style={S.bodySmall}>{safe(c.opportunities)}</Text>
                </View>
              </View>
              <SubTitle>Pitfalls to Avoid</SubTitle>
              <Text style={S.bodySmall}>{safe(c.pitfalls)}</Text>
              <SubTitle>Navigating This Phase</SubTitle>
              <Text style={[S.bodySmall, { color: C.goldDeep }]}>{safe(c.advice)}</Text>
            </View>
          );
        })}

        <Footer name={data.name} section="Section 14 — Life Cycles" />
      </Page>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 15: REMEDIES & MANTRAS                                    */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {loShuGrid.missing.length > 0 && (
        <Page size="A4" style={S.page}>
          <PH />
          <ChapterHeader number="15a" title="Missing Number Remedies" subtitle="Vastu • Feng Shui • Charity • Bracelet for Each Missing Number" />

          {loShuGrid.missing.map((n) => {
            const r = safeObj(frRemedies[`missing_${n}`]);
            return (
              <View key={n} style={[S.card, { marginBottom: 14, borderLeftColor: C.orange, borderLeftWidth: 3 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <View style={[S.badge, { backgroundColor: C.parchmentDeep }]}><Text style={[S.badgeText, { color: C.orange }]}>{n}</Text></View>
                  <Text style={[S.goldText, { color: C.orange }]}>Remedy for Missing Number {n}</Text>
                </View>
                <Body>{safe(r.overview)}</Body>
                <View style={S.row}>
                  <View style={S.col}>
                    <SubTitle>Vastu Fix</SubTitle><Text style={S.bodySmall}>{safe(r.vastu_fix)}</Text>
                    <SubTitle>Feng Shui Item</SubTitle><Text style={S.bodySmall}>{safe(r.feng_shui_item)}</Text>
                  </View>
                  <View style={S.col}>
                    <SubTitle>Charity</SubTitle><Text style={S.bodySmall}>{safe(r.charity)}</Text>
                    <SubTitle>Bracelet</SubTitle><Text style={S.bodySmall}>{safe(r.bracelet)}</Text>
                  </View>
                </View>
                <SubTitle>Additional Remedy</SubTitle>
                <Text style={S.bodySmall}>{safe(r.additional_remedy)}</Text>
              </View>
            );
          })}

          <Footer name={data.name} section="Section 15 — Remedies" />
        </Page>
      )}

      {/* MANTRAS */}
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="15b" title="Sacred Mantras" subtitle="Career • Health • Marriage • Wealth — with Pronunciation & Instructions" />

        {Object.entries(frMantras).map(([purpose, m]) => {
          const mantra = (m ?? {}) as Record<string, unknown>;
          return (
            <View key={purpose} style={[S.cardGold, { marginBottom: 16 }]}>
              <Text style={[S.goldText, { fontSize: 14, textTransform: 'capitalize', marginBottom: 4 }]}>{purpose} Mantra</Text>
              <InfoRow label="Deity" value={safe(mantra.deity)} />
              <Text style={S.mantraText}>{safe(mantra.text)}</Text>
              <Text style={[S.bodySmall, { color: C.inkLight, textAlign: 'center', marginBottom: 8 }]}>
                Meaning: {safe(mantra.meaning)}
              </Text>
              <Divider />
              <SubTitle>Pronunciation</SubTitle>
              <Text style={S.bodySmall}>{safe(mantra.pronunciation)}</Text>
              <SubTitle>How to Chant</SubTitle>
              <Text style={S.bodySmall}>{safe(mantra.chanting_instructions)}</Text>
              <SubTitle>Benefits</SubTitle>
              <Text style={[S.bodySmall, { color: C.green }]}>{safe(mantra.benefits)}</Text>
            </View>
          );
        })}

        <Footer name={data.name} section="Section 15 — Sacred Mantras" />
      </Page>

      {/* EVERYDAY LUCK */}
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="15c" title="Remedies & Everyday Luck Generator" subtitle="Lucky Email • Banks • Vehicle • Mobile • Tattoo Suggestion" />

        <View style={S.row}>
          <View style={S.col}>
            <View style={S.card}>
              <SubTitle>Lucky Email ID</SubTitle>
              <Body>{safe(frLuck.email_id)}</Body>
            </View>
            <View style={S.card}>
              <SubTitle>Favorable Banks</SubTitle>
              <View style={S.tagRow}>
                {safeArr(frLuck.bank_names).map((b, i) => (
                  <View key={i} style={S.tagGold}><Text style={S.tagGoldText}>{String(b)}</Text></View>
                ))}
              </View>
              <Text style={[S.bodySmall, { marginTop: 8 }]}>{safe(frLuck.bank_explanation)}</Text>
            </View>
            <View style={S.card}>
              <SubTitle>Lucky Time of Day</SubTitle>
              <Body>{safe(frLuck.lucky_time_of_day)}</Body>
            </View>
          </View>
          <View style={S.col}>
            <View style={S.card}>
              <SubTitle>Vehicle Number</SubTitle>
              <Body>{safe(frLuck.vehicle_number)}</Body>
            </View>
            <View style={S.card}>
              <SubTitle>House Number</SubTitle>
              <Body>{safe(frLuck.house_number)}</Body>
            </View>
            <View style={S.card}>
              <SubTitle>Mobile Number</SubTitle>
              <Body>{safe(frLuck.mobile_number)}</Body>
            </View>
          </View>
        </View>

        <View style={S.cardGold}>
          <SubTitle>Zodiac Tattoo Suggestion for {data.zodiac.sign}</SubTitle>
          <Body>{safe(frLuck.tattoo_suggestion)}</Body>
        </View>

        <View style={[S.card, { marginTop: 14, alignItems: 'center', paddingVertical: 24 }]}>
          <Text style={[S.goldText, { textAlign: 'center', fontSize: 12, marginBottom: 6 }]}>
            End of Numerology Report
          </Text>
          <Text style={[S.bodySmall, { textAlign: 'center', color: C.inkMid }]}>
            This report was generated exclusively for {data.name} by Aroha Astrology.{'\n'}
            All insights are based on Vedic numerology, Lo Shu grid analysis, and Feng Shui principles.
          </Text>
        </View>

        <Footer name={data.name} section="Section 15 — Everyday Luck" />
      </Page>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 16: PALM READING (only if palm image was provided)         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {palm && (
        <>
          <SectionDividerPage number="16" title="Palm Reading" subtitle={`Hast Rekha Shastra — ${safe(palm.hand_type, data.gender === 'male' ? 'Right' : 'Left')} Hand Analysis`} />

          {/* Major Lines */}
          <Page size="A4" style={S.page}>
            <PH />
            <ChapterHeader number="16" title="Palmistry — Major Lines" subtitle={`Hand Shape: ${safe(safeObj(palm.hand_shape).type)} • ${safe(safeObj(palm.hand_shape).description)}`} />

            {palmMajor && Object.entries(palmMajor).map(([key, val], i) => {
              const line = safeObj(val);
              const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              return (
                <View key={key} style={[S.cardGold, { marginBottom: 12 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <View style={[S.badge, { backgroundColor: i % 2 === 0 ? C.purple : C.gold }]}>
                      <Text style={[S.badgeText, { color: C.white, fontSize: TINY }]}>{String(i + 1)}</Text>
                    </View>
                    <Text style={[S.purpleText, { fontSize: 13 }]}>{label}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginLeft: 'auto' }}>
                      {safe(line.length) !== '—' && <View style={S.tag}><Text style={S.tagText}>Length: {safe(line.length)}</Text></View>}
                      {safe(line.depth) !== '—' && <View style={S.tag}><Text style={S.tagText}>Depth: {safe(line.depth)}</Text></View>}
                      {safe(line.present) === 'false' && <View style={[S.tag, { borderColor: C.red }]}><Text style={[S.tagText, { color: C.red }]}>Absent</Text></View>}
                    </View>
                  </View>
                  <Body>{safe(line.interpretation)}</Body>
                </View>
              );
            })}

            <Footer name={data.name} section="Section 16 — Palm Reading" />
          </Page>

          {/* Minor Lines, Mounts & Summary */}
          <Page size="A4" style={S.page}>
            <PH />
            <View style={[S.chapterBand, { marginBottom: 14 }]}>
              <View style={S.chapterNumBadge}><Text style={S.chapterNumText}>16</Text></View>
              <Text style={S.chapterTitle}>Minor Lines, Mounts & Summary</Text>
            </View>

            {palmMinor && (
              <>
                <SectionTitle>Minor Lines</SectionTitle>
                <View style={S.row}>
                  {Object.entries(palmMinor).map(([key, val]) => {
                    const line = safeObj(val);
                    const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    return (
                      <View key={key} style={[S.col, S.card]}>
                        <Text style={[S.purpleText, { fontSize: SMALL, marginBottom: 4 }]}>{label}</Text>
                        {line.count !== undefined && <Text style={S.label}>Count: {String(line.count)}</Text>}
                        {line.present !== undefined && <Text style={S.label}>{line.present ? 'Present' : 'Absent'}</Text>}
                        <Text style={S.bodySmall}>{safe(line.interpretation)}</Text>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {palmMounts && (
              <>
                <SectionTitle>Mounts Analysis</SectionTitle>
                <View style={[S.table, { marginTop: 8 }]}>
                  <View style={S.thead}>
                    <Text style={[S.th, { flex: 1.2 }]}>Mount</Text>
                    <Text style={[S.th, { flex: 0.8 }]}>Development</Text>
                    <Text style={[S.th, { flex: 3 }]}>Interpretation</Text>
                  </View>
                  {Object.entries(palmMounts).map(([key, val], i) => {
                    const mount = safeObj(val);
                    const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    return (
                      <View key={key} style={i % 2 === 0 ? S.trow : S.trowAlt}>
                        <Text style={[S.td, { flex: 1.2, fontFamily: 'Helvetica-Bold', color: C.inkDark }]}>{label}</Text>
                        <Text style={[S.td, { flex: 0.8 }]}>{safe(mount.development)}</Text>
                        <Text style={[S.td, { flex: 3 }]}>{safe(mount.interpretation)}</Text>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            <SectionTitle>Overall Palm Reading Summary</SectionTitle>
            <View style={S.cardPurple}>
              <Body>{safe(palm.overall_personality)}</Body>
            </View>

            <View style={S.row}>
              <View style={S.col}>
                <SubTitle>Career Indications</SubTitle>
                <Body>{safe(palm.career_indications)}</Body>
              </View>
              <View style={S.col}>
                <SubTitle>Relationship Outlook</SubTitle>
                <Body>{safe(palm.relationship_outlook)}</Body>
              </View>
            </View>

            {safeArr(palm.health_warnings).length > 0 && (
              <>
                <SubTitle>Health Warnings</SubTitle>
                <BulletList items={safeArr(palm.health_warnings).map(String)} />
              </>
            )}

            <SubTitle>Vedic Correlation</SubTitle>
            <View style={S.cardPurple}>
              <Body>{safe(palm.vedic_correlation)}</Body>
            </View>

            <Footer name={data.name} section="Section 16 — Palm Reading" />
          </Page>
        </>
      )}

    </Document>
  );
}
