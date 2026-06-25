/**
 * Derive structured life-context fields from a raw Apollo /people/match payload.
 *
 * Output never includes company names, school names, project names, or city —
 * by construction. Downstream code (AI prompts, UI) consumes only this shape,
 * so PII abstraction is enforced here once instead of being a rule every
 * caller has to remember.
 */

export type Seniority =
  | 'intern'
  | 'entry'
  | 'mid'
  | 'senior'
  | 'manager'
  | 'director'
  | 'vp'
  | 'c_suite'
  | 'unknown';

export type Sector =
  | 'software'
  | 'finance'
  | 'consulting'
  | 'healthcare'
  | 'education'
  | 'manufacturing'
  | 'retail'
  | 'media'
  | 'government'
  | 'legal'
  | 'real_estate'
  | 'energy'
  | 'hospitality'
  | 'agriculture'
  | 'nonprofit'
  | 'other';

export type EducationField =
  | 'engineering'
  | 'medicine'
  | 'commerce'
  | 'law'
  | 'liberal_arts'
  | 'science'
  | 'design'
  | 'other';

export type CareerMilestone =
  | { age: number; type: 'role_change'; sector: Sector; seniority: Seniority }
  | { age: number; type: 'education_start'; field: EducationField };

export type DerivedApollo = {
  sector: Sector | null;
  seniority: Seniority | null;
  yearsExperience: number | null;
  state: string | null;
  country: string | null;
  careerMilestones: CareerMilestone[];
  // Raw-but-sanitized company name passed only to the salary estimator —
  // NEVER persisted to a derived column. The caller hands it to salary.ts
  // and then drops it on the floor.
  companyNameForSalaryLookup: string | null;
};

const INDUSTRY_TO_SECTOR: Record<string, Sector> = {
  // Software / tech
  'computer software': 'software',
  'information technology': 'software',
  'information technology and services': 'software',
  'internet': 'software',
  'computer & network security': 'software',
  'computer hardware': 'software',
  'semiconductors': 'software',
  // Finance
  'banking': 'finance',
  'financial services': 'finance',
  'investment banking': 'finance',
  'investment management': 'finance',
  'venture capital & private equity': 'finance',
  'insurance': 'finance',
  // Consulting
  'management consulting': 'consulting',
  'business consulting and services': 'consulting',
  'professional services': 'consulting',
  // Healthcare
  'hospital & health care': 'healthcare',
  'medical practice': 'healthcare',
  'pharmaceuticals': 'healthcare',
  'biotechnology': 'healthcare',
  // Education
  'higher education': 'education',
  'education management': 'education',
  'e-learning': 'education',
  // Manufacturing
  'mechanical or industrial engineering': 'manufacturing',
  'industrial automation': 'manufacturing',
  'automotive': 'manufacturing',
  'electrical & electronic manufacturing': 'manufacturing',
  // Retail / consumer
  'retail': 'retail',
  'consumer goods': 'retail',
  'apparel & fashion': 'retail',
  'food & beverages': 'retail',
  // Media
  'media production': 'media',
  'broadcast media': 'media',
  'publishing': 'media',
  'entertainment': 'media',
  // Government / legal
  'government administration': 'government',
  'public policy': 'government',
  'law practice': 'legal',
  'legal services': 'legal',
  // Real estate / construction
  'real estate': 'real_estate',
  'construction': 'real_estate',
  // Energy
  'oil & energy': 'energy',
  'renewables & environment': 'energy',
  // Hospitality
  'hospitality': 'hospitality',
  'restaurants': 'hospitality',
  'travel & tourism': 'hospitality',
  // Agri
  'farming': 'agriculture',
  'agriculture': 'agriculture',
  // Nonprofit
  'nonprofit organization management': 'nonprofit',
  'civic & social organization': 'nonprofit',
};

const SENIORITY_NORMALIZE: Record<string, Seniority> = {
  intern: 'intern',
  owner: 'c_suite',
  founder: 'c_suite',
  c_suite: 'c_suite',
  partner: 'c_suite',
  vp: 'vp',
  head: 'vp',
  director: 'director',
  manager: 'manager',
  senior: 'senior',
  entry: 'entry',
};

function mapIndustry(industry: unknown): Sector | null {
  if (typeof industry !== 'string') return null;
  const lower = industry.toLowerCase().trim();
  if (lower in INDUSTRY_TO_SECTOR) return INDUSTRY_TO_SECTOR[lower];
  // Fuzzy keyword fallback for Apollo's long-tail industry strings.
  if (/(software|saas|tech)/.test(lower)) return 'software';
  if (/(bank|financ|invest|fintech)/.test(lower)) return 'finance';
  if (/consult/.test(lower)) return 'consulting';
  if (/(health|medic|pharma|hospital)/.test(lower)) return 'healthcare';
  if (/(school|college|university|education|edtech)/.test(lower)) return 'education';
  if (/(manufactur|industr|automotive)/.test(lower)) return 'manufacturing';
  if (/(retail|consumer|ecommerce)/.test(lower)) return 'retail';
  if (/(media|publish|news|entertain)/.test(lower)) return 'media';
  if (/(gov|public)/.test(lower)) return 'government';
  if (/(law|legal)/.test(lower)) return 'legal';
  if (/(real ?estate|construct|property)/.test(lower)) return 'real_estate';
  if (/(energy|oil|gas|solar|wind)/.test(lower)) return 'energy';
  if (/(hotel|restaurant|tourism|hospitality)/.test(lower)) return 'hospitality';
  if (/(agri|farm)/.test(lower)) return 'agriculture';
  if (/(nonprofit|ngo)/.test(lower)) return 'nonprofit';
  return 'other';
}

