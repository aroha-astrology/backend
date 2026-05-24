// Server-only: @react-pdf/renderer PDF component — Vedic Kundli Report (~100 pages)
import React from 'react';
import { Document, Page, View, Text, StyleSheet, Svg, Rect, Line, G, Image } from '@react-pdf/renderer';
import type { GroundTruthData } from '@/lib/ai/groundTruth';

// =============================================================================
// Types
// =============================================================================

export interface KundliReportData {
  name: string;
  dob: string;
  tob: string;
  pob: string;
  gender: 'male' | 'female';
  chartData: {
    planets: Array<{
      name: string;
      sign: string;
      degree: number;
      nakshatra: string;
      pada: number;
      house: number;
      isRetrograde: boolean;
    }>;
    houses: Array<{ house: number; sign: string; lord: string }>;
    ascendant: { sign: string; degree: number; lord: string };
  };
  dashaData: Record<string, unknown>;
  yogaData: Array<Record<string, unknown>>;
  doshaData: Record<string, unknown>;
  shadbala: Record<string, unknown>;
  ashtakavarga: Record<string, unknown>;
  westernZodiac?: string; // Western/Tropical sun sign from calendar dates
  groundTruth: GroundTruthData;
  aiContent: Record<string, string>;
  predictions?: Record<string, string>; // kept for backward compat
  avatarUrl?: string; // Google / OAuth profile picture — shown on cover
}

// =============================================================================
// Design tokens — Purple/Parchment style
// =============================================================================

