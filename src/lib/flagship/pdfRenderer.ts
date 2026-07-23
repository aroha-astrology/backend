// =============================================================================
// Flagship Life Report — PDF renderer. Pure function: takes the ALREADY-
// CACHED FlagshipReportContent (everything this file touches was already
// computed once by assembleFlagshipReport and stored in prime_reports.analysis
// — no AI calls, no database reads, no re-fetching of kundli/remedies data
// happen here) plus three cover-page strings, and returns a PDF Buffer.
//
// Uses pdfkit (pure JS, no native/Chromium dependency) rather than an
// HTML-to-PDF headless-browser approach — this backend runs on a memory-
// constrained EC2 box (see perf-hardening history in this repo), and a
// ~300MB Chromium install for one feature is the wrong tradeoff.
//
// English-only: matches the flagship report's registry `translate()`, which
// is already a documented no-op for this batch.
// =============================================================================

import PDFDocument from 'pdfkit';
import type { FlagshipReportContent } from './orchestrator.js';

export interface FlagshipPdfMeta {
  fullName: string;
  dateOfBirth: string;
  gender: string | null;
}

const PAGE_MARGIN = 50;
const HEADING_COLOR = '#4a2e6b';
const BODY_COLOR = '#222222';
const MUTED_COLOR = '#666666';

function addSectionHeading(doc: PDFKit.PDFDocument, title: string): void {
  doc.fontSize(18).fillColor(HEADING_COLOR).font('Helvetica-Bold').text(title, { align: 'left' });
  doc.moveDown(0.5);
  doc.fillColor(BODY_COLOR).font('Helvetica');
}

function addSubheading(doc: PDFKit.PDFDocument, title: string): void {
  doc.moveDown(0.3);
  doc.fontSize(12).font('Helvetica-Bold').fillColor(BODY_COLOR).text(title);
  doc.font('Helvetica');
}

function addParagraph(doc: PDFKit.PDFDocument, text: string): void {
  doc.fontSize(11).fillColor(BODY_COLOR).text(text, { align: 'left' });
  doc.moveDown(0.5);
}

function addLabelValueLine(doc: PDFKit.PDFDocument, label: string, value: string): void {
  doc
    .fontSize(11)
    .fillColor(MUTED_COLOR)
    .text(`${label}: `, { continued: true })
    .fillColor(BODY_COLOR)
    .text(value);
}

function addBullet(doc: PDFKit.PDFDocument, text: string): void {
  doc.fontSize(11).fillColor(BODY_COLOR).text(`•  ${text}`);
}

function addLifeAreaSection(
  doc: PDFKit.PDFDocument,
  title: string,
  area: {
    intro: string;
    currentPhase: string;
    strengths: string;
    challenges: string;
    guidance: string;
  },
): void {
  doc.addPage();
  addSectionHeading(doc, title);
  addParagraph(doc, area.intro);
  addSubheading(doc, 'Current Phase');
  addParagraph(doc, area.currentPhase);
  addSubheading(doc, 'Strengths');
  addParagraph(doc, area.strengths);
  addSubheading(doc, 'Challenges');
  addParagraph(doc, area.challenges);
  addSubheading(doc, 'Guidance');
  addParagraph(doc, area.guidance);
}

