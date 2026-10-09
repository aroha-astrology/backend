/**
 * Provenance registry — every feature and rule in the engine has an entry
 * here tagging it with its historical classification and source ids.
 *
 * The five classification tags mirror the brief exactly:
 *   ANCIENT_CLASSICAL   — rule directly supported by a verified old primary text
 *   LATER_CLASSICAL     — traditional roots but not the earliest core corpus
 *   MODERN_ASTROLOGICAL — a 20th-century or later system (KP, Lal Kitab, etc.)
 *   AROHA_PROPRIETARY   — Aroha's own scoring, blending, or AI layer
 *   UNVERIFIED          — no source check completed yet
 *
 * Source ids (e.g. "BPHS-SHB-001") are short opaque strings that map to
 * rows in D-source-register.md.  They are added incrementally as texts are
 * actually read; an empty array means the check is pending.
 *
 * API responses, report payloads, and AI prompts should call
 * `getProvenance(featureId)` and include the result as a `calculation_basis`
 * field rather than hard-coding the word "classical".
 *
 * This file is part of Release R0.  All entries start as UNVERIFIED; the
 * classification and source arrays are filled in as each batch is audited.
 */

// ---------------------------------------------------------------------------
// Tag type
// ---------------------------------------------------------------------------

export type ProvenanceTag =
  | 'ANCIENT_CLASSICAL'
  | 'LATER_CLASSICAL'
  | 'MODERN_ASTROLOGICAL'
  | 'AROHA_PROPRIETARY'
  | 'UNVERIFIED';

// ---------------------------------------------------------------------------
// Source id
// ---------------------------------------------------------------------------

/** Short opaque id matching a row in D-source-register.md. */
export type SourceId = string;

// ---------------------------------------------------------------------------
// Provenance entry
// ---------------------------------------------------------------------------