const C = {
  purple: '#3d1a6e',
  purpleDark: '#1a0840',
  purpleMid: '#5a2a96',
  purpleLight: '#7a3abc',
  purplePale: '#e8daf5',
  parchment: '#f5ead5',
  parchmentDark: '#e8d8b8',
  parchmentDeep: '#d4c098',
  gold: '#c9a227',
  goldLight: '#e8c84a',
  goldPale: '#f5e8a0',
  goldDeep: '#a07810',
  inkDark: '#1a0e40',
  inkBody: '#2d1b00',
  inkMid: '#5a4a30',
  inkLight: '#8a7a60',
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
  page: { backgroundColor: C.parchment, color: C.inkBody, fontFamily: 'Helvetica', padding: 36, paddingTop: 52, paddingBottom: 52, fontSize: BODY },
  coverPage: { backgroundColor: C.purpleDark, color: C.white, padding: 0 },

  pageHeader: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: C.purple, paddingVertical: 10, paddingHorizontal: 36, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: C.gold },
  pageHeaderTitle: { fontSize: SMALL, color: C.white, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1.5, flex: 1 },
  pageHeaderRight: { fontSize: TINY, color: C.goldDeep },

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
  coverPillValue: { fontSize: 18, color: C.gold, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  coverPillSub: { fontSize: TINY, color: C.purplePale, marginTop: 2, textAlign: 'center' },
  coverFooterBand: { backgroundColor: C.purple, borderTopWidth: 2, borderTopColor: C.gold, paddingVertical: 10, paddingHorizontal: 48, alignItems: 'center' },
  coverFooter: { fontSize: TINY, color: C.purplePale, textAlign: 'center' },

  dividerPage: { backgroundColor: C.purple, padding: 0, flex: 1 },
  dividerTopAccent: { height: 4, backgroundColor: C.gold },
  dividerBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 60 },
  dividerChapterNum: { fontSize: 72, color: C.gold, fontFamily: 'Helvetica-Bold', opacity: 0.3 },
  dividerTitle: { fontSize: 28, color: C.white, fontFamily: 'Helvetica-Bold', textAlign: 'center', marginTop: -10, textTransform: 'uppercase', letterSpacing: 2 },
  dividerSubtitle: { fontSize: 13, color: C.purplePale, textAlign: 'center', marginTop: 12, lineHeight: 1.6 },
  dividerLine: { width: 80, height: 2, backgroundColor: C.gold, marginVertical: 20 },
  dividerBottomAccent: { height: 4, backgroundColor: C.gold },

  chapterBand: { backgroundColor: C.purple, paddingVertical: 10, paddingHorizontal: 16, marginBottom: 14, flexDirection: 'row', alignItems: 'center' },
  chapterNumBadge: { backgroundColor: C.gold, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  chapterNumText: { fontSize: SMALL, color: C.purpleDark, fontFamily: 'Helvetica-Bold' },
  chapterTitle: { fontSize: 16, color: C.white, fontFamily: 'Helvetica-Bold', flex: 1 },
  chapterSub: { fontSize: TINY, color: C.purplePale, marginTop: 2 },
  sectionTitle: { fontSize: 13, color: C.purple, fontFamily: 'Helvetica-Bold', marginTop: 16, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: C.gold, paddingBottom: 4 },
  subTitle: { fontSize: 11, color: C.inkDark, fontFamily: 'Helvetica-Bold', marginTop: 10, marginBottom: 4 },

  card: { backgroundColor: C.parchmentDark, borderWidth: 1, borderColor: C.parchmentDeep, borderRadius: 4, padding: 14, marginBottom: 12 },
  cardGold: { backgroundColor: C.parchmentDark, borderWidth: 1, borderColor: C.gold, borderRadius: 4, padding: 14, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: C.gold },
  cardPurple: { backgroundColor: C.purplePale, borderWidth: 1, borderColor: C.purple, borderRadius: 4, padding: 14, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: C.purple },

  body: { fontSize: BODY, color: C.inkBody, lineHeight: LH, marginBottom: 5 },
  bodySmall: { fontSize: SMALL, color: C.inkBody, lineHeight: LH, marginBottom: 3 },
  label: { fontSize: TINY, color: C.inkMid, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  goldText: { fontSize: BODY, color: C.goldDeep, fontFamily: 'Helvetica-Bold' },
  purpleText: { fontSize: BODY, color: C.purple, fontFamily: 'Helvetica-Bold' },

  row: { flexDirection: 'row', gap: 14 },
  col: { flex: 1 },
  divider: { borderBottomWidth: 1, borderBottomColor: C.parchmentDeep, marginVertical: 10 },
  goldDivider: { borderBottomWidth: 1, borderBottomColor: C.gold, marginVertical: 10 },
  spacer: { marginTop: 12 },

  table: { borderWidth: 1, borderColor: C.gold, borderRadius: 2, marginTop: 10 },
  thead: { flexDirection: 'row', backgroundColor: C.purple, borderBottomWidth: 2, borderBottomColor: C.gold },
  trow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.parchmentDeep, backgroundColor: C.parchment },
  trowAlt: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.parchmentDeep, backgroundColor: C.parchmentDark },
  th: { flex: 1, padding: 7, fontSize: SMALL, color: C.white, fontFamily: 'Helvetica-Bold' },
  td: { flex: 1, padding: 7, fontSize: SMALL, color: C.inkBody, lineHeight: 1.5 },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tag: { backgroundColor: C.purplePale, borderWidth: 1, borderColor: C.purpleMid, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  tagGold: { backgroundColor: C.parchmentDark, borderWidth: 1, borderColor: C.gold, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  tagText: { fontSize: TINY, color: C.inkDark },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: C.parchmentDeep },
  infoLabel: { fontSize: SMALL, color: C.inkMid },
  infoValue: { fontSize: SMALL, color: C.inkDark, fontFamily: 'Helvetica-Bold' },

  bulletRow: { flexDirection: 'row', marginBottom: 5 },
  bulletDot: { width: 14, fontSize: BODY, color: C.purple },
  bulletText: { flex: 1, fontSize: BODY, color: C.inkBody, lineHeight: LH },

  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.purple, borderTopWidth: 2, borderTopColor: C.gold, paddingVertical: 6, paddingHorizontal: 36, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: TINY, color: C.purplePale },

  severityNone: { backgroundColor: '#d4f0d0', borderWidth: 1, borderColor: C.green, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
  severityMild: { backgroundColor: '#f0ead0', borderWidth: 1, borderColor: C.orange, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
  severityModerate: { backgroundColor: '#f5e0c0', borderWidth: 1, borderColor: C.orange, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
  severitySevere: { backgroundColor: '#f0d0d0', borderWidth: 1, borderColor: C.red, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
  severityTextNone: { fontSize: TINY, fontFamily: 'Helvetica-Bold', color: C.green },
  severityTextMild: { fontSize: TINY, fontFamily: 'Helvetica-Bold', color: C.orange },
  severityTextModerate: { fontSize: TINY, fontFamily: 'Helvetica-Bold', color: C.orange },
  severityTextSevere: { fontSize: TINY, fontFamily: 'Helvetica-Bold', color: C.red },

  strengthHigh: { backgroundColor: '#d4f0d0', borderWidth: 1, borderColor: C.green, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
  strengthMed: { backgroundColor: '#f0ead0', borderWidth: 1, borderColor: C.orange, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
  strengthLow: { backgroundColor: '#f0d0d0', borderWidth: 1, borderColor: C.red, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
  strengthTextHigh: { fontSize: TINY, fontFamily: 'Helvetica-Bold', color: C.green },
  strengthTextMed: { fontSize: TINY, fontFamily: 'Helvetica-Bold', color: C.orange },
  strengthTextLow: { fontSize: TINY, fontFamily: 'Helvetica-Bold', color: C.red },

  // Dignity badge styles
  dignityExalted: { backgroundColor: '#d4f0d0', borderWidth: 1, borderColor: C.green, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
  dignityOwn: { backgroundColor: '#d4f0d0', borderWidth: 1, borderColor: C.green, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
  dignityFriendly: { backgroundColor: '#e8f5e0', borderWidth: 1, borderColor: '#4a9a4a', borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
  dignityNeutral: { backgroundColor: '#f0ead0', borderWidth: 1, borderColor: C.orange, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
  dignityEnemy: { backgroundColor: '#f0d0d0', borderWidth: 1, borderColor: C.red, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },
  dignityDebilitated: { backgroundColor: '#f0d0d0', borderWidth: 1, borderColor: C.red, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 },

  dignityTextGood: { fontSize: TINY, fontFamily: 'Helvetica-Bold', color: C.green },
  dignityTextNeutral: { fontSize: TINY, fontFamily: 'Helvetica-Bold', color: C.orange },
  dignityTextBad: { fontSize: TINY, fontFamily: 'Helvetica-Bold', color: C.red },
});

// =============================================================================
// Helpers
// =============================================================================

function safe(val: unknown, fallback = '\u2014'): string {
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={S.sectionTitle}>{children}</Text>;
}

function Body({ children }: { children: React.ReactNode }) {
  return <Text style={S.body}>{children}</Text>;
}

function BulletList({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={S.bulletRow}>
          <Text style={S.bulletDot}>{'\u2022'}</Text>
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

function Footer({ name, section }: { name: string; section: string }) {
  return (
    <View style={S.footer} fixed>
      <Text style={S.footerText}>Aroha Astrology {'\u2022'} Vedic Kundli Report {'\u2022'} {name}</Text>
      <Text style={S.footerText}>{section}</Text>
    </View>
  );
}

function getDignityBadge(status: string) {
  switch (status) {
    case 'Exalted': case 'Mooltrikona': return { style: S.dignityExalted, textStyle: S.dignityTextGood };
    case 'Own Sign': return { style: S.dignityOwn, textStyle: S.dignityTextGood };
    case 'Friendly': return { style: S.dignityFriendly, textStyle: S.dignityTextGood };
    case 'Neutral': return { style: S.dignityNeutral, textStyle: S.dignityTextNeutral };
    case 'Enemy Sign': return { style: S.dignityEnemy, textStyle: S.dignityTextBad };
    case 'Debilitated': return { style: S.dignityDebilitated, textStyle: S.dignityTextBad };
    default: return { style: S.dignityNeutral, textStyle: S.dignityTextNeutral };
  }
}

function getSeverityStyle(severity: string) {
  switch (severity) {
    case 'none': return { badge: S.severityNone, text: S.severityTextNone };
    case 'mild': return { badge: S.severityMild, text: S.severityTextMild };
    case 'moderate': return { badge: S.severityModerate, text: S.severityTextModerate };
    case 'severe': return { badge: S.severitySevere, text: S.severityTextSevere };
    default: return { badge: S.severityNone, text: S.severityTextNone };
  }
}

function getStrengthLabel(strength: string): { label: string; style: typeof S.strengthHigh; textStyle: typeof S.strengthTextHigh } {
  if (strength === 'Strong') return { label: 'Strong', style: S.strengthHigh, textStyle: S.strengthTextHigh };
  if (strength === 'Medium') return { label: 'Medium', style: S.strengthMed, textStyle: S.strengthTextMed };
  return { label: 'Weak', style: S.strengthLow, textStyle: S.strengthTextLow };
}

const ZODIAC_SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];

const HOUSE_SIGNIFICANCE: Record<number, string> = {
  1: 'Self, Personality, Physical Body',
  2: 'Wealth, Family, Speech',
  3: 'Siblings, Courage, Communication',
  4: 'Mother, Home, Happiness',
  5: 'Children, Intelligence, Creativity',
  6: 'Enemies, Health, Debt',
  7: 'Marriage, Partnerships, Business',
  8: 'Resilience, Obstacles, Transformation',
  9: 'Fortune, Dharma, Higher Learning',
  10: 'Career, Status, Authority',
  11: 'Gains, Income, Desires',
  12: 'Losses, Spirituality, Foreign Travel',
};

const PLANET_NAMES = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

// =============================================================================
// Main Document
// =============================================================================

export function KundliReport({ data }: { data: KundliReportData }) {
  const { chartData, dashaData, yogaData, doshaData, shadbala, ashtakavarga, groundTruth: gt, aiContent: ai } = data;
  const dasha = safeObj(dashaData);
  const shad = safeObj(shadbala);
  const ashtak = safeObj(ashtakavarga);

  const dobDisplay = new Date(data.dob + 'T00:00:00Z').toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });

  const moonPlanet = chartData.planets.find(p => p.name === 'Moon');
  const sunPlanet = chartData.planets.find(p => p.name === 'Sun');
  const moonNakshatra = moonPlanet?.nakshatra ?? '\u2014';

  const PH = () => (
    <View style={S.pageHeader} fixed>
      <Text style={S.pageHeaderTitle}>VEDIC KUNDLI REPORT</Text>
      <Text style={S.pageHeaderRight}>Aroha Astrology  {'\u2022'}  {data.name}</Text>
    </View>
  );

  // Helper to get AI content with fallback
  const getAI = (key: string, fallback = '') => {
    const val = ai[key];
    if (val && val !== '\u2014' && val.trim()) return val;
    return fallback;
  };

  // =========================================================================
  // COVER PAGE
  // =========================================================================
  const CoverPage = () => (
    <Page size="A4" style={S.coverPage}>
      <View style={S.coverTopBand}>
        <View style={S.coverOrnament} />
        <Text style={S.coverTitle}>Vedic Kundli Report</Text>
        <Text style={S.coverTitleSub}>Comprehensive Birth Chart Analysis</Text>
        <View style={S.coverOrnament} />
      </View>
      <View style={S.coverMidSection}>
        {data.avatarUrl && (
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            <Image
              src={data.avatarUrl}
              style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: C.gold }}
            />
          </View>
        )}
        <View style={S.coverNameBanner}>
          <Text style={S.coverName}>{data.name}</Text>
        </View>
        <Text style={S.coverDob}>{dobDisplay} {'\u2022'} {data.tob} {'\u2022'} {data.pob}</Text>
        <View style={S.coverDividerLine} />
        <View style={S.coverPillRow}>
          <View style={S.coverPill}>
            <Text style={S.coverPillLabel}>Ascendant</Text>
            <Text style={S.coverPillValue}>{chartData.ascendant.sign.slice(0, 3)}</Text>
            <Text style={S.coverPillSub}>{chartData.ascendant.sign}</Text>
          </View>
          <View style={S.coverPill}>
            <Text style={S.coverPillLabel}>Moon Sign</Text>
            <Text style={S.coverPillValue}>{(moonPlanet?.sign ?? '\u2014').slice(0, 3)}</Text>
            <Text style={S.coverPillSub}>{moonPlanet?.sign ?? '\u2014'}</Text>
          </View>
          <View style={S.coverPill}>
            <Text style={S.coverPillLabel}>Sun (Vedic)</Text>
            <Text style={S.coverPillValue}>{(sunPlanet?.sign ?? '\u2014').slice(0, 3)}</Text>
            <Text style={S.coverPillSub}>{sunPlanet?.sign ?? '\u2014'}</Text>
          </View>
          <View style={S.coverPill}>
            <Text style={S.coverPillLabel}>Sun (Western)</Text>
            <Text style={S.coverPillValue}>{(data.westernZodiac ?? '\u2014').slice(0, 3)}</Text>
            <Text style={S.coverPillSub}>{data.westernZodiac ?? '\u2014'}</Text>
          </View>
          <View style={S.coverPill}>
            <Text style={S.coverPillLabel}>Nakshatra</Text>
            <Text style={S.coverPillValue}>{moonNakshatra.slice(0, 4)}</Text>
            <Text style={S.coverPillSub}>{moonNakshatra}</Text>
          </View>
        </View>
        <View style={{ marginTop: 20 }}>
          <View style={S.coverPillRow}>
            <View style={S.coverPill}>
              <Text style={S.coverPillLabel}>Asc Lord</Text>
              <Text style={S.coverPillValue}>{chartData.ascendant.lord.slice(0, 3)}</Text>
              <Text style={S.coverPillSub}>{chartData.ascendant.lord}</Text>
            </View>
            <View style={S.coverPill}>
              <Text style={S.coverPillLabel}>Mahadasha</Text>
              <Text style={S.coverPillValue}>{(gt.currentDasha.mahadasha || '\u2014').slice(0, 3)}</Text>
              <Text style={S.coverPillSub}>{gt.currentDasha.mahadasha || '\u2014'}</Text>
            </View>
          </View>
        </View>
      </View>
      <View style={S.coverFooterBand}>
        <Text style={S.coverFooter}>Generated by Aroha Astrology {'\u2022'} Vedic Astrology Intelligence</Text>
      </View>
    </Page>
  );

  // =========================================================================
  // SECTION 1: BIRTH DETAILS (2 pages)
  // =========================================================================
  const BirthDetailsPages = () => (
    <>
      <SectionDividerPage number="1" title="Birth Details" subtitle="Foundation of the horoscope — birth data, planetary placements, and house positions" />
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="1" title="Birth Details & Planetary Positions" />

        <SectionTitle>Birth Information</SectionTitle>
        <View style={S.card}>
          <InfoRow label="Full Name" value={data.name} />
          <InfoRow label="Date of Birth" value={dobDisplay} />
          <InfoRow label="Time of Birth" value={data.tob} />
          <InfoRow label="Place of Birth" value={data.pob} />
          <InfoRow label="Gender" value={data.gender === 'male' ? 'Male' : 'Female'} />
          <InfoRow label="Ascendant (Lagna)" value={`${chartData.ascendant.sign} ${chartData.ascendant.degree.toFixed(2)}\u00b0`} />
          <InfoRow label="Ascendant Lord" value={chartData.ascendant.lord} />
          <InfoRow label="Moon Sign (Rashi)" value={moonPlanet?.sign ?? '\u2014'} />
          <InfoRow label="Sun Sign (Vedic/Sidereal)" value={sunPlanet?.sign ?? '\u2014'} />
          <InfoRow label="Sun Sign (Western/Tropical)" value={data.westernZodiac ?? '\u2014'} />
          <InfoRow label="Birth Nakshatra" value={moonNakshatra} />
        </View>

        <SectionTitle>Planetary Positions (Graha Sthiti)</SectionTitle>
        <View style={S.table}>
          <View style={S.thead}>
            <Text style={[S.th, { flex: 1.2 }]}>Planet</Text>
            <Text style={S.th}>Sign</Text>
            <Text style={[S.th, { flex: 0.8 }]}>Degree</Text>
            <Text style={S.th}>Nakshatra</Text>
            <Text style={[S.th, { flex: 0.5 }]}>Pada</Text>
            <Text style={[S.th, { flex: 0.5 }]}>House</Text>
            <Text style={[S.th, { flex: 0.5 }]}>R</Text>
          </View>
          {chartData.planets.map((p, i) => (
            <View key={i} style={i % 2 === 0 ? S.trow : S.trowAlt}>
              <Text style={[S.td, { flex: 1.2, fontFamily: 'Helvetica-Bold' }]}>{p.name}</Text>
              <Text style={S.td}>{p.sign}</Text>
              <Text style={[S.td, { flex: 0.8 }]}>{p.degree.toFixed(2)}{'\u00b0'}</Text>
              <Text style={S.td}>{p.nakshatra}</Text>
              <Text style={[S.td, { flex: 0.5 }]}>{p.pada}</Text>
              <Text style={[S.td, { flex: 0.5 }]}>{p.house}</Text>
              <Text style={[S.td, { flex: 0.5, color: p.isRetrograde ? C.red : C.inkBody }]}>{p.isRetrograde ? 'R' : '\u2014'}</Text>
            </View>
          ))}
        </View>

        <Footer name={data.name} section="Birth Details" />
      </Page>

      <Page size="A4" style={S.page}>
        <PH />
        <SectionTitle>House Table (Bhava Kundli)</SectionTitle>
        <View style={S.table}>
          <View style={S.thead}>
            <Text style={[S.th, { flex: 0.5 }]}>House</Text>
            <Text style={S.th}>Sign</Text>
            <Text style={S.th}>Lord</Text>
            <Text style={S.th}>Lord in House</Text>
            <Text style={S.th}>Planets</Text>
            <Text style={[S.th, { flex: 1.5 }]}>Significance</Text>
          </View>
          {chartData.houses.map((h, i) => {
            const ha = gt.houseAnalysis[h.house];
            return (
              <View key={i} style={i % 2 === 0 ? S.trow : S.trowAlt}>
                <Text style={[S.td, { flex: 0.5, fontFamily: 'Helvetica-Bold' }]}>{h.house}</Text>
                <Text style={S.td}>{h.sign}</Text>
                <Text style={S.td}>{h.lord}</Text>
                <Text style={S.td}>{ha?.lordHouse ?? '\u2014'}</Text>
                <Text style={S.td}>{ha?.planets.join(', ') || '\u2014'}</Text>
                <Text style={[S.td, { flex: 1.5, fontSize: TINY }]}>{HOUSE_SIGNIFICANCE[h.house] ?? ''}</Text>
              </View>
            );
          })}
        </View>

        <SectionTitle>Planet Dignity Summary</SectionTitle>
        <View style={S.table}>
          <View style={S.thead}>
            <Text style={[S.th, { flex: 1.2 }]}>Planet</Text>
            <Text style={S.th}>Sign</Text>
            <Text style={S.th}>House</Text>
            <Text style={S.th}>Dignity Status</Text>
          </View>
          {chartData.planets.map((p, i) => {
            const d = gt.planetDignities[p.name];
            const badge = getDignityBadge(d?.status ?? 'Neutral');
            return (
              <View key={i} style={i % 2 === 0 ? S.trow : S.trowAlt}>
                <Text style={[S.td, { flex: 1.2, fontFamily: 'Helvetica-Bold' }]}>{p.name}</Text>
                <Text style={S.td}>{p.sign}</Text>
                <Text style={S.td}>{p.house}</Text>
                <View style={[S.td, { flexDirection: 'row' }]}>
                  <View style={badge.style}>
                    <Text style={badge.textStyle}>{d?.status ?? 'Neutral'}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <Footer name={data.name} section="Birth Details" />
      </Page>
    </>
  );

  // =========================================================================
  // SECTION 2: ASCENDANT ANALYSIS (4 pages)
  // =========================================================================
  const AscendantPages = () => (
    <>
      <SectionDividerPage number="2" title="Ascendant Analysis" subtitle="Your rising sign shapes personality, appearance, and life approach" />
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="2" title="Ascendant Analysis (Lagna Vichar)" />

        <View style={S.cardGold}>
          <InfoRow label="Ascendant Sign" value={chartData.ascendant.sign} />
          <InfoRow label="Degree" value={`${chartData.ascendant.degree.toFixed(2)}\u00b0`} />
          <InfoRow label="Lord" value={chartData.ascendant.lord} />
          <InfoRow label="Element" value={gt.ascendantTraits.element} />
          <InfoRow label="Quality" value={gt.ascendantTraits.quality} />
        </View>

        <SectionTitle>Personality Traits</SectionTitle>
        <View style={S.tagRow}>
          {gt.personalityKeywords.map((kw, i) => (
            <View key={i} style={S.tag}>
              <Text style={S.tagText}>{kw}</Text>
            </View>
          ))}
        </View>

        <View style={[S.card, { marginTop: 12 }]}>
          <Text style={S.label}>YOGI BABA</Text>
          <Body>{getAI('personality', `As a ${chartData.ascendant.sign} ascendant native, you carry the qualities of ${gt.ascendantTraits.element} element and ${gt.ascendantTraits.quality} quality. Your ascendant lord ${chartData.ascendant.lord} significantly shapes your personality and life direction.`)}</Body>
        </View>

        <SectionTitle>Physical Appearance Indicators</SectionTitle>
        <BulletList items={gt.ascendantTraits.appearance} />

        <View style={[S.card, { marginTop: 12 }]}>
          <Text style={S.label}>YOGI BABA</Text>
          <Body>{getAI('appearance', `The ${chartData.ascendant.sign} ascendant typically gives ${gt.ascendantTraits.appearance.slice(0, 2).join(' and ').toLowerCase()}. The placement of the ascendant lord further modifies these physical characteristics.`)}</Body>
        </View>

        <SectionTitle>Nature and Temperament</SectionTitle>
        <BulletList items={gt.ascendantTraits.nature} />

        <Footer name={data.name} section="Ascendant Analysis" />
      </Page>

      <Page size="A4" style={S.page}>
        <PH />
        <SectionTitle>Executive Summary</SectionTitle>
        <View style={S.cardPurple}>
          <Body>{getAI('executive_summary', `This birth chart belongs to ${data.name}, born on ${dobDisplay} at ${data.tob} in ${data.pob}. With ${chartData.ascendant.sign} ascendant and Moon in ${moonPlanet?.sign ?? 'unknown'}, the chart reveals a unique combination of planetary energies. The ascendant lord ${chartData.ascendant.lord} plays a crucial role in shaping the life path. The current ${gt.currentDasha.mahadasha} Mahadasha brings its own set of influences and opportunities.`)}</Body>
        </View>

        <SectionTitle>Key Chart Highlights</SectionTitle>
        <Text style={[S.bodySmall, { color: C.inkLight, marginBottom: 4, fontStyle: 'italic' }]}>A snapshot of the most important elements in your birth chart at a glance</Text>
        <View style={S.card}>
          <InfoRow label="Strongest Planet" value={gt.shadbalaRanking.length > 0 ? `${gt.shadbalaRanking[0]} (highest Shadbala strength)` : `${chartData.ascendant.lord} (Lagna Lord)`} />
          <InfoRow label="Weakest Planet" value={gt.shadbalaRanking.length > 1 ? `${gt.shadbalaRanking[gt.shadbalaRanking.length - 1]} (needs strengthening)` : 'See Shadbala section below'} />
          <InfoRow label="Current Mahadasha" value={gt.currentDasha.mahadasha ? `${gt.currentDasha.mahadasha} Mahadasha` : '\u2014'} />
          <InfoRow label="Current Antardasha" value={gt.currentDasha.antardasha ? `${gt.currentDasha.antardasha} Antardasha` : '\u2014'} />
          <InfoRow label="Active Doshas" value={gt.detectedDoshas.filter(d => d.present).length > 0 ? gt.detectedDoshas.filter(d => d.present).map(d => d.name).join(', ') : 'No major doshas detected'} />
        </View>

        {/* Active Yogas Detail */}
        <SectionTitle>Active Yogas ({gt.detectedYogas.length} found)</SectionTitle>
        <Text style={[S.bodySmall, { color: C.inkLight, marginBottom: 4, fontStyle: 'italic' }]}>Yogas are special planetary combinations that produce specific life results — wealth, power, wisdom, or challenges</Text>
        {gt.detectedYogas.length > 0 ? (
          <View style={S.table}>
            <View style={S.thead}>
              <Text style={[S.th, { flex: 1.5 }]}>Yoga Name</Text>
              <Text style={[S.th, { flex: 1 }]}>Type</Text>
              <Text style={[S.th, { flex: 1 }]}>Planets</Text>
              <Text style={[S.th, { flex: 0.8 }]}>Strength</Text>
            </View>
            {gt.detectedYogas.slice(0, 15).map((y, i) => (
              <View key={i} style={i % 2 === 0 ? S.trow : S.trowAlt}>
                <Text style={[S.td, { flex: 1.5, fontFamily: 'Helvetica-Bold', color: C.inkDark }]}>{y.name}</Text>
                <Text style={[S.td, { flex: 1 }]}>{y.type || '\u2014'}</Text>
                <Text style={[S.td, { flex: 1 }]}>{y.planets || '\u2014'}</Text>
                <Text style={[S.td, { flex: 0.8, color: y.strength === 'Strong' ? C.green : y.strength === 'Weak' ? C.red : C.inkBody }]}>{y.strength || '\u2014'}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={S.card}>
            <Body>No specific yogas detected in the birth chart. This does not indicate a weak chart — some charts express their strength through individual planetary placements rather than classical yoga combinations.</Body>
          </View>
        )}
        {gt.detectedYogas.length > 15 && (
          <Text style={[S.bodySmall, { color: C.inkMid, marginTop: 4 }]}>
            + {gt.detectedYogas.length - 15} more yogas detailed in Section 13 below
          </Text>
        )}

        <SectionTitle>Planets Needing Attention</SectionTitle>
        <Text style={[S.bodySmall, { color: C.inkLight, marginBottom: 4, fontStyle: 'italic' }]}>Planets that are debilitated (weak), combust (burnt by Sun), or in enemy signs — they need remedies to unlock their potential</Text>
        {gt.planetRemediesNeeded.length > 0 ? (
          <View style={S.tagRow}>
            {gt.planetRemediesNeeded.map((p, i) => {
              const d = gt.planetDignities[p];
              const badge = getDignityBadge(d?.status ?? 'Neutral');
              return (
                <View key={i} style={badge.style}>
                  <Text style={badge.textStyle}>{p} ({d?.status})</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <Body>No severely afflicted planets detected. All planets are reasonably well-placed.</Body>
        )}

        <Footer name={data.name} section="Ascendant Analysis" />
      </Page>
    </>
  );

  // =========================================================================
  // SECTIONS 3-11: PLANET ANALYSIS (4 pages each = 36 pages)
  // =========================================================================
  const PlanetSection = ({ planet, sectionNum }: { planet: string; sectionNum: number }) => {
    const p = chartData.planets.find(pp => pp.name === planet);
    if (!p) return null;
    const dignity = gt.planetDignities[planet];
    const badge = getDignityBadge(dignity?.status ?? 'Neutral');
    const significations = gt.planetSignifications[planet] ?? [];
    const aspects = gt.planetAspects[planet] ?? [];
    const needsRemedy = gt.planetRemediesNeeded.includes(planet);
    const aiKey = `planet_${planet.toLowerCase()}`;
    const gemstone = gt.remedies.gemstones.find(g => g.planet === planet);
    const mantra = gt.remedies.mantras.find(m => m.planet === planet);
    const charityItem = gt.remedies.charity.find(c => c.planet === planet);
    const pData = gt.planetFullData[planet];

    return (
      <>
        <SectionDividerPage number={String(sectionNum)} title={`${planet} Analysis`} subtitle={`Detailed analysis of ${planet} in your birth chart`} />
        <Page size="A4" style={S.page}>
          <PH />
          <ChapterHeader number={String(sectionNum)} title={`${planet} (Graha Analysis)`} subtitle={`${p.sign} \u2022 House ${p.house} \u2022 ${p.nakshatra}`} />

          <View style={S.cardGold}>
            <View style={[S.row, { alignItems: 'center' }]}>
              <Text style={[S.purpleText, { flex: 1, fontSize: 14 }]}>{planet}</Text>
              <View style={badge.style}>
                <Text style={badge.textStyle}>{dignity?.status ?? 'Neutral'}</Text>
              </View>
            </View>
            <View style={S.divider} />
            <InfoRow label="Sign (Rashi)" value={p.sign} />
            <InfoRow label="Degree" value={`${p.degree.toFixed(2)}\u00b0`} />
            <InfoRow label="Nakshatra" value={p.nakshatra} />
            <InfoRow label="Pada" value={String(p.pada)} />
            <InfoRow label="House" value={String(p.house)} />
            <InfoRow label="Retrograde" value={p.isRetrograde ? 'Yes (Vakri)' : 'No'} />
            <InfoRow label="Dignity" value={dignity?.status ?? 'Neutral'} />
          </View>

          <SectionTitle>Dignity Assessment</SectionTitle>
          <View style={S.card}>
            <Body>{dignity?.description ?? `${planet} is placed in ${p.sign} in house ${p.house}.`}</Body>
          </View>

          <SectionTitle>What {planet} Governs in Your Life</SectionTitle>
          <Text style={[S.bodySmall, { color: C.inkLight, marginBottom: 6, fontStyle: 'italic' }]}>Key areas influenced by {planet} — categorized by life domain</Text>
          {(() => {
            const catColors: Record<string, { bg: string; border: string; text: string }> = {
              Life: { bg: '#e8daf5', border: C.purple, text: C.purple },
              Career: { bg: '#daf5e8', border: C.green, text: C.green },
              Body: { bg: '#f5e0da', border: C.red, text: C.red },
              Trait: { bg: '#f5ead5', border: C.goldDeep, text: C.goldDeep },
              Remedy: { bg: '#daeaf5', border: '#2a6090', text: '#2a6090' },
            };
            return (
              <View style={{ gap: 4 }}>
                {significations.map((s, i) => {
                  const [cat, ...rest] = s.split(': ');
                  const label = rest.join(': ') || cat;
                  const category = catColors[cat] ? cat : 'Trait';
                  const colors = catColors[category];
                  return (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <View style={{ backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingVertical: 2, paddingHorizontal: 6, minWidth: 50, alignItems: 'center' }}>
                        <Text style={{ fontSize: 7, color: colors.text, fontFamily: 'Helvetica-Bold' }}>{category}</Text>
                      </View>
                      <Text style={{ fontSize: SMALL, color: C.inkBody }}>{label}</Text>
                    </View>
                  );
                })}
              </View>
            );
          })()}

          <SectionTitle>Yogi Baba</SectionTitle>
          <View style={S.cardPurple}>
            <Body>{getAI(aiKey, `${planet} in ${p.sign} in the ${p.house}${p.house === 1 ? 'st' : p.house === 2 ? 'nd' : p.house === 3 ? 'rd' : 'th'} house ${p.isRetrograde ? '(retrograde) ' : ''}with ${dignity?.status ?? 'neutral'} dignity influences the areas of ${significations.slice(0, 3).join(', ').toLowerCase()}.`)}</Body>
          </View>

          <Footer name={data.name} section={`${planet} Analysis`} />
        </Page>

        <Page size="A4" style={S.page}>
          <PH />
          <SectionTitle>Aspects Received by {planet}</SectionTitle>
          <Text style={[S.bodySmall, { color: C.inkLight, marginBottom: 4, fontStyle: 'italic' }]}>Other planets casting their influence (drishti) on {planet}. Aspects modify how a planet behaves — benefic aspects strengthen, malefic aspects challenge.</Text>
          {aspects.length > 0 ? (
            <View style={S.table}>
              <View style={S.thead}>
                <Text style={S.th}>Aspecting Planet — which planet casts its gaze</Text>
                <Text style={S.th}>Nature — benefic (helpful) or malefic (challenging)</Text>
              </View>
              {aspects.map((asp, i) => {
                const aspDignity = gt.planetDignities[asp];
                return (
                  <View key={i} style={i % 2 === 0 ? S.trow : S.trowAlt}>
                    <Text style={[S.td, { fontFamily: 'Helvetica-Bold' }]}>{asp}</Text>
                    <Text style={S.td}>{aspDignity?.status === 'Exalted' || aspDignity?.status === 'Own Sign' ? 'Strong benefic aspect' : aspDignity?.status === 'Debilitated' ? 'Weakened aspect' : 'Standard aspect'}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={S.card}>
              <Body>{planet} does not receive any direct planetary aspects in this chart.</Body>
            </View>
          )}

          {p.isRetrograde && (
            <>
              <SectionTitle>Retrograde Effects (Vakri — backward motion)</SectionTitle>
              <View style={S.card}>
                <Body>{planet} is retrograde (Vakri) in this chart, meaning it appears to move backward from Earth{'\u2019'}s perspective. Retrograde planets are considered strong but their effects manifest with delay, internalization, or in unconventional ways. The significations of {planet} may require extra effort to materialize but often produce deeper and more lasting results.</Body>
              </View>
            </>
          )}

          {needsRemedy && (
            <>
              <SectionTitle>Remedies for {planet}</SectionTitle>
              <Text style={[S.bodySmall, { color: C.inkLight, marginBottom: 4, fontStyle: 'italic' }]}>{planet} is weak or afflicted in your chart. These remedies help strengthen its energy and reduce negative effects.</Text>
              <View style={S.cardGold}>
                {mantra && (
                  <View style={{ marginBottom: 8 }}>
                    <Text style={S.subTitle}>Mantra</Text>
                    <Text style={S.bodySmall}>{mantra.mantra}</Text>
                    <Text style={[S.bodySmall, { color: C.inkMid }]}>Chant {mantra.count} times on {mantra.day} | Deity: {mantra.deity}</Text>
                  </View>
                )}
                {gemstone && (
                  <View style={{ marginBottom: 8 }}>
                    <Text style={S.subTitle}>Gemstone</Text>
                    <Text style={S.bodySmall}>{gemstone.stone} in {gemstone.metal} on {gemstone.finger}</Text>
                    <Text style={[S.bodySmall, { color: C.inkMid }]}>Wear on {gemstone.day} after energizing with mantra</Text>
                  </View>
                )}
                {charityItem && (
                  <View>
                    <Text style={S.subTitle}>Charity</Text>
                    <Text style={S.bodySmall}>Donate {charityItem.item} to {charityItem.toWhom} on {charityItem.day}</Text>
                  </View>
                )}
              </View>
            </>
          )}

          {!needsRemedy && (
            <>
              <SectionTitle>{planet} Strength — No Urgent Remedies Needed</SectionTitle>
              <Text style={[S.bodySmall, { color: C.inkLight, marginBottom: 4, fontStyle: 'italic' }]}>{planet} is strong enough in your chart. These are optional enhancements to further boost its positive effects.</Text>
              <View style={S.card}>
                <Body>{planet} is well-placed in this chart ({dignity?.status}). No specific remedies are urgently needed. To further strengthen {planet}{'\u2019'}s positive effects: honor {mantra?.deity ?? 'the associated deity'} on {pData?.day ?? mantra?.day ?? 'the associated day'}, wear {pData?.color ?? 'its associated color'} colored clothing, face {pData?.direction ?? 'the associated direction'} during prayer, and consume {pData?.grain ?? 'the associated grain'}.</Body>
              <View style={[S.table, { marginTop: 8 }]}>
                <View style={S.thead}>
                  <Text style={S.th}>Attribute</Text>
                  <Text style={S.th}>Value</Text>
                </View>
                {[
                  ['Color', pData?.color],
                  ['Lucky Number', String(pData?.number ?? '')],
                  ['Day', pData?.day],
                  ['Direction', pData?.direction],
                  ['Metal', pData?.metal],
                  ['Grain', pData?.grain],
                  ['Body Part Ruled', pData?.bodyPart],
                  ['Element', pData?.element],
                  ['Favorable Time', pData?.favorableTime],
                ].filter(([, v]) => v).map(([k, v], i) => (
                  <View key={i} style={i % 2 === 0 ? S.trow : S.trowAlt}>
                    <Text style={[S.td, { fontFamily: 'Helvetica-Bold', color: C.inkDark }]}>{k}</Text>
                    <Text style={S.td}>{v}</Text>
                  </View>
                ))}
              </View>
              </View>
            </>
          )}

          <SectionTitle>House Lordship of {planet}</SectionTitle>
          <Text style={[S.bodySmall, { color: C.inkLight, marginBottom: 4, fontStyle: 'italic' }]}>Which houses {planet} rules (owns) in your chart and how its placement affects those life areas</Text>
          <View style={S.card}>
            {chartData.houses.filter(h => h.lord === planet).map((h, i) => (
              <View key={i} style={{ marginBottom: 4 }}>
                <Text style={S.bodySmall}>{planet} rules House {h.house} ({h.sign}) — {HOUSE_SIGNIFICANCE[h.house] ?? ''}</Text>
              </View>
            ))}
            {chartData.houses.filter(h => h.lord === planet).length === 0 && (
              <Body>{planet} does not rule any house as a sign lord in this chart system.</Body>
            )}
          </View>

          <Footer name={data.name} section={`${planet} Analysis`} />
        </Page>
      </>
    );
  };

  // =========================================================================
  // SECTION 12: HOUSE ANALYSIS (6 pages, 2 houses per page)
  // =========================================================================
  const HouseAnalysisPages = () => {
    const housePages: Array<Array<{ house: number; sign: string; lord: string }>> = [];
    for (let i = 0; i < chartData.houses.length; i += 2) {
      housePages.push(chartData.houses.slice(i, i + 2));
    }

    return (
      <>
        <SectionDividerPage number="12" title="House Analysis" subtitle="The 12 Bhavas — domains of life governed by each house" />
        {housePages.map((pair, pageIdx) => (
          <Page key={pageIdx} size="A4" style={S.page}>
            <PH />
            {pageIdx === 0 && <ChapterHeader number="12" title="House Analysis (Bhava Vichar)" />}
            {pair.map((h, i) => {
              const ha = gt.houseAnalysis[h.house];
              const aiKey = `house_${h.house}`;
              return (
                <View key={i} style={{ marginBottom: 16 }}>
                  <View style={S.cardGold}>
                    <View style={S.row}>
                      <View style={S.col}>
                        <Text style={[S.purpleText, { fontSize: 14 }]}>House {h.house}</Text>
                        <Text style={S.bodySmall}>{HOUSE_SIGNIFICANCE[h.house] ?? ''}</Text>
                      </View>
                      <View style={S.col}>
                        <InfoRow label="Sign" value={h.sign} />
                        <InfoRow label="Lord" value={h.lord} />
                        <InfoRow label="Lord in House" value={String(ha?.lordHouse ?? '\u2014')} />
                      </View>
                    </View>
                    {ha && ha.planets.length > 0 && (
                      <View style={[S.tagRow, { marginTop: 6 }]}>
                        <Text style={[S.label, { marginBottom: 0 }]}>PLANETS: </Text>
                        {ha.planets.map((p, j) => (
                          <View key={j} style={S.tag}>
                            <Text style={S.tagText}>{p}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                  <View style={S.card}>
                    <Text style={S.label}>INTERPRETATION</Text>
                    <Body>{getAI(aiKey, `House ${h.house} is in ${h.sign}, ruled by ${h.lord} placed in house ${ha?.lordHouse ?? 'unknown'}. This house governs ${(HOUSE_SIGNIFICANCE[h.house] ?? '').toLowerCase()}.${ha && ha.planets.length > 0 ? ` The presence of ${ha.planets.join(' and ')} in this house brings additional energy to these life areas.` : ' No planets occupy this house, so the lord\'s placement determines the results.'}`)}</Body>
                  </View>
                </View>
              );
            })}
            <Footer name={data.name} section="House Analysis" />
          </Page>
        ))}
      </>
    );
  };

  // =========================================================================
  // SECTION 13: YOGA ANALYSIS (4 pages)
  // =========================================================================
  const YogaPages = () => {
    const yogas = gt.detectedYogas;

    return (
      <>
        <SectionDividerPage number="13" title="Yoga Analysis" subtitle="Auspicious and significant planetary combinations in your chart" />
        <Page size="A4" style={S.page}>
          <PH />
          <ChapterHeader number="13" title="Yoga Analysis" />

          {yogas.length === 0 && <Body>No significant yogas detected in this chart based on standard rules.</Body>}

          {yogas.map((yoga, i) => {
            const sl = getStrengthLabel(yoga.strength);
            const aiKey = `yoga_${i}`;
            return (
              <View key={i} style={S.cardGold} wrap={false}>
                <View style={[S.row, { alignItems: 'center' }]}>
                  <Text style={[S.purpleText, { flex: 1 }]}>{yoga.name}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <View style={S.tagGold}>
                      <Text style={{ fontSize: TINY, color: C.goldDeep }}>{yoga.type}</Text>
                    </View>
                    <View style={sl.style}>
                      <Text style={sl.textStyle}>{sl.label}</Text>
                    </View>
                  </View>
                </View>
                {yoga.planets && (
                  <View style={[S.tagRow, { marginTop: 4 }]}>
                    {yoga.planets.split(', ').map((p, j) => (
                      <View key={j} style={S.tag}>
                        <Text style={S.tagText}>{p}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <View style={S.divider} />
                <Text style={S.label}>STANDARD MEANING</Text>
                <Text style={S.bodySmall}>{yoga.meaning}</Text>
                {getAI(aiKey) && (
                  <View style={{ marginTop: 6 }}>
                    <Text style={S.label}>PERSONALIZED INTERPRETATION</Text>
                    <Text style={S.bodySmall}>{getAI(aiKey)}</Text>
                  </View>
                )}
              </View>
            );
          })}

          <Footer name={data.name} section="Yoga Analysis" />
        </Page>
      </>
    );
  };

  // =========================================================================
  // SECTION 14: DOSHA ANALYSIS (4 pages)
  // =========================================================================
  const DoshaPages = () => (
    <>
      <SectionDividerPage number="14" title="Dosha Analysis" subtitle="Planetary afflictions, their severity, and recommended remedies" />
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="14" title="Dosha Analysis" />

        {gt.detectedDoshas.map((d, i) => {
          const ss = d.present
            ? getSeverityStyle(d.severity)
            : { badge: S.severityNone, text: S.severityTextNone };
          return (
            <View key={i} style={d.present ? S.cardPurple : S.card} wrap={false}>
              <View style={[S.row, { alignItems: 'center' }]}>
                <Text style={[S.purpleText, { flex: 1 }]}>{d.name}</Text>
                <View style={ss.badge}>
                  <Text style={ss.text}>{d.present ? d.severity.toUpperCase() : 'NOT PRESENT'}</Text>
                </View>
              </View>
              <View style={S.divider} />
              <Text style={[S.bodySmall, { color: d.present ? C.inkBody : C.inkMid }]}>{d.description}</Text>

              {d.timeline && (
                <View style={{ marginTop: 6 }}>
                  <Text style={[S.bodySmall, { fontFamily: 'Helvetica-Bold' }]}>Timeline: {d.timeline}</Text>
                </View>
              )}

              {d.present && d.remedies.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text style={S.label}>REMEDIES</Text>
                  <BulletList items={d.remedies} />
                </View>
              )}
            </View>
          );
        })}

        <Footer name={data.name} section="Dosha Analysis" />
      </Page>
    </>
  );

  // =========================================================================
  // SVG Graph Components
  // =========================================================================
  const ShadbalaBars = ({ entries }: { entries: Array<{ planet: string; totalVirupas: string; requiredVirupas: string; ratio: string; isStrong: boolean }> }) => {
    if (entries.length === 0) return null;
    const maxRatio = 2.0;
    const barMaxW = 220;
    const h = 14;
    return (
      <Svg width={360} height={entries.length * (h + 5)}>
        {entries.map((e, i) => {
          const ratio = Math.min(parseFloat(e.ratio) || 0, maxRatio);
          const barW = (ratio / maxRatio) * barMaxW;
          const color = ratio >= 1.0 ? '#2d6a2a' : ratio >= 0.7 ? '#b05a10' : '#8b1a1a';
          const y = i * (h + 5);
          return (
            <G key={i}>
              <Rect x={0} y={y + 2} width={barMaxW} height={h - 2} rx={2} fill="#e0d0c0" />
              <Rect x={0} y={y + 2} width={barW} height={h - 2} rx={2} fill={color} />
              {/* Required marker at 1.0 */}
              <Line x1={barMaxW / 2} y1={y} x2={barMaxW / 2} y2={y + h} stroke="#999" strokeWidth={0.5} strokeDasharray="1,2" />
            </G>
          );
        })}
      </Svg>
    );
  };

  const AshtakavargaBars = ({ bindus }: { bindus: Array<{ sign: string; bindus: number | null }> }) => {
    const validBindus = bindus.filter(b => b.bindus !== null) as Array<{ sign: string; bindus: number }>;
    if (validBindus.length === 0) return null;
    const maxB = Math.max(...validBindus.map(b => b.bindus), 40);
    const H = 80;
    const W = 30;
    const GAP = 8;
    const totalW = validBindus.length * (W + GAP);
    const height = H + 20;
    return (
      <Svg width={totalW} height={height}>
        {validBindus.map((b, i) => {
          const barH = (b.bindus / maxB) * H;
          const x = i * (W + GAP);
          const color = b.bindus >= 28 ? '#2d6a2a' : b.bindus >= 25 ? '#b05a10' : '#8b1a1a';
          return (
            <G key={i}>
              <Rect x={x} y={H - barH} width={W} height={barH} fill={color} rx={1} />
              <Rect x={x} y={H - barH} width={W} height={barH} fill="none" stroke="#5a4a30" strokeWidth={0.5} rx={1} />
            </G>
          );
        })}
        {/* Baseline */}
        <Line x1={0} y1={H} x2={totalW} y2={H} stroke="#8a7a60" strokeWidth={0.5} />
      </Svg>
    );
  };

  // =========================================================================
  // SECTION 15: VIMSHOTTARI DASHA (6 pages)
  // =========================================================================
  const DashaPages = () => {
    const currentMaha = safeObj(dasha.currentMahadasha);
    const currentAntar = safeObj(dasha.currentAntardasha);
    const currentPratyantar = safeObj(dasha.currentPratyantardasha);
    const mahadashas = safeArr(dasha.mahadashas);
    const currentMahaPlanet = safe(currentMaha.planet, '');
    const currentMahaEntry = mahadashas.find(md => safe(safeObj(md).planet, '') === currentMahaPlanet);
    const currentMahaObj = safeObj(currentMahaEntry);
    const antardashas = safeArr(currentMahaObj.antardashas);
    const currentAntarPlanet = safe(currentAntar.planet, '');
    let currentAntarIdx = antardashas.findIndex(ad => safe(safeObj(ad).planet, '') === currentAntarPlanet);
    if (currentAntarIdx < 0) currentAntarIdx = 0;
    const upcomingAntardashas = antardashas.slice(currentAntarIdx, currentAntarIdx + 9);

    return (
      <>
        <SectionDividerPage number="15" title="Vimshottari Dasha" subtitle="Planetary time periods governing the timing of life events" />
        <Page size="A4" style={S.page}>
          <PH />
          <ChapterHeader number="15" title="Vimshottari Dasha Analysis" />

          <SectionTitle>Current Dasha Periods</SectionTitle>
          <View style={S.cardGold}>
            <InfoRow label="Mahadasha (Major Period)" value={`${safe(currentMaha.planet)} \u2014 ${safe(currentMaha.startDate)} to ${safe(currentMaha.endDate)}`} />
            <InfoRow label="Antardasha (Sub Period)" value={`${safe(currentAntar.planet)} \u2014 ${safe(currentAntar.startDate)} to ${safe(currentAntar.endDate)}`} />
            <InfoRow label="Pratyantardasha" value={`${safe(currentPratyantar.planet)} \u2014 ${safe(currentPratyantar.startDate)} to ${safe(currentPratyantar.endDate)}`} />
          </View>

          <SectionTitle>Current Period Interpretation</SectionTitle>
          <View style={S.cardPurple}>
            <Body>{getAI('dasha_current', `The current ${safe(currentMaha.planet)} Mahadasha with ${safe(currentAntar.planet)} Antardasha brings the combined energies of these planets. This period runs from ${safe(currentAntar.startDate)} to ${safe(currentAntar.endDate)}.`)}</Body>
          </View>

          {mahadashas.length > 0 && (
            <>
              <SectionTitle>Complete Mahadasha Timeline</SectionTitle>
              <View style={S.table}>
                <View style={S.thead}>
                  <Text style={S.th}>Planet</Text>
                  <Text style={S.th}>Start Date</Text>
                  <Text style={S.th}>End Date</Text>
                  <Text style={[S.th, { flex: 0.6 }]}>Status</Text>
                </View>
                {mahadashas.map((md, i) => {
                  const m = safeObj(md);
                  const isCurrent = safe(m.planet, '') === currentMahaPlanet;
                  const isActive = isCurrent || Boolean(m.isActive);
                  return (
                    <View key={i} style={isActive ? [S.trowAlt, { backgroundColor: C.purplePale }] : (i % 2 === 0 ? S.trow : S.trowAlt)}>
                      <Text style={[S.td, isActive ? { fontFamily: 'Helvetica-Bold', color: C.purple } : {}]}>{safe(m.planet)}</Text>
                      <Text style={[S.td, isActive ? { color: C.purple } : {}]}>{safe(m.startDate)}</Text>
                      <Text style={[S.td, isActive ? { color: C.purple } : {}]}>{safe(m.endDate)}</Text>
                      <Text style={[S.td, { flex: 0.6, fontFamily: 'Helvetica-Bold', color: isActive ? C.green : C.inkLight }]}>{isActive ? 'CURRENT' : ''}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          <Footer name={data.name} section="Dasha Periods" />
        </Page>

        <Page size="A4" style={S.page}>
          <PH />
          {upcomingAntardashas.length > 0 && (
            <>
              <SectionTitle>Antardashas in {safe(currentMaha.planet)} Mahadasha</SectionTitle>
              <View style={S.table}>
                <View style={S.thead}>
                  <Text style={S.th}>Antardasha Planet</Text>
                  <Text style={S.th}>Start Date</Text>
                  <Text style={S.th}>End Date</Text>
                  <Text style={[S.th, { flex: 0.6 }]}>Status</Text>
                </View>
                {upcomingAntardashas.map((ad, i) => {
                  const a = safeObj(ad);
                  const isCurrent = safe(a.planet, '') === currentAntarPlanet;
                  return (
                    <View key={i} style={isCurrent ? [S.trowAlt, { backgroundColor: C.purplePale }] : (i % 2 === 0 ? S.trow : S.trowAlt)}>
                      <Text style={[S.td, isCurrent ? { fontFamily: 'Helvetica-Bold', color: C.purple } : {}]}>{safe(a.planet)}</Text>
                      <Text style={S.td}>{safe(a.startDate)}</Text>
                      <Text style={S.td}>{safe(a.endDate)}</Text>
                      <Text style={[S.td, { flex: 0.6, fontFamily: 'Helvetica-Bold', color: isCurrent ? C.green : C.inkLight }]}>{isCurrent ? 'CURRENT' : ''}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          <SectionTitle>5-Year Forecast</SectionTitle>
          <View style={S.cardPurple}>
            <Body>{getAI('dasha_forecast', `Based on the Vimshottari Dasha system, the coming years will be influenced by the ${safe(currentMaha.planet)} Mahadasha. The upcoming Antardasha transitions will bring shifts in focus and energy as different planetary periods activate.`)}</Body>
          </View>

          <Footer name={data.name} section="Dasha Periods" />
        </Page>
      </>
    );
  };

  // =========================================================================
  // SECTION 16: ASHTAKAVARGA (4 pages)
  // =========================================================================
  const AshtakavargaPages = () => {
    const sarva = safeObj(ashtak.sarva);
    const sarvaBindusArr = safeArr(sarva.bindus);
    const sarvaAshtakavargaObj = safeObj(ashtak.sarvaAshtakavarga);
    const bhinnaArr = safeArr(ashtak.bhinna);
    const bhinnaObj = safeObj(ashtak.bhinnaAshtakavarga);

    const sarvaBindus: Array<{ sign: string; bindus: number | null }> = ZODIAC_SIGNS.map((sign, i) => {
      if (sarvaAshtakavargaObj[sign] !== undefined && typeof sarvaAshtakavargaObj[sign] === 'number') return { sign, bindus: sarvaAshtakavargaObj[sign] as number };
      if (typeof sarvaBindusArr[i] === 'number') return { sign, bindus: sarvaBindusArr[i] as number };
      return { sign, bindus: null };
    });

    const hasSarvaData = sarvaBindus.some(s => s.bindus !== null);
    const sarvaTotal = hasSarvaData ? sarvaBindus.reduce((sum, s) => sum + (s.bindus ?? 0), 0) : null;

    const bhinnaEntries: Array<{ planet: string; signs: Record<string, number>; total: number }> = [];
    if (Object.keys(bhinnaObj).length > 0) {
      for (const planet of Object.keys(bhinnaObj)) {
        const signData = safeObj(bhinnaObj[planet]);
        const total = Object.values(signData).reduce((sum: number, v) => sum + (typeof v === 'number' ? v : 0), 0);
        bhinnaEntries.push({ planet, signs: signData as Record<string, number>, total });
      }
    } else if (bhinnaArr.length > 0) {
      for (const b of bhinnaArr) {
        const bp = safeObj(b);
        bhinnaEntries.push({ planet: safe(bp.planet), signs: {}, total: typeof bp.total === 'number' ? bp.total : 0 });
      }
    }

    const getBinduColor = (bindus: number): string => {
      if (bindus >= 28) return C.green;
      if (bindus >= 25) return C.orange;
      return C.red;
    };

    return (
      <>
        <SectionDividerPage number="16" title="Ashtakavarga" subtitle="Point-based strength of planets across signs" />
        <Page size="A4" style={S.page}>
          <PH />
          <ChapterHeader number="16" title="Ashtakavarga Summary" />

          <Body>Ashtakavarga is a unique Vedic system that assigns strength points (bindus) to each sign based on the combined influence of all planets. Signs with 28+ bindus are strong, while those below 25 are weak and may need attention.</Body>

          {hasSarvaData && (
            <>
              <SectionTitle>Sarva Ashtakavarga Visualization (Total Points by Sign)</SectionTitle>
              <View style={{ marginBottom: 10, padding: 8, backgroundColor: C.parchmentDark, borderRadius: 2, alignItems: 'center' }}>
                <AshtakavargaBars bindus={sarvaBindus} />
              </View>

              <View style={{ marginTop: 8, marginBottom: 12 }}>
                <Text style={{ fontSize: TINY, color: C.inkMid, lineHeight: LH }}>Each bar represents one zodiac sign. Green (28+) = strong, orange (25–27) = average, red (&lt;25) = weak. Taller bars indicate more favorable transits in that sign.</Text>
              </View>

              <SectionTitle>Detailed Breakdown by Sign</SectionTitle>
              <View style={S.table}>
                <View style={S.thead}>
                  <Text style={S.th}>Sign</Text>
                  <Text style={[S.th, { flex: 0.6 }]}>Bindus</Text>
                  <Text style={[S.th, { flex: 0.7 }]}>Strength</Text>
                </View>
                {sarvaBindus.map((s, i) => {
                  const binduVal = s.bindus;
                  const color = binduVal !== null ? getBinduColor(binduVal) : C.inkMid;
                  const strengthLabel = binduVal !== null ? (binduVal >= 28 ? 'Strong' : binduVal >= 25 ? 'Average' : 'Weak') : '\u2014';
                  return (
                    <View key={i} style={i % 2 === 0 ? S.trow : S.trowAlt}>
                      <Text style={S.td}>{s.sign}</Text>
                      <Text style={[S.td, { flex: 0.6, fontFamily: 'Helvetica-Bold', color }]}>{binduVal !== null ? String(binduVal) : '\u2014'}</Text>
                      <Text style={[S.td, { flex: 0.7, fontSize: TINY, color }]}>{strengthLabel}</Text>
                    </View>
                  );
                })}
                <View style={[S.trow, { backgroundColor: C.purplePale }]}>
                  <Text style={[S.td, { fontFamily: 'Helvetica-Bold', color: C.purple }]}>Total</Text>
                  <Text style={[S.td, { flex: 0.6, fontFamily: 'Helvetica-Bold', color: C.purple }]}>{sarvaTotal !== null ? String(sarvaTotal) : safe(sarva.total)}</Text>
                  <Text style={[S.td, { flex: 0.7 }]}></Text>
                </View>
              </View>
            </>
          )}

          {!hasSarvaData && <Body>Ashtakavarga data not available for this chart.</Body>}

          <Footer name={data.name} section="Ashtakavarga" />
        </Page>

        {bhinnaEntries.length > 0 && (
          <Page size="A4" style={S.page}>
            <PH />
            <SectionTitle>Bhinna Ashtakavarga (Per Planet)</SectionTitle>
            <Body>Each planet contributes bindus to each sign. Higher totals indicate the planet is stronger in certain signs.</Body>
            <View style={S.table}>
              <View style={S.thead}>
                <Text style={[S.th, { flex: 1.2 }]}>Planet</Text>
                <Text style={[S.th, { flex: 0.6 }]}>Total Bindus</Text>
              </View>
              {bhinnaEntries.map((entry, i) => (
                <View key={i} style={i % 2 === 0 ? S.trow : S.trowAlt}>
                  <Text style={[S.td, { flex: 1.2 }]}>{entry.planet}</Text>
                  <Text style={[S.td, { flex: 0.6, fontFamily: 'Helvetica-Bold' }]}>{String(entry.total)}</Text>
                </View>
              ))}
            </View>

            <SectionTitle>What Ashtakavarga Scores Mean</SectionTitle>
            <View style={S.card}>
              <BulletList items={[
                '28+ bindus: Strong sign. Planets transiting here give good results.',
                '25-27 bindus: Average strength. Mixed results during transits.',
                'Below 25 bindus: Weak sign. Planets transiting here may cause difficulties.',
                'Total Sarva score of 337 is standard. Above 337 is favorable overall.',
              ]} />
            </View>

            <Footer name={data.name} section="Ashtakavarga" />
          </Page>
        )}
      </>
    );
  };

  // =========================================================================
  // SECTION 17: SHADBALA (3 pages)
  // =========================================================================
  const ShadbalaPages = () => {
    const planetsArr = safeArr(shad.planets ?? shad.data);
    const planetsObj = safeObj(shad.planets);

    const shadEntries: Array<{ planet: string; totalVirupas: string; requiredVirupas: string; ratio: string; isStrong: boolean }> = [];

    if (planetsArr.length > 0) {
      for (const p of planetsArr) {
        const sp = safeObj(p);
        const total = typeof sp.totalVirupas === 'number' ? sp.totalVirupas : 0;
        const required = typeof sp.requiredVirupas === 'number' ? sp.requiredVirupas : 0;
        const ratio = typeof sp.ratio === 'number' ? sp.ratio : (required > 0 ? total / required : 0);
        shadEntries.push({
          planet: safe(sp.planet),
          totalVirupas: typeof sp.totalVirupas === 'number' ? sp.totalVirupas.toFixed(1) : safe(sp.totalVirupas),
          requiredVirupas: typeof sp.requiredVirupas === 'number' ? sp.requiredVirupas.toFixed(1) : safe(sp.requiredVirupas),
          ratio: typeof ratio === 'number' ? ratio.toFixed(2) : safe(sp.ratio),
          isStrong: typeof ratio === 'number' ? ratio >= 1.0 : Boolean(sp.isStrong),
        });
      }
    } else {
      const source = Object.keys(planetsObj).length > 0 ? planetsObj : shad;
      for (const key of Object.keys(source)) {
        const val = safeObj(source[key]);
        if (val.totalVirupas !== undefined) {
          const total = typeof val.totalVirupas === 'number' ? val.totalVirupas : 0;
          const required = typeof val.requiredVirupas === 'number' ? val.requiredVirupas : 0;
          const ratio = typeof val.ratio === 'number' ? val.ratio : (required > 0 ? total / required : 0);
          shadEntries.push({
            planet: key,
            totalVirupas: typeof val.totalVirupas === 'number' ? val.totalVirupas.toFixed(1) : safe(val.totalVirupas),
            requiredVirupas: typeof val.requiredVirupas === 'number' ? val.requiredVirupas.toFixed(1) : safe(val.requiredVirupas),
            ratio: typeof ratio === 'number' ? ratio.toFixed(2) : safe(val.ratio),
            isStrong: typeof ratio === 'number' ? ratio >= 1.0 : Boolean(val.isStrong),
          });
        }
      }
    }

    return (
      <>
        <SectionDividerPage number="17" title="Shadbala" subtitle="Six-fold planetary strength analysis" />
        <Page size="A4" style={S.page}>
          <PH />
          <ChapterHeader number="17" title="Shadbala (Planetary Strength)" />

          <Body>Shadbala measures planetary strength through 6 components: Sthana Bala (positional), Dig Bala (directional), Kala Bala (temporal), Cheshta Bala (motional), Naisargika Bala (natural), and Drik Bala (aspectual). A planet is strong when its ratio (total / required virupas) is 1.0 or above.</Body>

          {shadEntries.length > 0 ? (
            <>
              <SectionTitle>Shadbala Strength Visualization</SectionTitle>
              <View style={{ marginBottom: 10, padding: 6, backgroundColor: C.parchmentDark, borderRadius: 2 }}>
                <ShadbalaBars entries={shadEntries} />
              </View>

              <View style={{ marginTop: 8, marginBottom: 12 }}>
                <Text style={{ fontSize: TINY, color: C.inkMid, lineHeight: LH }}>Bar length shows planetary strength ratio (green = strong ≥1.0, orange = moderate 0.7–1.0, red = weak &lt;0.7). The vertical dashed line marks the required strength threshold.</Text>
              </View>

              <View style={S.table}>
                <View style={S.thead}>
                  <Text style={[S.th, { flex: 1.3 }]}>Planet</Text>
                  <Text style={S.th}>Total</Text>
                  <Text style={S.th}>Required</Text>
                  <Text style={[S.th, { flex: 0.7 }]}>Ratio</Text>
                  <Text style={[S.th, { flex: 0.7 }]}>Status</Text>
                </View>
                {shadEntries.map((entry, i) => {
                  const sl = entry.isStrong
                    ? { style: S.strengthHigh, textStyle: S.strengthTextHigh, label: 'Strong' }
                    : { style: S.strengthLow, textStyle: S.strengthTextLow, label: 'Weak' };
                  return (
                    <View key={i} style={i % 2 === 0 ? S.trow : S.trowAlt}>
                      <Text style={[S.td, { flex: 1.3, fontFamily: 'Helvetica-Bold' }]}>{entry.planet}</Text>
                      <Text style={S.td}>{entry.totalVirupas}</Text>
                      <Text style={S.td}>{entry.requiredVirupas}</Text>
                      <Text style={[S.td, { flex: 0.7, fontFamily: 'Helvetica-Bold', color: entry.isStrong ? C.green : C.red }]}>{entry.ratio}</Text>
                      <View style={[S.td, { flex: 0.7, flexDirection: 'row' }]}>
                        <View style={sl.style}>
                          <Text style={sl.textStyle}>{sl.label}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>

              {gt.shadbalaRanking.length > 0 && (
                <>
                  <SectionTitle>Strength Ranking (Strongest to Weakest)</SectionTitle>
                  <View style={S.card}>
                    {gt.shadbalaRanking.map((planet, i) => (
                      <Text key={i} style={S.bodySmall}>{i + 1}. {planet}</Text>
                    ))}
                  </View>
                </>
              )}
            </>
          ) : (
            <View style={S.card}>
              <Body>Shadbala requires precise birth time for accurate calculation. If birth time is approximate, Shadbala values may not be computed.</Body>
            </View>
          )}

          <Footer name={data.name} section="Shadbala" />
        </Page>
      </>
    );
  };

  // =========================================================================
  // SECTION 18: CAREER & WEALTH (4 pages)
  // =========================================================================
  const CareerPages = () => {
    const h10 = chartData.houses.find(h => h.house === 10);
    const h2 = chartData.houses.find(h => h.house === 2);
    const h11 = chartData.houses.find(h => h.house === 11);

    return (
      <>
        <SectionDividerPage number="18" title="Career & Wealth" subtitle="Professional direction, financial patterns, and wealth indicators" />
        <Page size="A4" style={S.page}>
          <PH />
          <ChapterHeader number="18" title="Career & Wealth Analysis" />

          <SectionTitle>10th House (Career House)</SectionTitle>
          <View style={S.cardGold}>
            <InfoRow label="Sign" value={h10?.sign ?? '\u2014'} />
            <InfoRow label="Lord" value={h10?.lord ?? '\u2014'} />
            <InfoRow label="Lord in House" value={String(gt.houseAnalysis[10]?.lordHouse ?? '\u2014')} />
            <InfoRow label="Planets in 10th" value={gt.houseAnalysis[10]?.planets.join(', ') || 'None'} />
          </View>

          <SectionTitle>Ideal Professions</SectionTitle>
          <View style={S.tagRow}>
            {gt.careerIndicators.professions.map((p, i) => (
              <View key={i} style={S.tagGold}>
                <Text style={{ fontSize: TINY, color: C.goldDeep }}>{p}</Text>
              </View>
            ))}
          </View>

          <SectionTitle>Business vs Service</SectionTitle>
          <View style={S.card}>
            <Body>{gt.careerIndicators.businessVsService}</Body>
          </View>

          <SectionTitle>Career Interpretation</SectionTitle>
          <View style={S.cardPurple}>
            <Body>{getAI('career', `With the 10th house in ${h10?.sign ?? 'unknown'} ruled by ${h10?.lord ?? 'unknown'}, your career path is influenced by the qualities of this sign. ${gt.careerIndicators.businessVsService}. The ideal professions include ${gt.careerIndicators.professions.slice(0, 3).join(', ')}.`)}</Body>
          </View>

          <SectionTitle>Peak Career Periods</SectionTitle>
          <View style={S.card}>
            <Body>{gt.careerIndicators.peakPeriods}</Body>
          </View>

          <Footer name={data.name} section="Career & Wealth" />
        </Page>

        <Page size="A4" style={S.page}>
          <PH />
          <SectionTitle>Wealth Analysis</SectionTitle>
          <View style={S.cardGold}>
            <InfoRow label="2nd House (Wealth)" value={`${h2?.sign ?? '\u2014'} \u2014 Lord: ${h2?.lord ?? '\u2014'}`} />
            <InfoRow label="11th House (Gains)" value={`${h11?.sign ?? '\u2014'} \u2014 Lord: ${h11?.lord ?? '\u2014'}`} />
            <InfoRow label="Planets in 2nd" value={gt.houseAnalysis[2]?.planets.join(', ') || 'None'} />
            <InfoRow label="Planets in 11th" value={gt.houseAnalysis[11]?.planets.join(', ') || 'None'} />
          </View>

          <View style={S.cardPurple}>
            <Text style={S.label}>YOGI BABA</Text>
            <Body>{getAI('wealth', `Your 2nd house of wealth is in ${h2?.sign ?? 'unknown'} and the 11th house of gains is in ${h11?.sign ?? 'unknown'}. The relationship between these houses and their lords determines your financial trajectory.`)}</Body>
          </View>

          <SectionTitle>Dhana (Wealth) Yogas in Your Chart</SectionTitle>
          <View style={S.card}>
            {gt.detectedYogas.filter(y => y.type.toLowerCase().includes('wealth') || y.name.toLowerCase().includes('dhana') || y.name.toLowerCase().includes('lakshmi')).length > 0 ? (
              gt.detectedYogas.filter(y => y.type.toLowerCase().includes('wealth') || y.name.toLowerCase().includes('dhana') || y.name.toLowerCase().includes('lakshmi')).map((y, i) => (
                <View key={i} style={{ marginBottom: 6 }}>
                  <Text style={S.purpleText}>{y.name}</Text>
                  <Text style={S.bodySmall}>{y.meaning}</Text>
                </View>
              ))
            ) : (
              <Body>No specific Dhana Yogas detected. Wealth potential should be assessed from the 2nd and 11th house lords, their placement, and related dasha periods.</Body>
            )}
          </View>

          <Footer name={data.name} section="Career & Wealth" />
        </Page>
      </>
    );
  };

  // =========================================================================
  // SECTION 19: MARRIAGE & RELATIONSHIPS (4 pages)
  // =========================================================================
  const MarriagePages = () => {
    const h7 = chartData.houses.find(h => h.house === 7);
    const venus = chartData.planets.find(p => p.name === 'Venus');
    const jupiter = chartData.planets.find(p => p.name === 'Jupiter');

    return (
      <>
        <SectionDividerPage number="19" title="Marriage & Relationships" subtitle="Partnership indicators, timing of marriage, and relationship dynamics" />
        <Page size="A4" style={S.page}>
          <PH />
          <ChapterHeader number="19" title="Marriage & Relationships" />

          <SectionTitle>7th House Analysis</SectionTitle>
          <View style={S.cardGold}>
            <InfoRow label="7th House Sign" value={h7?.sign ?? '\u2014'} />
            <InfoRow label="7th Lord" value={gt.marriageIndicators.sevenThLord} />
            <InfoRow label="7th Lord in House" value={String(gt.houseAnalysis[7]?.lordHouse ?? '\u2014')} />
            <InfoRow label="Planets in 7th" value={gt.houseAnalysis[7]?.planets.join(', ') || 'None'} />
            <InfoRow label="Partner Characteristics" value={`${gt.marriageIndicators.partnerSign} qualities`} />
          </View>

          <SectionTitle>Venus (Karaka for Marriage)</SectionTitle>
          {venus && (
            <View style={S.card}>
              <InfoRow label="Venus Sign" value={venus.sign} />
              <InfoRow label="Venus House" value={String(venus.house)} />
              <InfoRow label="Venus Dignity" value={gt.planetDignities.Venus?.status ?? 'Neutral'} />
              <InfoRow label="Retrograde" value={venus.isRetrograde ? 'Yes' : 'No'} />
            </View>
          )}

          {data.gender === 'female' && jupiter && (
            <>
              <SectionTitle>Jupiter (Husband Karaka for Females)</SectionTitle>
              <View style={S.card}>
                <InfoRow label="Jupiter Sign" value={jupiter.sign} />
                <InfoRow label="Jupiter House" value={String(jupiter.house)} />
                <InfoRow label="Jupiter Dignity" value={gt.planetDignities.Jupiter?.status ?? 'Neutral'} />
              </View>
            </>
          )}

          <SectionTitle>Marriage Timing</SectionTitle>
          <View style={S.card}>
            <Body>{gt.marriageIndicators.timing}</Body>
          </View>

          <SectionTitle>Relationship Interpretation</SectionTitle>
          <View style={S.cardPurple}>
            <Body>{getAI('marriage', `With the 7th house in ${h7?.sign ?? 'unknown'} ruled by ${gt.marriageIndicators.sevenThLord}, your partnerships are influenced by ${h7?.sign ?? 'unknown'} qualities. Venus in ${venus?.sign ?? 'unknown'} (house ${venus?.house ?? 'unknown'}) further shapes your romantic inclinations.`)}</Body>
          </View>

          <Footer name={data.name} section="Marriage & Relationships" />
        </Page>
      </>
    );
  };

  // =========================================================================
  // SECTION 20: HEALTH BLUEPRINT (4 pages)
  // =========================================================================
  const HealthPages = () => {
    const h6 = chartData.houses.find(h => h.house === 6);

    return (
      <>
        <SectionDividerPage number="20" title="Health Blueprint" subtitle="Physical constitution, vulnerable systems, and wellness guidance" />
        <Page size="A4" style={S.page}>
          <PH />
          <ChapterHeader number="20" title="Health Blueprint" />

          <SectionTitle>Constitution</SectionTitle>
          <View style={S.cardGold}>
            <InfoRow label="Body Constitution" value={gt.healthIndicators.constitution} />
            <InfoRow label="6th House Sign" value={h6?.sign ?? '\u2014'} />
            <InfoRow label="6th House Lord" value={h6?.lord ?? '\u2014'} />
            <InfoRow label="Ascendant Element" value={gt.ascendantTraits.element} />
          </View>

          <SectionTitle>Vulnerable Body Systems</SectionTitle>
          {gt.healthIndicators.vulnerableSystems.length > 0 ? (
            <BulletList items={gt.healthIndicators.vulnerableSystems} />
          ) : (
            <Body>No specific vulnerabilities detected from planetary afflictions. General health maintenance is recommended.</Body>
          )}

          <SectionTitle>Health Interpretation</SectionTitle>
          <View style={S.cardPurple}>
            <Body>{getAI('health', `Your ${gt.ascendantTraits.element} constitution gives you certain inherent strengths and vulnerabilities. ${gt.healthIndicators.vulnerableSystems.length > 0 ? `Pay attention to ${gt.healthIndicators.vulnerableSystems.slice(0, 3).join(', ')}.` : 'Your chart does not show severe health afflictions.'} Regular check-ups and a balanced lifestyle are always recommended.`)}</Body>
          </View>

          <SectionTitle>Dietary Recommendations</SectionTitle>
          <View style={S.card}>
            <Body>{gt.healthIndicators.dietaryElement}</Body>
          </View>

          <SectionTitle>Lifestyle Recommendations</SectionTitle>
          <View style={S.card}>
            <BulletList items={[
              `Exercise suited for ${gt.ascendantTraits.element} types: ${gt.ascendantTraits.element === 'Fire' ? 'Swimming, cooling exercises, moderate cardio' : gt.ascendantTraits.element === 'Earth' ? 'Vigorous cardio, running, dynamic exercises' : gt.ascendantTraits.element === 'Air' ? 'Yoga, grounding exercises, weight training' : 'Warming exercises, hot yoga, martial arts'}`,
              `Best sleep schedule: ${gt.ascendantTraits.element === 'Fire' || gt.ascendantTraits.element === 'Air' ? 'Early to bed (10 PM), at least 7-8 hours' : 'Regular schedule, 7 hours minimum, avoid oversleeping'}`,
              `Stress management: ${gt.ascendantTraits.element === 'Fire' ? 'Meditation, cooling pranayama (Sheetali)' : gt.ascendantTraits.element === 'Water' ? 'Journaling, talk therapy, creative expression' : gt.ascendantTraits.element === 'Air' ? 'Grounding meditation, nature walks, routine' : 'Dynamic activities, social engagement, variety'}`,
            ]} />
          </View>

          <Footer name={data.name} section="Health Blueprint" />
        </Page>
      </>
    );
  };

  // =========================================================================
  // SECTION 21: EDUCATION & CHILDREN (3 pages)
  // =========================================================================
  const EducationChildrenPages = () => {
    const h5 = chartData.houses.find(h => h.house === 5);
    const h4 = chartData.houses.find(h => h.house === 4);
    const mercury = chartData.planets.find(p => p.name === 'Mercury');
    const jupiter = chartData.planets.find(p => p.name === 'Jupiter');

    return (
      <>
        <SectionDividerPage number="21" title="Education & Children" subtitle="Academic potential, creative intelligence, and progeny indicators" />
        <Page size="A4" style={S.page}>
          <PH />
          <ChapterHeader number="21" title="Education & Children" />

          <SectionTitle>5th House (Intelligence & Children)</SectionTitle>
          <View style={S.cardGold}>
            <InfoRow label="5th House Sign" value={h5?.sign ?? '\u2014'} />
            <InfoRow label="5th Lord" value={h5?.lord ?? '\u2014'} />
            <InfoRow label="5th Lord in House" value={String(gt.houseAnalysis[5]?.lordHouse ?? '\u2014')} />
            <InfoRow label="Planets in 5th" value={gt.houseAnalysis[5]?.planets.join(', ') || 'None'} />
          </View>

          <SectionTitle>4th House (Formal Education)</SectionTitle>
          <View style={S.card}>
            <InfoRow label="4th House Sign" value={h4?.sign ?? '\u2014'} />
            <InfoRow label="4th Lord" value={h4?.lord ?? '\u2014'} />
            <InfoRow label="Planets in 4th" value={gt.houseAnalysis[4]?.planets.join(', ') || 'None'} />
          </View>

          <SectionTitle>Key Education Planets</SectionTitle>
          <View style={S.card}>
            {mercury && <InfoRow label="Mercury (Intellect)" value={`${mercury.sign} H${mercury.house} [${gt.planetDignities.Mercury?.status}]`} />}
            {jupiter && <InfoRow label="Jupiter (Wisdom)" value={`${jupiter.sign} H${jupiter.house} [${gt.planetDignities.Jupiter?.status}]`} />}
          </View>

          <SectionTitle>Education Interpretation</SectionTitle>
          <View style={S.cardPurple}>
            <Body>{getAI('education', `The 5th house in ${h5?.sign ?? 'unknown'} indicates creative intelligence and learning style. Mercury in ${mercury?.sign ?? 'unknown'} and Jupiter in ${jupiter?.sign ?? 'unknown'} further shape your academic potential. The 4th house in ${h4?.sign ?? 'unknown'} shows the foundation of formal education.`)}</Body>
          </View>

          <SectionTitle>Children Indicators</SectionTitle>
          <View style={S.card}>
            <Body>The 5th house ({h5?.sign ?? 'unknown'}, lord {h5?.lord ?? 'unknown'}) is the primary house for children. Jupiter as the natural karaka for children is in {jupiter?.sign ?? 'unknown'} (house {jupiter?.house ?? 'unknown'}). {gt.houseAnalysis[5]?.planets.length ? `The presence of ${gt.houseAnalysis[5]?.planets.join(' and ')} in the 5th house influences progeny matters.` : 'The 5th lord\'s placement and dasha timing will determine the timing of children.'}</Body>
          </View>

          <Footer name={data.name} section="Education & Children" />
        </Page>
      </>
    );
  };

  // =========================================================================
  // SECTION 22: SPIRITUAL PATH (2 pages)
  // =========================================================================
  const SpiritualPages = () => {
    const h9 = chartData.houses.find(h => h.house === 9);
    const h12 = chartData.houses.find(h => h.house === 12);
    const jupiter = chartData.planets.find(p => p.name === 'Jupiter');
    const ketu = chartData.planets.find(p => p.name === 'Ketu');

    return (
      <>
        <SectionDividerPage number="22" title="Spiritual Path" subtitle="Dharma, moksha, and the soul's journey" />
        <Page size="A4" style={S.page}>
          <PH />
          <ChapterHeader number="22" title="Spiritual Path" />

          <SectionTitle>9th House (Dharma & Fortune)</SectionTitle>
          <View style={S.cardGold}>
            <InfoRow label="9th House Sign" value={h9?.sign ?? '\u2014'} />
            <InfoRow label="9th Lord" value={h9?.lord ?? '\u2014'} />
            <InfoRow label="9th Lord in House" value={String(gt.houseAnalysis[9]?.lordHouse ?? '\u2014')} />
          </View>

          <SectionTitle>12th House (Moksha & Liberation)</SectionTitle>
          <View style={S.card}>
            <InfoRow label="12th House Sign" value={h12?.sign ?? '\u2014'} />
            <InfoRow label="12th Lord" value={h12?.lord ?? '\u2014'} />
            <InfoRow label="Planets in 12th" value={gt.houseAnalysis[12]?.planets.join(', ') || 'None'} />
          </View>

          <SectionTitle>Spiritual Indicators</SectionTitle>
          <View style={S.card}>
            {jupiter && <InfoRow label="Jupiter (Guru)" value={`${jupiter.sign} H${jupiter.house}`} />}
            {ketu && <InfoRow label="Ketu (Moksha Karaka)" value={`${ketu.sign} H${ketu.house}`} />}
          </View>

          <SectionTitle>Spiritual Interpretation</SectionTitle>
          <View style={S.cardPurple}>
            <Body>{getAI('spiritual', `Your 9th house of dharma in ${h9?.sign ?? 'unknown'} and 12th house of moksha in ${h12?.sign ?? 'unknown'} define your spiritual journey. Ketu in ${ketu?.sign ?? 'unknown'} (house ${ketu?.house ?? 'unknown'}) indicates areas of past-life spiritual development and current detachment tendencies.`)}</Body>
          </View>

          <Footer name={data.name} section="Spiritual Path" />
        </Page>
      </>
    );
  };

  // =========================================================================
  // SECTION 23: LUCKY FACTORS (2 pages)
  // =========================================================================
  const LuckyFactorsPages = () => (
    <>
      <SectionDividerPage number="23" title="Lucky Factors" subtitle="Auspicious numbers, colors, days, and directions for you" />
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="23" title="Lucky Factors" />

        <View style={S.cardGold}>
          <InfoRow label="Lucky Numbers" value={gt.luckyFactors.numbers.join(', ')} />
          <InfoRow label="Lucky Colors" value={gt.luckyFactors.colors.join(', ')} />
          <InfoRow label="Lucky Days" value={gt.luckyFactors.days.join(', ')} />
          <InfoRow label="Lucky Directions" value={gt.luckyFactors.directions.join(', ')} />
          <InfoRow label="Primary Gemstone" value={gt.luckyFactors.gemstone} />
          <InfoRow label="Lucky Metal" value={gt.luckyFactors.metal} />
        </View>

        <SectionTitle>Color Guidance</SectionTitle>
        <View style={S.card}>
          <BulletList items={[
            `Wear ${gt.luckyFactors.colors[0] ?? 'your lucky color'} on important occasions for positive energy`,
            `Use ${gt.luckyFactors.colors.join(' and ')} in your workplace and home decor`,
            `Avoid wearing colors associated with enemy planets`,
          ]} />
        </View>

        <SectionTitle>Number Guidance</SectionTitle>
        <View style={S.card}>
          <BulletList items={[
            `Numbers ${gt.luckyFactors.numbers.join(' and ')} are favorable for important dates and decisions`,
            `Choose phone numbers, house numbers, and vehicle numbers containing these digits`,
            `Dates adding up to ${gt.luckyFactors.numbers[0] ?? 1} or ${gt.luckyFactors.numbers[1] ?? 9} are especially auspicious`,
          ]} />
        </View>

        <SectionTitle>Direction Guidance</SectionTitle>
        <View style={S.card}>
          <BulletList items={[
            `Face ${gt.luckyFactors.directions[0] ?? 'East'} while working, studying, or meditating`,
            `The ${gt.luckyFactors.directions[0] ?? 'East'} direction is most auspicious for your ascendant`,
            `Place your head towards ${gt.luckyFactors.directions[0] ?? 'East'} or South while sleeping`,
          ]} />
        </View>

        <Footer name={data.name} section="Lucky Factors" />
      </Page>
    </>
  );

  // =========================================================================
  // SECTION 24: VEDIC REMEDIES (4 pages)
  // =========================================================================
  const RemedyPages = () => (
    <>
      <SectionDividerPage number="24" title="Vedic Remedies" subtitle="Mantras, gemstones, fasting, and charitable acts for planetary harmony" />
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="24" title="Vedic Remedies" />

        <SectionTitle>Planet Quick Reference</SectionTitle>
        <Text style={[S.bodySmall, { color: C.inkLight, marginBottom: 4, fontStyle: 'italic' }]}>Each planet has specific colors, numbers, days, directions, and grains associated with it. Use these for daily remedies and worship.</Text>
        <View style={S.table}>
          <View style={S.thead}>
            <Text style={[S.th, { flex: 0.7 }]}>Planet</Text>
            <Text style={[S.th, { flex: 1.2 }]}>Color</Text>
            <Text style={[S.th, { flex: 0.5 }]}>No.</Text>
            <Text style={[S.th, { flex: 0.8 }]}>Day</Text>
            <Text style={[S.th, { flex: 0.8 }]}>Direction</Text>
            <Text style={[S.th, { flex: 0.7 }]}>Metal</Text>
            <Text style={[S.th, { flex: 0.9 }]}>Grain</Text>
          </View>
          {['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'].map((p, i) => {
            const pd = gt.planetFullData[p];
            return pd ? (
              <View key={p} style={i % 2 === 0 ? S.trow : S.trowAlt}>
                <Text style={[S.td, { flex: 0.7, fontFamily: 'Helvetica-Bold', color: C.inkDark }]}>{p}</Text>
                <Text style={[S.td, { flex: 1.2 }]}>{pd.color}</Text>
                <Text style={[S.td, { flex: 0.5 }]}>{pd.number}</Text>
                <Text style={[S.td, { flex: 0.8 }]}>{pd.day}</Text>
                <Text style={[S.td, { flex: 0.8 }]}>{pd.direction}</Text>
                <Text style={[S.td, { flex: 0.7 }]}>{pd.metal}</Text>
                <Text style={[S.td, { flex: 0.9 }]}>{pd.grain}</Text>
              </View>
            ) : null;
          })}
        </View>

        <SectionTitle>Planetary Mantras</SectionTitle>
        <Text style={[S.bodySmall, { color: C.inkLight, marginBottom: 4, fontStyle: 'italic' }]}>Sacred sound vibrations for each planet. Chant with devotion on the recommended day for maximum benefit.</Text>
        <View style={S.table}>
          <View style={S.thead}>
            <Text style={[S.th, { flex: 0.8 }]}>Planet</Text>
            <Text style={[S.th, { flex: 2.5 }]}>Mantra</Text>
            <Text style={S.th}>Deity</Text>
            <Text style={[S.th, { flex: 0.7 }]}>Count</Text>
          </View>
          {gt.remedies.mantras.map((m, i) => (
            <View key={i} style={i % 2 === 0 ? S.trow : S.trowAlt}>
              <Text style={[S.td, { flex: 0.8, fontFamily: 'Helvetica-Bold' }]}>{m.planet}</Text>
              <Text style={[S.td, { flex: 2.5, fontSize: TINY }]}>{m.mantra}</Text>
              <Text style={S.td}>{m.deity}</Text>
              <Text style={[S.td, { flex: 0.7, fontSize: TINY }]}>{m.count}</Text>
            </View>
          ))}
        </View>

        <Footer name={data.name} section="Vedic Remedies" />
      </Page>

      <Page size="A4" style={S.page}>
        <PH />
        <SectionTitle>Gemstone Recommendations</SectionTitle>
        <Text style={[S.bodySmall, { color: C.inkLight, marginBottom: 4, fontStyle: 'italic' }]}>Wear gemstones to channel planetary energy. Always energize with the planet{'\u2019'}s mantra before first wearing.</Text>
        <View style={S.table}>
          <View style={S.thead}>
            <Text style={S.th}>Gemstone</Text>
            <Text style={[S.th, { flex: 0.7 }]}>Planet</Text>
            <Text style={S.th}>Finger</Text>
            <Text style={[S.th, { flex: 0.7 }]}>Metal</Text>
            <Text style={[S.th, { flex: 0.7 }]}>Day</Text>
          </View>
          {gt.remedies.gemstones.map((g, i) => (
            <View key={i} style={i % 2 === 0 ? S.trow : S.trowAlt}>
              <Text style={[S.td, { fontFamily: 'Helvetica-Bold' }]}>{g.stone}</Text>
              <Text style={[S.td, { flex: 0.7 }]}>{g.planet}</Text>
              <Text style={S.td}>{g.finger}</Text>
              <Text style={[S.td, { flex: 0.7 }]}>{g.metal}</Text>
              <Text style={[S.td, { flex: 0.7 }]}>{g.day}</Text>
            </View>
          ))}
        </View>

        <SectionTitle>Fasting Schedule</SectionTitle>
        <Text style={[S.bodySmall, { color: C.inkLight, marginBottom: 4, fontStyle: 'italic' }]}>Observing a fast (Vrat) on the associated day appeases the planet and reduces its negative effects.</Text>
        <View style={S.table}>
          <View style={S.thead}>
            <Text style={S.th}>Day</Text>
            <Text style={S.th}>Planet</Text>
          </View>
          {gt.remedies.fasting.map((f, i) => (
            <View key={i} style={i % 2 === 0 ? S.trow : S.trowAlt}>
              <Text style={[S.td, { fontFamily: 'Helvetica-Bold' }]}>{f.day}</Text>
              <Text style={S.td}>{f.planet}</Text>
            </View>
          ))}
        </View>

        <SectionTitle>Charitable Donations (Daan)</SectionTitle>
        <Text style={[S.bodySmall, { color: C.inkLight, marginBottom: 4, fontStyle: 'italic' }]}>Donating specific items on specific days transfers negative karma to the recipient and brings planetary blessings.</Text>
        <View style={S.table}>
          <View style={S.thead}>
            <Text style={S.th}>Items</Text>
            <Text style={[S.th, { flex: 0.7 }]}>Day</Text>
            <Text style={S.th}>To Whom</Text>
            <Text style={[S.th, { flex: 0.7 }]}>Planet</Text>
          </View>
          {gt.remedies.charity.map((c, i) => (
            <View key={i} style={i % 2 === 0 ? S.trow : S.trowAlt}>
              <Text style={S.td}>{c.item}</Text>
              <Text style={[S.td, { flex: 0.7 }]}>{c.day}</Text>
              <Text style={S.td}>{c.toWhom}</Text>
              <Text style={[S.td, { flex: 0.7 }]}>{c.planet}</Text>
            </View>
          ))}
        </View>

        <SectionTitle>Priority Remedies</SectionTitle>
        <View style={S.card}>
          {gt.planetRemediesNeeded.length > 0 ? (
            <BulletList items={gt.planetRemediesNeeded.map(p => {
              const m = gt.remedies.mantras.find(mm => mm.planet === p);
              const g = gt.remedies.gemstones.find(gg => gg.planet === p);
              return `${p} (${gt.planetDignities[p]?.status}): Chant ${m?.mantra ?? 'planetary mantra'} on ${m?.day ?? 'the assigned day'}. Consider ${g?.stone ?? 'the recommended gemstone'} after consulting an expert.`;
            })} />
          ) : (
            <Body>No planets are severely afflicted. General remedies for strengthening your ascendant lord ({chartData.ascendant.lord}) are recommended for overall well-being.</Body>
          )}
        </View>

        <SectionTitle>Rudraksha Recommendations</SectionTitle>
        <View style={S.card}>
          <BulletList items={[
            `${chartData.ascendant.lord === 'Sun' ? '1 Mukhi or 12 Mukhi' : chartData.ascendant.lord === 'Moon' ? '2 Mukhi' : chartData.ascendant.lord === 'Mars' ? '3 Mukhi' : chartData.ascendant.lord === 'Mercury' ? '4 Mukhi' : chartData.ascendant.lord === 'Jupiter' ? '5 Mukhi' : chartData.ascendant.lord === 'Venus' ? '6 Mukhi' : chartData.ascendant.lord === 'Saturn' ? '7 Mukhi' : chartData.ascendant.lord === 'Rahu' ? '8 Mukhi' : '9 Mukhi'} Rudraksha for ascendant lord ${chartData.ascendant.lord}`,
            '5 Mukhi Rudraksha is universally beneficial for all',
            'Wear on a Monday after energizing with Om Namah Shivaya',
          ]} />
        </View>

        <Footer name={data.name} section="Vedic Remedies" />
      </Page>
    </>
  );

  // =========================================================================
  // SECTION 25: NAKSHATRA ANALYSIS (3 pages)
  // =========================================================================
  const NakshatraPages = () => {
    const nakshatras27 = [
      'Ashwini','Bharani','Krittika','Rohini','Mrigashira','Ardra','Punarvasu','Pushya','Ashlesha',
      'Magha','Purva Phalguni','Uttara Phalguni','Hasta','Chitra','Swati','Vishakha','Anuradha','Jyeshtha',
      'Mula','Purva Ashadha','Uttara Ashadha','Shravana','Dhanishtha','Shatabhisha','Purva Bhadrapada','Uttara Bhadrapada','Revati',
    ];
    const moonNak = chartData.planets.find(p => p.name === 'Moon')?.nakshatra ?? '';
    const sunNak = chartData.planets.find(p => p.name === 'Sun')?.nakshatra ?? '';
    const moonNakIdx = nakshatras27.findIndex(n => moonNak.toLowerCase().includes(n.toLowerCase().split(' ')[0]));
    return (
      <>
        <SectionDividerPage number="25" title="Nakshatra Analysis" subtitle="The 27 lunar mansions — your soul's cosmic address" />
        <Page size="A4" style={S.page}>
          <PH />
          <ChapterHeader number="25" title="Nakshatra Analysis (Lunar Mansions)" />
          <SectionTitle>Moon Nakshatra — {moonNak}</SectionTitle>
          <View style={S.cardGold}>
            <View style={S.row}>
              <View style={S.col}>
                <InfoRow label="Moon Nakshatra" value={moonNak} />
                <InfoRow label="Moon Pada" value={String(chartData.planets.find(p => p.name === 'Moon')?.pada ?? '—')} />
                <InfoRow label="Nakshatra Number" value={moonNakIdx >= 0 ? String(moonNakIdx + 1) + ' of 27' : '—'} />
              </View>
              <View style={S.col}>
                <InfoRow label="Sun Nakshatra" value={sunNak} />
                <InfoRow label="Lagna Nakshatra" value={chartData.planets.find(p => p.name === 'Moon')?.nakshatra ?? '—'} />
              </View>
            </View>
          </View>
          <View style={S.card}>
            <Text style={S.label}>MOON NAKSHATRA INTERPRETATION</Text>
            <Body>{getAI('moon_nakshatra', `The Moon placed in ${moonNak} nakshatra shapes your emotional instincts, subconscious patterns, and mother's influence. This nakshatra carries specific divine energy that influences your inner world.`)}</Body>
          </View>
          <SectionTitle>Sun Nakshatra — {sunNak}</SectionTitle>
          <View style={S.card}>
            <Text style={S.label}>SUN NAKSHATRA INTERPRETATION</Text>
            <Body>{getAI('sun_nakshatra', `The Sun in ${sunNak} nakshatra defines your soul's expression, identity, and dharmic purpose. It shapes how your life force manifests in the world.`)}</Body>
          </View>
          <SectionTitle>Ascendant Nakshatra</SectionTitle>
          <View style={S.cardPurple}>
            <Body>{getAI('lagna_nakshatra', `Your ascendant nakshatra carries the energy of your physical incarnation and life purpose. It shapes your outer personality, approach to life, and the blessings of your rising lord.`)}</Body>
          </View>
          <Footer name={data.name} section="Nakshatra Analysis" />
        </Page>
        <Page size="A4" style={S.page}>
          <PH />
          <SectionTitle>The 27 Nakshatras — Wheel of Lunar Mansions</SectionTitle>
          {/* Visual nakshatra wheel as bar grid */}
          <View style={{ marginTop: 8, marginBottom: 12 }}>
            {[0,1,2].map(row => (
              <View key={row} style={[S.row, { marginBottom: 6, gap: 4 }]}>
                {nakshatras27.slice(row * 9, row * 9 + 9).map((nak, i) => {
                  const idx = row * 9 + i;
                  const isMoon = moonNak.toLowerCase().includes(nak.toLowerCase().split(' ')[0]);
                  const isSun = sunNak.toLowerCase().includes(nak.toLowerCase().split(' ')[0]);
                  return (
                    <View key={i} style={[{
                      flex: 1, borderRadius: 3, padding: 5, alignItems: 'center',
                      backgroundColor: isMoon ? C.gold : isSun ? C.purpleMid : C.parchmentDark,
                      borderWidth: 1, borderColor: isMoon ? C.goldDeep : isSun ? C.purple : C.parchmentDeep,
                    }]}>
                      <Text style={{ fontSize: 6, color: isMoon ? C.purpleDark : isSun ? C.white : C.inkMid, fontFamily: 'Helvetica-Bold', textAlign: 'center' }}>{idx + 1}</Text>
                      <Text style={{ fontSize: 5.5, color: isMoon ? C.purpleDark : isSun ? C.white : C.inkBody, textAlign: 'center', marginTop: 1 }}>{nak.split(' ')[0]}</Text>
                    </View>
                  );
                })}
              </View>
            ))}
            <View style={[S.row, { marginTop: 6, gap: 16, justifyContent: 'center' }]}>
              <View style={[S.row, { gap: 4, alignItems: 'center' }]}>
                <View style={{ width: 12, height: 12, backgroundColor: C.gold, borderRadius: 2 }} />
                <Text style={S.label}>Moon Nakshatra</Text>
              </View>
              <View style={[S.row, { gap: 4, alignItems: 'center' }]}>
                <View style={{ width: 12, height: 12, backgroundColor: C.purpleMid, borderRadius: 2 }} />
                <Text style={S.label}>Sun Nakshatra</Text>
              </View>
            </View>
          </View>
          <SectionTitle>Nakshatra Compatibility & Strengths</SectionTitle>
          <View style={S.table}>
            <View style={S.thead}>
              <Text style={[S.th, { flex: 1.5 }]}>Factor</Text>
              <Text style={[S.th, { flex: 2 }]}>Moon ({moonNak})</Text>
              <Text style={[S.th, { flex: 2 }]}>Sun ({sunNak})</Text>
            </View>
            {[
              ['Deity', 'Lunar deity governs', 'Solar deity governs'],
              ['Symbol', 'Emotional archetype', 'Soul expression symbol'],
              ['Pada', String(chartData.planets.find(p=>p.name==='Moon')?.pada ?? '—'), String(chartData.planets.find(p=>p.name==='Sun')?.pada ?? '—')],
              ['Navamsa Sign', 'Emotional navamsa', 'Atma navamsa'],
            ].map(([f, m, s], i) => (
              <View key={i} style={i % 2 === 0 ? S.trow : S.trowAlt}>
                <Text style={[S.td, { flex: 1.5, fontFamily: 'Helvetica-Bold' }]}>{f}</Text>
                <Text style={[S.td, { flex: 2 }]}>{m}</Text>
                <Text style={[S.td, { flex: 2 }]}>{s}</Text>
              </View>
            ))}
          </View>
          <Footer name={data.name} section="Nakshatra Analysis" />
        </Page>
      </>
    );
  };

  // =========================================================================
  // SECTION 26: TRANSIT ANALYSIS — Current Year (3 pages)
  // =========================================================================
  const TransitPages = () => {
    const currentYear = new Date().getFullYear();
    return (
      <>
        <SectionDividerPage number="26" title={`Transit Analysis ${currentYear}`} subtitle={`Planetary transits and their effects on your chart in ${currentYear}`} />
        <Page size="A4" style={S.page}>
          <PH />
          <ChapterHeader number="26" title={`Gochar — Transit Analysis ${currentYear}`} />
          <SectionTitle>Overview of {currentYear} Transits</SectionTitle>
          <View style={S.cardGold}>
            <Body>{getAI('transits_overview', `The planetary transits of ${currentYear} bring significant shifts across multiple life areas. Key planets are moving through critical houses relative to your birth chart, activating specific themes.`)}</Body>
          </View>
          <SectionTitle>Saturn Transit (Shani Gochar)</SectionTitle>
          <View style={S.card}>
            <Text style={S.label}>SATURN'S CURRENT TRANSIT EFFECTS</Text>
            <Body>{getAI('saturn_transit', `Saturn's transit through its current sign brings karmic lessons and structured growth to specific areas of your life. Saturn rewards discipline and penalizes shortcuts during its transit.`)}</Body>
          </View>
          <SectionTitle>Jupiter Transit (Guru Gochar)</SectionTitle>
          <View style={S.cardPurple}>
            <Text style={S.label}>JUPITER'S BLESSINGS THIS YEAR</Text>
            <Body>{getAI('jupiter_transit', `Jupiter's transit illuminates the house it occupies, bringing expansion, wisdom, and opportunities to that life area. As the greatest benefic, Jupiter's transit is the most auspicious annual event.`)}</Body>
          </View>
          <Footer name={data.name} section={`Transit Analysis ${currentYear}`} />
        </Page>
        <Page size="A4" style={S.page}>
          <PH />
          <SectionTitle>Rahu-Ketu Nodal Transit</SectionTitle>
          <View style={S.card}>
            <Body>{getAI('rahu_ketu_transit', `The nodal axis of Rahu and Ketu transiting through their current signs creates karmic inflection points. This 18-month transit brings both obsessions and releases that align with your soul's evolutionary path.`)}</Body>
          </View>
          <SectionTitle>Transit Impact on Your Houses</SectionTitle>
          <View style={S.table}>
            <View style={S.thead}>
              <Text style={[S.th, { flex: 0.8 }]}>Planet</Text>
              <Text style={[S.th, { flex: 1.2 }]}>Current Sign</Text>
              <Text style={[S.th, { flex: 1 }]}>Your House</Text>
              <Text style={[S.th, { flex: 2 }]}>Key Effect</Text>
            </View>
            {[
              ['Saturn', 'Aquarius', gt.houseAnalysis[11] ? '11th' : '—', 'Discipline in social gains'],
              ['Jupiter', 'Taurus', gt.houseAnalysis[2] ? '2nd' : '—', 'Wealth and speech blessings'],
              ['Rahu', 'Pisces', gt.houseAnalysis[12] ? '12th' : '—', 'Foreign, spiritual karmas'],
              ['Ketu', 'Virgo', gt.houseAnalysis[6] ? '6th' : '—', 'Health and service release'],
              ['Mars', chartData.ascendant.sign, '1st', 'Energy and initiative boost'],
            ].map(([pl, sg, hs, eff], i) => (
              <View key={i} style={i % 2 === 0 ? S.trow : S.trowAlt}>
                <Text style={[S.td, { flex: 0.8, fontFamily: 'Helvetica-Bold', color: C.purple }]}>{pl}</Text>
                <Text style={[S.td, { flex: 1.2 }]}>{sg}</Text>
                <Text style={[S.td, { flex: 1 }]}>{hs}</Text>
                <Text style={[S.td, { flex: 2 }]}>{eff}</Text>
              </View>
            ))}
          </View>
          <Footer name={data.name} section={`Transit Analysis ${currentYear}`} />
        </Page>
      </>
    );
  };

  // =========================================================================
  // SECTION 27: YEAR-BY-YEAR PREDICTIONS (5 pages)
  // =========================================================================
  const YearPredictionsPages = () => {
    const currentYear = new Date().getFullYear();
    const years = [currentYear, currentYear+1, currentYear+2, currentYear+3, currentYear+4];
    return (
      <>
        <SectionDividerPage number="27" title="Year-by-Year Predictions" subtitle={`Detailed annual forecasts for ${currentYear}–${currentYear+4}`} />
        {years.map((yr, i) => (
          <Page key={yr} size="A4" style={S.page}>
            <PH />
            {i === 0 && <ChapterHeader number="27" title="Year-by-Year Predictions" />}
            <View style={{ marginBottom: 8 }}>
              <View style={[S.chapterBand, { marginBottom: 12 }]}>
                <View style={[S.chapterNumBadge, { backgroundColor: C.gold }]}>
                  <Text style={S.chapterNumText}>{String(yr).slice(2)}</Text>
                </View>
                <View>
                  <Text style={S.chapterTitle}>{yr} — Annual Forecast</Text>
                  <Text style={S.chapterSub}>Dasha: {gt.currentDasha.mahadasha} Mahadasha</Text>
                </View>
              </View>
            </View>
            <View style={S.cardGold}>
              <Body>{getAI(`year_${yr}`, `In ${yr}, the planetary periods active in your chart bring a blend of opportunities and challenges. This year's transits interact with your birth chart in meaningful ways across career, relationships, health, and spiritual growth.`)}</Body>
            </View>
            <SectionTitle>Key Focus Areas for {yr}</SectionTitle>
            <View style={[S.row, { gap: 10 }]}>
              {[
                { area: 'Career', icon: '✦', color: C.purple },
                { area: 'Relationships', icon: '♥', color: C.goldDeep },
                { area: 'Health', icon: '✿', color: C.green },
                { area: 'Wealth', icon: '◆', color: C.orange },
              ].map(({ area, icon, color }) => (
                <View key={area} style={[{ flex: 1, backgroundColor: C.parchmentDark, borderRadius: 4, padding: 10, borderTopWidth: 3, borderTopColor: color, alignItems: 'center' }]}>
                  <Text style={{ fontSize: 16, color }}>{icon}</Text>
                  <Text style={[S.purpleText, { fontSize: SMALL, marginTop: 4, color, textAlign: 'center' }]}>{area}</Text>
                  <Text style={[S.bodySmall, { textAlign: 'center', marginTop: 4, color: C.inkBody }]}>See full forecast above</Text>
                </View>
              ))}
            </View>
            <Footer name={data.name} section={`${yr} Predictions`} />
          </Page>
        ))}
      </>
    );
  };

  const ConclusionPages = () => (
    <>
      <SectionDividerPage number="28" title="Conclusion" subtitle="Summary of your chart, key strengths, challenges, and life direction" />
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="25" title="Conclusion & Life Direction" />

        <SectionTitle>Key Strengths</SectionTitle>
        <View style={S.cardGold}>
          <BulletList items={[
            `${chartData.ascendant.sign} ascendant gives you ${gt.personalityKeywords.slice(0, 3).join(', ').toLowerCase()} qualities`,
            ...(gt.shadbalaRanking.length > 0 ? [`${gt.shadbalaRanking[0]} is your strongest planet, empowering its significations`] : []),
            ...gt.detectedYogas.filter(y => y.strength === 'Strong').slice(0, 2).map(y => `${y.name} yoga brings ${y.meaning.split('.')[0].toLowerCase()}`),
            ...(gt.planetDignities[chartData.ascendant.lord]?.status === 'Exalted' || gt.planetDignities[chartData.ascendant.lord]?.status === 'Own Sign'
              ? [`Ascendant lord ${chartData.ascendant.lord} is ${gt.planetDignities[chartData.ascendant.lord].status}, strengthening your overall chart`]
              : []),
          ]} />
        </View>

        <SectionTitle>Main Challenges</SectionTitle>
        <View style={S.card}>
          <BulletList items={[
            ...gt.planetRemediesNeeded.slice(0, 2).map(p => `${p} is ${gt.planetDignities[p]?.status}, requiring attention to its significations`),
            ...gt.detectedDoshas.filter(d => d.present).slice(0, 2).map(d => `${d.name} is present (${d.severity}), which may affect related life areas`),
            ...(gt.planetRemediesNeeded.length === 0 && gt.detectedDoshas.filter(d => d.present).length === 0
              ? ['No major afflictions detected. Focus on maximizing your strengths and opportunities.']
              : []),
          ]} />
        </View>

        <SectionTitle>Life Direction</SectionTitle>
        <View style={S.cardPurple}>
          <Body>{getAI('conclusion', `As a ${chartData.ascendant.sign} ascendant with Moon in ${moonPlanet?.sign ?? 'unknown'}, your life path combines ${gt.ascendantTraits.element} energy with emotional depth. The current ${gt.currentDasha.mahadasha} Mahadasha period shapes your immediate opportunities. Focus on your strengths in ${gt.careerIndicators.professions.slice(0, 2).join(' and ')}, maintain health through a ${gt.ascendantTraits.element}-appropriate lifestyle, and follow the recommended remedies to harmonize planetary influences. Your chart shows significant potential — with awareness and effort, you can navigate challenges and fulfill your life purpose.`)}</Body>
        </View>

        <View style={S.goldDivider} />
        <View style={{ alignItems: 'center', marginTop: 12 }}>
          <Text style={[S.goldText, { fontSize: 12, textAlign: 'center' }]}>Om Sarve Bhavantu Sukhinah</Text>
          <Text style={[S.bodySmall, { textAlign: 'center', color: C.inkMid, marginTop: 4 }]}>May all beings be happy and free from suffering</Text>
        </View>

        <Footer name={data.name} section="Conclusion" />
      </Page>
    </>
  );

  // =========================================================================
  // DOCUMENT — All 25 sections
  // =========================================================================
  return (
    <Document
      title={`Vedic Kundli Report - ${data.name}`}
      author="Aroha Astrology"
      subject="Vedic Astrology Birth Chart Analysis"
    >
      {/* Cover */}
      <CoverPage />

      {/* Section 1: Birth Details (2 pages) */}
      <BirthDetailsPages />

      {/* Section 2: Ascendant Analysis (4 pages) */}
      <AscendantPages />

      {/* Sections 3-11: Planet Analysis (2 pages each = 18 pages) */}
      {PLANET_NAMES.map((planet, i) => (
        <PlanetSection key={planet} planet={planet} sectionNum={3 + i} />
      ))}

      {/* Section 12: House Analysis (6 pages) */}
      <HouseAnalysisPages />

      {/* Section 13: Yoga Analysis (4 pages) */}
      <YogaPages />

      {/* Section 14: Dosha Analysis (4 pages) */}
      <DoshaPages />

      {/* Section 15: Vimshottari Dasha (6 pages) */}
      <DashaPages />

      {/* Section 16: Ashtakavarga (4 pages) */}
      <AshtakavargaPages />

      {/* Section 17: Shadbala (3 pages) */}
      <ShadbalaPages />

      {/* Section 18: Career & Wealth (4 pages) */}
      <CareerPages />

      {/* Section 19: Marriage & Relationships (4 pages) */}
      <MarriagePages />

      {/* Section 20: Health Blueprint (4 pages) */}
      <HealthPages />

      {/* Section 21: Education & Children (3 pages) */}
      <EducationChildrenPages />

      {/* Section 22: Spiritual Path (2 pages) */}
      <SpiritualPages />

      {/* Section 23: Lucky Factors (2 pages) */}
      <LuckyFactorsPages />

      {/* Section 24: Vedic Remedies (4 pages) */}
      <RemedyPages />

      {/* Section 25: Nakshatra Analysis (3 pages) */}
      <NakshatraPages />

      {/* Section 26: Transit Analysis (3 pages) */}
      <TransitPages />

      {/* Section 27: Year-by-Year Predictions (6 pages) */}
      <YearPredictionsPages />

      {/* Section 28: Conclusion (2 pages) */}
      <ConclusionPages />

      {/* Glossary of Vedic Terms */}
      <Page size="A4" style={S.page}>
        <PH />
        <ChapterHeader number="G" title="Glossary of Vedic Astrology Terms" />
        <View style={S.table}>
          <View style={S.thead}>
            <Text style={[S.th, { flex: 1.2 }]}>Term</Text>
            <Text style={[S.th, { flex: 3 }]}>Meaning</Text>
          </View>
          {[
            ['Ascendant (Lagna)', 'The zodiac sign rising on the eastern horizon at the exact time of birth. It defines personality, physical body, and life direction.'],
            ['Ashtakavarga', 'A point-based system where each planet contributes bindus (points) to signs. Signs with 28+ points are strong; below 25 are weak.'],
            ['Antardasha', 'A sub-period within a Mahadasha. Each Mahadasha contains 9 Antardashas ruled by different planets.'],
            ['Bhava', 'A house in the birth chart. There are 12 Bhavas, each governing different life areas.'],
            ['Combustion (Asta)', 'When a planet is too close to the Sun, it loses its strength and visibility. The planet becomes "burnt."'],
            ['Debilitated (Neecha)', 'A planet placed in its weakest sign. It struggles to express its natural qualities and needs remedies.'],
            ['Dasha', 'A planetary period system used for timing predictions. The most common is Vimshottari Dasha (120-year cycle).'],
            ['Dosha', 'An affliction or flaw in the chart caused by specific planetary placements. Examples: Mangal Dosha, Kaal Sarp Dosha.'],
            ['Exalted (Uchcha)', 'A planet placed in its strongest sign. It expresses its best qualities with maximum power.'],
            ['Gochar (Transit)', 'The current real-time movement of planets through the zodiac, compared against your birth chart.'],
            ['Graha', 'A celestial body or planet in Vedic astrology. The 9 Grahas are: Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, Rahu, Ketu.'],
            ['Kendra', 'Angular houses (1st, 4th, 7th, 10th) — the most powerful positions in a chart. Planets here have strong influence.'],
            ['Ketu', 'The south node of the Moon. Represents spiritual liberation, past-life karma, detachment, and psychic abilities.'],
            ['Mahadasha', 'A major planetary period lasting several years. It determines the primary theme of that life phase.'],
            ['Mangal Dosha', 'An affliction caused by Mars in certain houses (1, 4, 7, 8, 12). Affects marriage and relationships.'],
            ['Muhurta', 'An auspicious time window selected for important events like marriage, business start, or travel.'],
            ['Nakshatra', 'One of 27 lunar mansions. Each spans 13°20\' of the zodiac. Your birth nakshatra reveals deep personality traits.'],
            ['Navamsa (D9)', 'The 9th divisional chart. Most important for marriage analysis, spiritual evolution, and inner strength.'],
            ['Pada (Charan)', 'Each Nakshatra is divided into 4 padas (quarters). The pada determines the starting syllable of one\'s name.'],
            ['Pratyantardasha', 'A sub-sub-period within an Antardasha. Used for fine-tuning predictions to specific months.'],
            ['Rahu', 'The north node of the Moon. Represents worldly desires, obsession, unconventional paths, and material ambition.'],
            ['Rashi', 'A zodiac sign. There are 12 Rashis: Mesha (Aries) through Meena (Pisces).'],
            ['Retrograde (Vakri)', 'When a planet appears to move backward from Earth\'s perspective. Indicates internalized or delayed energy.'],
            ['Sade Sati', 'Saturn\'s 7.5-year transit over your Moon sign. A period of transformation, challenges, and eventual growth.'],
            ['Shadbala', 'Six-fold planetary strength analysis measuring positional, directional, temporal, motional, inherent, and aspect strength.'],
            ['Trikona', 'Trine houses (1st, 5th, 9th) — the most auspicious houses. Planets here bring fortune, wisdom, and merit.'],
            ['Tithi', 'A lunar day based on the angular distance between Sun and Moon. There are 30 Tithis in a lunar month.'],
            ['Vimshottari Dasha', 'The most widely used dasha system. A 120-year cycle divided among 9 planets based on birth Nakshatra.'],
            ['Yoga', 'A specific planetary combination that produces a particular result. Examples: Raja Yoga (power), Dhana Yoga (wealth).'],
          ].map(([term, meaning], i) => (
            <View key={i} style={i % 2 === 0 ? S.trow : S.trowAlt}>
              <Text style={[S.td, { flex: 1.2, fontFamily: 'Helvetica-Bold', color: C.purple }]}>{term}</Text>
              <Text style={[S.td, { flex: 3 }]}>{meaning}</Text>
            </View>
          ))}
        </View>
        <Footer name={data.name} section="Glossary" />
      </Page>
    </Document>
  );
}