export async function renderFlagshipReportPdf(
  content: FlagshipReportContent,
  meta: FlagshipPdfMeta,
): Promise<Buffer> {
  const doc = new PDFDocument({ margin: PAGE_MARGIN, autoFirstPage: true, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // --- Cover page ---
  doc
    .fontSize(26)
    .font('Helvetica-Bold')
    .fillColor(HEADING_COLOR)
    .text('Aroha Prime', { align: 'center' });
  doc
    .fontSize(18)
    .font('Helvetica')
    .fillColor(BODY_COLOR)
    .text('Complete Life Report', { align: 'center' });
  doc.moveDown(2);
  doc.fontSize(16).font('Helvetica-Bold').text(meta.fullName, { align: 'center' });
  doc.fontSize(11).font('Helvetica').fillColor(MUTED_COLOR);
  doc.text(`Date of Birth: ${meta.dateOfBirth}`, { align: 'center' });
  if (meta.gender) doc.text(`Gender: ${meta.gender}`, { align: 'center' });

  // --- Executive Summary ---
  doc.addPage();
  addSectionHeading(doc, 'Executive Summary');
  addParagraph(doc, content.executiveSummary.overallSummary);
  addSubheading(doc, 'Key Strengths');
  addParagraph(doc, content.executiveSummary.keyStrengths);
  addSubheading(doc, 'Areas to Watch');
  addParagraph(doc, content.executiveSummary.areasToWatch);
  addSubheading(doc, 'Closing Guidance');
  addParagraph(doc, content.executiveSummary.closingGuidance);

  // --- Avkahada Chakra ---
  // NOTE: `computeAvkahadaChakra` (astro-engine/avkahadaChakra.ts) returns
  // `AvkahadaChakra | null` — it returns null when the stored chart is
  // missing Moon data (longitude/house/sign). `FlagshipReportContent.avkahada`
  // inherits that nullability via `ReturnType<typeof computeAvkahadaChakra>`,
  // so this section is guarded rather than assumed always-present.
  doc.addPage();
  addSectionHeading(doc, 'Avkahada Chakra');
  if (content.avkahada) {
    addLabelValueLine(doc, 'Varna', content.avkahada.varna);
    addLabelValueLine(doc, 'Vashya', content.avkahada.vashya);
    addLabelValueLine(doc, 'Yoni', content.avkahada.yoni);
    addLabelValueLine(doc, 'Gana', content.avkahada.gana);
    addLabelValueLine(doc, 'Nadi', content.avkahada.nadi);
    addLabelValueLine(doc, 'Paya', content.avkahada.paya);
    addLabelValueLine(doc, 'Naming Syllable', content.avkahada.namingSyllable);
    addLabelValueLine(doc, 'Moon Sign', content.avkahada.moonSign);
    addLabelValueLine(doc, 'Moon Nakshatra', content.avkahada.moonNakshatra);
  } else {
    addParagraph(doc, 'Avkahada Chakra data is not available for this chart.');
  }

  // --- Ascendant Analysis ---
  doc.addPage();
  addSectionHeading(doc, 'Ascendant Analysis');
  addParagraph(doc, content.ascendant.intro);
  addSubheading(doc, 'Personality Traits');
  addParagraph(doc, content.ascendant.personalityTraits);
  addSubheading(doc, 'Appearance');
  addParagraph(doc, content.ascendant.appearance);
  addSubheading(doc, 'Temperament');
  addParagraph(doc, content.ascendant.temperament);

  // --- Planetary Positions ---
  doc.addPage();
  addSectionHeading(doc, 'Planetary Positions');
  for (const p of content.planetPositions) {
    addBullet(
      doc,
      `${p.planet} — ${p.sign}, House ${p.house}, ${p.nakshatra} Pada ${p.nakshatraPada}${p.isRetrograde ? ' (Retrograde)' : ''}`,
    );
  }

  // --- House Table ---
  doc.moveDown();
  addSubheading(doc, 'House Table');
  for (const h of content.houseTable) {
    addBullet(doc, `House ${h.house}: ${h.sign} (Lord: ${h.lord})`);
  }

  // --- Yogas ---
  doc.addPage();
  addSectionHeading(doc, 'Yogas');
  if (content.yogas.length === 0) {
    addParagraph(doc, 'No significant yogas identified in this chart.');
  } else {
    for (const y of content.yogas) {
      addSubheading(doc, y.name);
      addParagraph(doc, y.description);
    }
  }

  // --- Doshas ---
  doc.addPage();
  addSectionHeading(doc, 'Doshas');
  const presentDoshas = content.doshas.filter((d) => d.present);
  if (presentDoshas.length === 0) {
    addParagraph(doc, 'No significant doshas identified in this chart.');
  } else {
    for (const d of presentDoshas) {
      addSubheading(doc, `${d.name} (${d.severity})`);
      addParagraph(doc, d.description);
    }
  }

  // --- Dasha Timeline ---
  doc.addPage();
  addSectionHeading(doc, 'Dasha Timeline');
  for (const d of content.dashaTimeline) {
    addBullet(doc, `${d.planet}: ${d.startDate} to ${d.endDate}${d.isCurrent ? ' (Current)' : ''}`);
  }

  // --- Ashtakavarga ---
  doc.addPage();
  addSectionHeading(doc, 'Ashtakavarga (Sarvashtakavarga)');
  for (const row of content.ashtakavarga.bySign) {
    addBullet(doc, `${row.sign}: ${row.bindus} bindus`);
  }

  // --- Shadbala ---
  doc.addPage();
  addSectionHeading(doc, 'Shadbala (Six-Fold Planetary Strength)');
  for (const s of content.shadbala) {
    addBullet(
      doc,
      `${s.planet}: ${s.totalVirupas.toFixed(1)} / ${s.requiredVirupas} virupas — ${s.isStrong ? 'Strong' : 'Below required strength'}`,
    );
  }

  // --- Numerology ---
  doc.addPage();
  addSectionHeading(doc, 'Numerology');
  addParagraph(doc, content.numerology.intro);
  addSubheading(doc, 'Life Path');
  addParagraph(doc, content.numerology.lifePathStory);
  addSubheading(doc, 'Expression');
  addParagraph(doc, content.numerology.expressionStory);
  addSubheading(doc, 'Soul Urge');
  addParagraph(doc, content.numerology.soulUrgeStory);
  addSubheading(doc, 'Personality');
  addParagraph(doc, content.numerology.personalityStory);

  // --- Life Areas ---
  addLifeAreaSection(doc, 'Career', content.career);
  addLifeAreaSection(doc, 'Finance', content.finance);
  addLifeAreaSection(doc, 'Health', content.health);
  addLifeAreaSection(doc, 'Love', content.love);
  addLifeAreaSection(doc, 'Education', content.education);

  // --- Remedies ---
  doc.addPage();
  addSectionHeading(doc, 'Remedies');
  addParagraph(doc, content.remedies.intro);
  for (const [title, note] of Object.entries(content.remedies.notes)) {
    addSubheading(doc, title);
    addParagraph(doc, note);
  }

  doc.end();
  return finished;
}