function mapSeniority(raw: unknown): Seniority | null {
  if (typeof raw !== 'string') return null;
  const lower = raw.toLowerCase().trim().replace(/[\s-]/g, '_');
  return SENIORITY_NORMALIZE[lower] ?? null;
}

function mapEducationField(degree: unknown, field: unknown): EducationField {
  const text = [degree, field]
    .filter((v): v is string => typeof v === 'string')
    .join(' ')
    .toLowerCase();
  if (/(engineer|b\.?tech|m\.?tech|btech|mtech|computer science)/.test(text)) return 'engineering';
  if (/(mbbs|md|medicine|dental|nursing)/.test(text)) return 'medicine';
  if (/(commerce|mba|finance|accounting|b\.?com|m\.?com)/.test(text)) return 'commerce';
  if (/(law|llb|llm|jurisprudence)/.test(text)) return 'law';
  if (/(arts|literature|history|philosophy|sociology|psychology)/.test(text)) return 'liberal_arts';
  if (/(science|physics|chemistry|biology|b\.?sc|m\.?sc)/.test(text)) return 'science';
  if (/(design|architecture)/.test(text)) return 'design';
  return 'other';
}

function parseYear(value: unknown): number | null {
  if (typeof value === 'number' && value > 1900 && value < 2100) return Math.floor(value);
  if (typeof value !== 'string') return null;
  const match = value.match(/(\d{4})/);
  if (!match) return null;
  const year = Number(match[1]);
  return year > 1900 && year < 2100 ? year : null;
}

type ApolloLike = Record<string, unknown> & {
  organization?: Record<string, unknown>;
  employment_history?: Array<Record<string, unknown>>;
  education?: Array<Record<string, unknown>>;
};

export function deriveFromApollo(
  rawPerson: unknown,
  userBirthYear: number | null,
): DerivedApollo {
  const empty: DerivedApollo = {
    sector: null,
    seniority: null,
    yearsExperience: null,
    state: null,
    country: null,
    careerMilestones: [],
    companyNameForSalaryLookup: null,
  };

  if (!rawPerson || typeof rawPerson !== 'object') return empty;
  const person = rawPerson as ApolloLike;

  const sector = mapIndustry(person.organization?.['industry']);
  const seniority = mapSeniority(person['seniority']);

  // State / country — explicitly NOT city.
  const state = pickString(person['state']);
  const country = pickString(person['country']);

  // Years experience: prefer Apollo's total_years_experience if it exists,
  // otherwise sum employment_history durations.
  let yearsExperience: number | null = null;
  const totalYears = person['total_years_experience'];
  if (typeof totalYears === 'number' && totalYears >= 0) {
    yearsExperience = Math.round(totalYears);
  } else if (Array.isArray(person.employment_history)) {
    let totalMonths = 0;
    for (const job of person.employment_history) {
      const startYear = parseYear(job['start_date']);
      const endYear = parseYear(job['end_date']) ?? new Date().getFullYear();
      if (startYear) totalMonths += Math.max(0, (endYear - startYear) * 12);
    }
    if (totalMonths > 0) yearsExperience = Math.round(totalMonths / 12);
  }

  // Career milestones — only emitted when we can compute a real age.
  const milestones: CareerMilestone[] = [];
  if (userBirthYear && Array.isArray(person.employment_history)) {
    const jobs = [...person.employment_history].sort((a, b) => {
      const ay = parseYear(a['start_date']) ?? 9999;
      const by = parseYear(b['start_date']) ?? 9999;
      return ay - by;
    });
    let lastSector: Sector | null = null;
    for (const job of jobs) {
      const year = parseYear(job['start_date']);
      if (!year) continue;
      const age = year - userBirthYear;
      if (age < 14 || age > 80) continue;
      const jobSector = mapIndustry(job['organization_industry'] ?? job['industry']) ?? sector ?? 'other';
      const jobSeniority = mapSeniority(job['seniority']) ?? 'unknown';
      if (jobSector !== lastSector) {
        milestones.push({ age, type: 'role_change', sector: jobSector, seniority: jobSeniority });
        lastSector = jobSector;
      }
    }
  }

  if (userBirthYear && Array.isArray(person.education)) {
    for (const edu of person.education) {
      const year = parseYear(edu['start_date']) ?? parseYear(edu['starts_at']);
      if (!year) continue;
      const age = year - userBirthYear;
      if (age < 14 || age > 80) continue;
      milestones.push({
        age,
        type: 'education_start',
        field: mapEducationField(edu['degree'], edu['field_of_study']),
      });
    }
  }

  milestones.sort((a, b) => a.age - b.age);

  // Company name extracted only so the caller can pass it to the salary
  // estimator. It is NEVER written to a derived column.
  const companyNameForSalaryLookup = pickString(person.organization?.['name']);

  return {
    sector,
    seniority,
    yearsExperience,
    state,
    country,
    careerMilestones: milestones,
    companyNameForSalaryLookup,
  };
}

function pickString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