export interface ProvenanceEntry {
  featureId: string;
  featureName: string;
  tag: ProvenanceTag;
  /** Source ids from D-source-register.md that support this classification. */
  sourceIds: SourceId[];
  /** Free-text note displayed in the audit matrix. */
  note?: string;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Master registry keyed by featureId.
 *
 * Feature ids are stable strings used throughout the engine, API, and audit
 * documents.  Prefix conventions:
 *   SHB-*   Shadbala sub-balas
 *   AKV-*   Ashtakavarga
 *   VCH-*   Divisional charts
 *   VMD-*   Vimshottari dasha
 *   CHD-*   Chara dasha
 *   YGN-*   Yogini dasha
 *   DOH-*   Dosha engine
 *   YGA-*   Yoga engine
 *   MT-*    Matchmaking / Ashtakoota / Dashakoota
 *   PAN-*   Panchanga
 *   MUH-*   Muhurta
 *   KP-*    KP system
 *   TAJ-*   Varshaphal / Tajika
 *   LKB-*   Lal Kitab
 *   NUM-*   Numerology
 *   ACG-*   Astrocartography
 *   VST-*   Vastu
 *   PLM-*   Palmistry
 *   GEM-*   Gemstones
 *   YNT-*   Yantras
 *   PPK-*   Pancha Pakshi
 *   REC-*   Rectification
 *   RPT-*   Reports / provenance blocks
 *   ARCH-*  Architecture (Metrologist, decision engine)
 */
const REGISTRY: ProvenanceEntry[] = [
  // -------------------------------------------------------------------------
  // Shadbala
  // -------------------------------------------------------------------------
  { featureId: 'SHB-UCH', featureName: 'Uchcha Bala', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'SHB-SAP',
    featureName: 'Saptavargaja Bala',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Code uses D1 only; document claims full 7-varga — S3 fault',
  },
  { featureId: 'SHB-OJH', featureName: 'Ojhayugma Bala', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'SHB-KEN', featureName: 'Kendradi Bala', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'SHB-DRK_pos', featureName: 'Drekkana Bala', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'SHB-DIG',
    featureName: 'Dig Bala',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Code uses whole houses; S5 fault',
  },
  {
    featureId: 'SHB-NAT',
    featureName: 'Nathonnatha Bala',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Day/night guessed from Sun house; S1 fault',
  },
  { featureId: 'SHB-PAK', featureName: 'Paksha Bala', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'SHB-TRI',
    featureName: 'Tribhaga Bala',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Code gives 60, document says 30; which is right is not yet read from the text',
  },
  { featureId: 'SHB-VAR', featureName: 'Vara Bala', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'SHB-MAS', featureName: 'Masa Bala', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'SHB-ABD', featureName: 'Abda Bala', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'SHB-HOR',
    featureName: 'Hora Bala',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Sunrise assumed 06:00 UT — S1 fault',
  },
  {
    featureId: 'SHB-AYA',
    featureName: 'Ayana Bala',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Missing from code — S6 fault',
  },
  {
    featureId: 'SHB-CHE',
    featureName: 'Chesta Bala',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Sun and Moon flat 30; speed-ratio formula for others — S7 fault',
  },
  { featureId: 'SHB-NAI', featureName: 'Naisargika Bala', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'SHB-DRK',
    featureName: 'Drik Bala',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Whole-house aspects clamped 0-60; S8 fault',
  },
  {
    featureId: 'SHB-THR',
    featureName: 'Shadbala minimum thresholds',
    tag: 'UNVERIFIED',
    sourceIds: [],
  },

  // -------------------------------------------------------------------------
  // Ashtakavarga
  // -------------------------------------------------------------------------
  {
    featureId: 'AKV-BAV',
    featureName: 'BAV contributor tables (337 total)',
    tag: 'ANCIENT_CLASSICAL',
    sourceIds: ['BJ-9.1-9.7'],
    note: 'All 56 lists match Bṛhat Jātaka 9.1-9.7 verse by verse',
  },
  { featureId: 'AKV-TRI', featureName: 'Trikona Shodhana', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'AKV-EKA',
    featureName: 'Ekadhipatya Shodhana',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Convention credited to Raman; A1 fault',
  },
  { featureId: 'AKV-RGK', featureName: 'Rasi Gunakara', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'AKV-GGK', featureName: 'Graha Gunakara', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'AKV-RP', featureName: 'Rasi Pinda', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'AKV-GP',
    featureName: 'Graha Pinda',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'sum×Gunakar formula likely wrong — A2 fault',
  },
  { featureId: 'AKV-SP', featureName: 'Shodhya Pinda', tag: 'UNVERIFIED', sourceIds: [] },

  // -------------------------------------------------------------------------
  // Divisional charts
  // -------------------------------------------------------------------------
  { featureId: 'VCH-D1', featureName: 'D1 Rasi', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'VCH-D2',
    featureName: 'D2 Hora',
    tag: 'ANCIENT_CLASSICAL',
    sourceIds: ['BJ-1.11'],
    note: 'A second scheme is recorded in Bṛhat Jātaka 1.12 and is not offered',
  },
  {
    featureId: 'VCH-D3',
    featureName: 'D3 Drekkana',
    tag: 'ANCIENT_CLASSICAL',
    sourceIds: ['BJ-1.11'],
    note: 'A second scheme is recorded in Bṛhat Jātaka 1.12 and is not offered',
  },
  { featureId: 'VCH-D4', featureName: 'D4 Chaturthamsa', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'VCH-D7', featureName: 'D7 Saptamsa', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'VCH-D9',
    featureName: 'D9 Navamsa',
    tag: 'ANCIENT_CLASSICAL',
    sourceIds: ['BJ-1.6'],
  },
  { featureId: 'VCH-D10', featureName: 'D10 Dasamsa', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'VCH-D12',
    featureName: 'D12 Dwadasamsa',
    tag: 'ANCIENT_CLASSICAL',
    sourceIds: ['BJ-1.6'],
  },
  { featureId: 'VCH-D16', featureName: 'D16 Shodasamsa', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'VCH-D20', featureName: 'D20 Vimsamsa', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'VCH-D24', featureName: 'D24 Siddhamsa', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'VCH-D27', featureName: 'D27 Bhamsa', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'VCH-D30',
    featureName: 'D30 Trimsamsa',
    tag: 'UNVERIFIED',
    sourceIds: ['BJ-1.7'],
    note: 'Lords and widths match Bṛhat Jātaka 1.7. The verse names lords only; the sign drawn (always the odd sign of the lord) has no verified source',
  },
  { featureId: 'VCH-D40', featureName: 'D40 Khavedamsa', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'VCH-D45', featureName: 'D45 Akshavedamsa', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'VCH-D60', featureName: 'D60 Shastiamsa', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'VCH-EXT',
    featureName: 'D5/D6/D8/D11/D14/D21/D81/D108 (extra)',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Generic rule with no source — V2 fault; label only',
  },

  // -------------------------------------------------------------------------
  // Dashas
  // -------------------------------------------------------------------------
  {
    featureId: 'VMD-CYC',
    featureName: 'Vimshottari 120-year cycle',
    tag: 'UNVERIFIED',
    sourceIds: [],
  },
  {
    featureId: 'VMD-DUR',
    featureName: 'Vimshottari planetary durations',
    tag: 'UNVERIFIED',
    sourceIds: [],
  },
  {
    featureId: 'VMD-BAL',
    featureName: 'Vimshottari birth balance',
    tag: 'UNVERIFIED',
    sourceIds: [],
  },
  { featureId: 'VMD-ANT', featureName: 'Vimshottari antardasha', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'VMD-PRA',
    featureName: 'Vimshottari pratyantardasha',
    tag: 'UNVERIFIED',
    sourceIds: [],
  },
  { featureId: 'VMD-SOO', featureName: 'Vimshottari sookshma', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'VMD-PRA2', featureName: 'Vimshottari prana', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'CHD-FULL',
    featureName: 'Chara Dasha (complete)',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Antardasha and karakas missing; direction formula unverified — Y3 fault',
  },
  {
    featureId: 'YGN-FULL',
    featureName: 'Yogini Dasha',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Start formula (nakshatra+3)%8 unverified — Y4 fault',
  },

  // -------------------------------------------------------------------------
  // Doshas
  // -------------------------------------------------------------------------
  {
    featureId: 'DOH-MNG',
    featureName: 'Mangal Dosha',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: '10 cancellation rules not in known primary texts — D1 fault',
  },
  {
    featureId: 'DOH-KAL',
    featureName: 'Kaal Sarp',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: '12-name classification is modern — D2 fault; label MODERN_ASTROLOGICAL',
  },
  { featureId: 'DOH-PIT', featureName: 'Pitra Dosha', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'DOH-GCH', featureName: 'Guru Chandal', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'DOH-GRH', featureName: 'Grahan Dosha', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'DOH-KEM',
    featureName: 'Kemadruma Dosha',
    tag: 'UNVERIFIED',
    sourceIds: ['BJ-13.3'],
    note: 'Definition and two cancellations are in Bṛhat Jātaka 13.3. The code adds a kendra-from-Moon exemption (reported there as not authoritative) and a Jupiter-aspect cancellation (not there)',
  },
  {
    featureId: 'DOH-SAD',
    featureName: 'Sade Sati',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Needs real sunrise for boundary dates — S1 fault affects this',
  },
  { featureId: 'DOH-DHA', featureName: 'Dhaiya', tag: 'UNVERIFIED', sourceIds: [] },

  // -------------------------------------------------------------------------
  // Yoga engine
  // -------------------------------------------------------------------------
  {
    featureId: 'YGA-PMP',
    featureName: 'Pancha Mahapurusha',
    tag: 'ANCIENT_CLASSICAL',
    sourceIds: ['BS-68.1-2'],
    note: 'The conditions (own or exalted sign, in an angle) are Bṛhat Saṃhitā 68. The result sentences shown to users are not from that text, which describes the body of each man; one translator reads the conditions as alternatives',
  },
  { featureId: 'YGA-RAJ', featureName: 'Raja Yoga', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'YGA-DKA',
    featureName: 'Dharma-Karmadhipati Yoga',
    tag: 'UNVERIFIED',
    sourceIds: [],
  },
  { featureId: 'YGA-VIP', featureName: 'Viparita Raja Yoga', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'YGA-NEE', featureName: 'Neechabhanga', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'YGA-DHA', featureName: 'Dhana Yogas', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'YGA-LAK', featureName: 'Lakshmi Yoga', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'YGA-GJK',
    featureName: 'Gajakesari Yoga',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Shakata requires Jupiter 7th from Moon — Y1 fault (false positive)',
  },
  {
    featureId: 'YGA-SHA',
    featureName: 'Sunapha/Anapha/Durudhara/Adhi',
    tag: 'UNVERIFIED',
    sourceIds: [],
  },
  { featureId: 'YGA-BUD', featureName: 'Budhaditya Yoga', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'YGA-ASR',
    featureName: 'Rajju, Musala, Nala (Asraya yogas)',
    tag: 'ANCIENT_CLASSICAL',
    sourceIds: ['BJ-12.2'],
  },
  {
    featureId: 'YGA-KED',
    featureName: 'Kedara Yoga',
    tag: 'ANCIENT_CLASSICAL',
    sourceIds: ['BJ-12.10'],
  },
  {
    featureId: 'YGA-SUN',
    featureName: 'Sunapha, Anapha, Durudhura',
    tag: 'ANCIENT_CLASSICAL',
    sourceIds: ['BJ-13.3'],
  },
  {
    featureId: 'YGA-ADH',
    featureName: 'Adhi Yoga (from the Moon)',
    tag: 'ANCIENT_CLASSICAL',
    sourceIds: ['BJ-13.2'],
  },
  {
    featureId: 'YGA-VAS',
    featureName: 'Vasumati Yoga',
    tag: 'ANCIENT_CLASSICAL',
    sourceIds: ['BJ-13.9'],
  },

  // -------------------------------------------------------------------------
  // Shared rule tables
  // -------------------------------------------------------------------------
  {
    featureId: 'DIG-EXA',
    featureName: 'Exaltation and debilitation, seven planets',
    tag: 'ANCIENT_CLASSICAL',
    sourceIds: ['BJ-1.13'],
    note: 'Node entries in the shared table are not in this text',
  },
  {
    featureId: 'GOC-AUS',
    featureName: 'Transit: houses from the birth Moon that are benefic, seven planets',
    tag: 'ANCIENT_CLASSICAL',
    sourceIds: ['BS-103.4'],
    note: 'Rahu and Ketu rows (3, 6, 11) are not in the text. Mars in the 10th is favourable in the per-house verse but outside the summary the engine follows',
  },
  {
    featureId: 'GOC-VED',
    featureName: 'Transit: vedha (obstruction) pairs and their exemptions',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Not in Bṛhat Saṃhitā chapter 103 or the Bṛhat Jātaka. A later work is needed before this can be called classical',
  },
  {
    featureId: 'DIG-NAT',
    featureName: 'Benefic and malefic planets (waning Moon, Mercury by company)',
    tag: 'ANCIENT_CLASSICAL',
    sourceIds: ['BJ-2.5'],
    note: 'Node natures are not in this text. Aroha scoring heuristics (relocation, astrocartography, yantra, daily transit nudge, retrograde commentary, Lal Kitab debts) still use a fixed list and are Aroha conventions',
  },
  {
    featureId: 'DIG-FRD',
    featureName: 'Natural friends and enemies, seven planets',
    tag: 'ANCIENT_CLASSICAL',
    sourceIds: ['BJ-2.16-17'],
    note: 'Node friendships are not in this text',
  },
  {
    featureId: 'ASP-FUL',
    featureName: 'Full aspects (7th; Saturn 3/10, Jupiter 5/9, Mars 4/8)',
    tag: 'ANCIENT_CLASSICAL',
    sourceIds: ['BJ-2.13'],
  },

  // -------------------------------------------------------------------------
  // Matchmaking
  // -------------------------------------------------------------------------
  {
    featureId: 'MT-ASH',
    featureName: 'Ashtakoota (8 factors, 36 points)',
    tag: 'UNVERIFIED',
    sourceIds: [],
  },
  { featureId: 'MT-DSH', featureName: 'Dashakoota (10 factors)', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'MT-RIS',
    featureName: 'Match risk scoring',
    tag: 'AROHA_PROPRIETARY',
    sourceIds: [],
    note: '36-point bands and match-risks.ts are Aroha scoring — M1, MT5',
  },

  // -------------------------------------------------------------------------
  // Panchanga
  // -------------------------------------------------------------------------
  { featureId: 'PAN-TTH', featureName: 'Tithi', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'PAN-VAR', featureName: 'Vara', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'PAN-NAK', featureName: 'Nakshatra', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'PAN-YOG',
    featureName: 'Yoga (Panchanga)',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Needs explicit floor/index — PN1 fault',
  },
  { featureId: 'PAN-KAR', featureName: 'Karana', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'PAN-RIS', featureName: 'Sunrise/sunset/noon', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'PAN-RHK',
    featureName: 'Rahu Kala',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Uses real sunrise (correct); DOC entry',
  },
  { featureId: 'PAN-GUL', featureName: 'Gulika', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'PAN-YAM', featureName: 'Yamaganda', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'PAN-ABH', featureName: 'Abhijit', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'PAN-CHO',
    featureName: 'Choghadiya',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Uses real day length (correct); DOC entry',
  },
  { featureId: 'PAN-HOR', featureName: 'Hora', tag: 'UNVERIFIED', sourceIds: [] },

  // -------------------------------------------------------------------------
  // Muhurta
  // -------------------------------------------------------------------------
  {
    featureId: 'MUH-FLT',
    featureName: 'Muhurta filters (all)',
    tag: 'UNVERIFIED',
    sourceIds: ['BS-97-99'],
    note: 'Only the marriage star list and the Rikta tithis are in Bṛhat Saṃhitā 97-99. The other categories, weekdays and tithi lists are from a work not yet opened. Karana (Vishti) and yoga (Vyatipata, Vaidhriti) are not modelled',
  },
  {
    featureId: 'MUH-SRG',
    featureName: 'Surgery muhurta category',
    tag: 'AROHA_PROPRIETARY',
    sourceIds: [],
    note: 'Health safety flag — SF1',
  },

  // -------------------------------------------------------------------------
  // KP
  // -------------------------------------------------------------------------
  {
    featureId: 'KP-CLS',
    featureName: 'KP classification',
    tag: 'MODERN_ASTROLOGICAL',
    sourceIds: [],
    note: 'Krishnamurti Paddhati — 20th century; not ancient Vedic',
  },
  {
    featureId: 'KP-SUB',
    featureName: 'KP 243 sub-divisions',
    tag: 'MODERN_ASTROLOGICAL',
    sourceIds: [],
  },
  {
    featureId: 'KP-249',
    featureName: 'KP 1-249 horary numbering',
    tag: 'MODERN_ASTROLOGICAL',
    sourceIds: [],
    note: 'No 1-249 table exists in code; 2193 incorrect — K1, K2 faults',
  },

  // -------------------------------------------------------------------------
  // Varshaphal / Tajika
  // -------------------------------------------------------------------------
  {
    featureId: 'TAJ-SR',
    featureName: 'Solar return',
    tag: 'LATER_CLASSICAL',
    sourceIds: [],
    note: 'Tajika is a later tradition',
  },
  { featureId: 'TAJ-MUN', featureName: 'Muntha', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'TAJ-VRE', featureName: 'Varsheshwara', tag: 'UNVERIFIED', sourceIds: [] },
  { featureId: 'TAJ-PVB', featureName: 'Panchavargiya Bala', tag: 'UNVERIFIED', sourceIds: [] },
  {
    featureId: 'TAJ-SAH',
    featureName: 'Sahams',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Five sahams with separate formulas vs 8 in doc — X3 fault',
  },

  // -------------------------------------------------------------------------
  // Lal Kitab
  // -------------------------------------------------------------------------
  {
    featureId: 'LKB-CLS',
    featureName: 'Lal Kitab classification',
    tag: 'LATER_CLASSICAL',
    sourceIds: [],
  },
  {
    featureId: 'LKB-PKG',
    featureName: 'Pakka Ghar',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Must not be mixed with ordinary planetary lordship — L1 fault',
  },
  { featureId: 'LKB-DEB', featureName: 'Lal Kitab debts', tag: 'UNVERIFIED', sourceIds: [] },

  // -------------------------------------------------------------------------
  // Numerology
  // -------------------------------------------------------------------------
  {
    featureId: 'NUM-VED',
    featureName: 'Vedic numerology (Mulank/Bhagyank)',
    tag: 'UNVERIFIED',
    sourceIds: [],
  },
  {
    featureId: 'NUM-CHL',
    featureName: 'Chaldean numerology',
    tag: 'MODERN_ASTROLOGICAL',
    sourceIds: [],
  },
  {
    featureId: 'NUM-PYT',
    featureName: 'Pythagorean numerology',
    tag: 'MODERN_ASTROLOGICAL',
    sourceIds: [],
  },
  {
    featureId: 'NUM-LKY',
    featureName: 'Lucky number (daily)',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Formula uses (nakshatra+3)%9 — depends on YGN start — P2 fault',
  },

  // -------------------------------------------------------------------------
  // Astrocartography
  // -------------------------------------------------------------------------
  {
    featureId: 'ACG-MAP',
    featureName: 'Astrocartography (ACG/MC/IC lines)',
    tag: 'MODERN_ASTROLOGICAL',
    sourceIds: [],
  },

  // -------------------------------------------------------------------------
  // Vastu
  // -------------------------------------------------------------------------
  {
    featureId: 'VST-ANC',
    featureName: 'Vastu room-direction rules',
    tag: 'UNVERIFIED',
    sourceIds: ['BS-52.116-117', 'BJ-2.5b'],
    note: 'Five rules have support in Bṛhat Saṃhitā 52 (puja NE, kitchen SE, store SW/NW, water N/NE good, SE/S/SW bad). Water in E and NW is rated acceptable against the text. The other rules, the score and the weights are not from it',
  },
  {
    featureId: 'VST-SCR',
    featureName: 'Vastu Harmony Score 0-100',
    tag: 'AROHA_PROPRIETARY',
    sourceIds: [],
  },

  // -------------------------------------------------------------------------
  // Palmistry
  // -------------------------------------------------------------------------
  {
    featureId: 'PLM-ANC',
    featureName: 'Ancient Indian bodily-mark material',
    tag: 'UNVERIFIED',
    sourceIds: [],
  },
  {
    featureId: 'PLM-CV',
    featureName: 'Computer vision / palm detection',
    tag: 'AROHA_PROPRIETARY',
    sourceIds: [],
  },
  {
    featureId: 'PLM-REC',
    featureName: 'Kundli-Palm reconciliation',
    tag: 'AROHA_PROPRIETARY',
    sourceIds: [],
  },

  // -------------------------------------------------------------------------
  // Gemstones
  // -------------------------------------------------------------------------
  {
    featureId: 'GEM-ANC',
    featureName: 'Ancient gem/planet principles',
    tag: 'UNVERIFIED',
    sourceIds: [],
  },
  {
    featureId: 'GEM-PRX',
    featureName: 'Gemstone prescription',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Depends on Shadbala strength — G1 fault',
  },

  // -------------------------------------------------------------------------
  // Yantras
  // -------------------------------------------------------------------------
  {
    featureId: 'YNT-TBL',
    featureName: 'Yantra magic-square tables',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'One table called "classical" without source — E1 fault',
  },

  // -------------------------------------------------------------------------
  // Pancha Pakshi
  // -------------------------------------------------------------------------
  {
    featureId: 'PPK-BRD',
    featureName: 'Pancha Pakshi five birds',
    tag: 'UNVERIFIED',
    sourceIds: [],
  },
  {
    featureId: 'PPK-YAM',
    featureName: 'Pancha Pakshi yamas / time divisions',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'Uses real sunrise (correct); DOC entry',
  },

  // -------------------------------------------------------------------------
  // Reports
  // -------------------------------------------------------------------------
  {
    featureId: 'RPT-HLT',
    featureName: 'Health report / health risk / surgery filter',
    tag: 'AROHA_PROPRIETARY',
    sourceIds: [],
    note: 'Safety flag SF1 — health claims need provenance block',
  },
  {
    featureId: 'RPT-PRG',
    featureName: 'Progeny / fertility report',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'SF2 — sex tendency and child count unverified',
  },
  {
    featureId: 'RPT-PL',
    featureName: 'Past-life report',
    tag: 'UNVERIFIED',
    sourceIds: [],
    note: 'SF3 — Rahu/Ketu themes and D60 presented as fact',
  },
  {
    featureId: 'RPT-RPT',
    featureName: 'All 16 commercial reports (provenance block)',
    tag: 'AROHA_PROPRIETARY',
    sourceIds: [],
    note: 'Must return calculation_basis, source_profile, traditional_rules, aroha_proprietary_rules, safety_classification — RP1',
  },

  // -------------------------------------------------------------------------
  // Architecture
  // -------------------------------------------------------------------------
  {
    featureId: 'ARCH-MET',
    featureName: 'Metrologist Agent (deterministic service)',
    tag: 'AROHA_PROPRIETARY',
    sourceIds: [],
    note: 'Already deterministic; rename is a wording fix — ARCH fault',
  },
  {
    featureId: 'ARCH-DEC',
    featureName: 'Decision engine',
    tag: 'AROHA_PROPRIETARY',
    sourceIds: [],
  },
  { featureId: 'ARCH-BON', featureName: 'Aroha Bonds', tag: 'AROHA_PROPRIETARY', sourceIds: [] },
];

// ---------------------------------------------------------------------------
// Lookup API
// ---------------------------------------------------------------------------

const _map = new Map<string, ProvenanceEntry>(REGISTRY.map((e) => [e.featureId, e]));

/**
 * Look up the provenance entry for a feature.
 * Returns a synthetic UNVERIFIED entry if the id is not in the registry.
 */
export function getProvenance(featureId: string): ProvenanceEntry {
  return (
    _map.get(featureId) ?? {
      featureId,
      featureName: featureId,
      tag: 'UNVERIFIED',
      sourceIds: [],
      note: 'Feature id not yet registered in provenance registry',
    }
  );
}

/**
 * Human-readable label for use in API responses and prompts.
 *
 * Example: "ANCIENT_CLASSICAL — BPHS-SHB-001, BPHS-SHB-002"
 */
export function provenanceLabel(featureId: string): string {
  const e = getProvenance(featureId);
  const src = e.sourceIds.length > 0 ? ` — ${e.sourceIds.join(', ')}` : '';
  return `${e.tag}${src}`;
}

/** All entries in registration order. */
export function allProvenanceEntries(): ProvenanceEntry[] {
  return REGISTRY;
}
