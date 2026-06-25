'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MotionPage, FadeIn, StaggerList, StaggerItem, ScrollReveal } from '@/components/ui/motion-primitives';
import { staggerContainer, staggerItem } from '@/lib/motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { useStore } from '@/store/useStore';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface PlanetPosition {
  planet: string;
  sign: string;
  signDegree: number;
  nakshatra: string;
  nakshatraPada: number;
  isRetrograde: boolean;
  house: number;
  longitude: number;
}

interface HouseInfo {
  house: number;
  sign: string;
  lord: string;
  planets: string[];
}

interface MonthlyHighlight {
  month: string;
  highlight: string;
}

interface VarshaphalResult {
  nativeName: string;
  year: number;
  age: number;
  solarReturnDate: string;
  yearLord: string;
  munthaSign: string;
  munthaLord: string;
  solarReturnAscendant: {
    sign: string;
    signIndex: number;
    degree: number;
    nakshatra: string;
    nakshatraPada: number;
  };
  solarReturnPlanets: PlanetPosition[];
  solarReturnHouses: HouseInfo[];
  aiInterpretation: {
    yearOverview?: string;
    yearLordAnalysis?: string;
    munthaAnalysis?: string;
    career?: string;
    relationships?: string;
    health?: string;
    finances?: string;
    monthlyHighlights?: MonthlyHighlight[];
    keyTransits?: string[];
    remedies?: string[];
  };
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                 */
/* -------------------------------------------------------------------------- */

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 11 }, (_, i) => {
  const y = currentYear - 5 + i;
  return { value: String(y), label: String(y) };
});

export default function VarshaphalPage() {
  const { charts, profiles } = useStore();
  const [chartId, setChartId] = useState('');
  const [year, setYear] = useState(String(currentYear));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<VarshaphalResult | null>(null);

  const chartOptions = useMemo(() => {
    return charts.map((c) => {
      const profile = profiles.find((p) => p.id === c.profile_id);
      return {
        value: c.id,
        label: profile ? `${profile.name} (${profile.dob})` : `Chart ${c.id.slice(0, 8)}`,
      };
    });
  }, [charts, profiles]);

  const canSubmit = chartId && year;

  async function handleCalculate() {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/varshaphal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartId, year: parseInt(year, 10) }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to calculate Varshaphal');
      }

      const data = await res.json();
      setResult(data.data as VarshaphalResult);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function formatDate(isoString: string): string {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  }

  return (
    <MotionPage className="mx-auto max-w-5xl px-4 py-6 min-h-screen">
      {/* Header */}
      <div className="mb-5">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Vedic Astrology</p>
        <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">Varshaphal</h1>
        <p className="mt-0.5 text-sm text-text-secondary">
          Solar Return chart — annual horoscope from birthday to birthday
        </p>
      </div>

      {/* Input Card */}
      <FadeIn>
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="font-[family-name:var(--font-serif)]">Select Chart & Year</CardTitle>
            <CardDescription>Choose a chart and the year for the solar return calculation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {chartOptions.length === 0 ? (
              <p className="text-xs text-text-secondary">
                No charts available. Generate a Kundli chart first from the Kundli section.
              </p>
            ) : (
              <div className="grid gap-2.5 md:grid-cols-2">
                <Select
                  id="chart-select"
                  label="Birth Chart"
                  placeholder="Select a chart..."
                  options={chartOptions}
                  value={chartId}
                  onChange={(e) => setChartId(e.target.value)}
                />
                <Select
                  id="year-select"
                  label="Year"
                  options={yearOptions}
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </FadeIn>

      {/* Submit */}
      <div className="mb-5 flex justify-center">
        <Button size="xl" onClick={handleCalculate} isLoading={loading} disabled={!canSubmit || loading}>
          Calculate Varshaphal
        </Button>
      </div>

      {error && (
        <FadeIn>
          <Card className="mb-4 border-error/50">
            <CardContent className="py-3 text-center text-error text-sm">{error}</CardContent>
          </Card>
        </FadeIn>
      )}

      {loading && (
        <div className="py-10">
          <Loading size="lg" section="horoscope" />
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Solar Return Overview */}
          <FadeIn>
            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-serif)]">Solar Return for {result.nativeName}</CardTitle>
                <CardDescription>
                  Year {result.year} (Age {result.age})
                </CardDescription>
              </CardHeader>
              <CardContent>
                <StaggerList className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  <StaggerItem className="rounded-lg border border-border/50 p-2.5 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary/70 mb-0.5">
                      Solar Return Date
                    </div>
                    <div className="text-xs font-medium text-text">
                      {formatDate(result.solarReturnDate)}
                    </div>
                  </StaggerItem>
                  <StaggerItem className="rounded-lg border border-border/50 p-2.5 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary/70 mb-0.5">
                      Year Lord (Varshesh)
                    </div>
                    <Badge variant="default" className="text-xs">{result.yearLord}</Badge>
                  </StaggerItem>
                  <StaggerItem className="rounded-lg border border-border/50 p-2.5 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary/70 mb-0.5">
                      Muntha
                    </div>
                    <Badge variant="accent" className="text-xs">{result.munthaSign}</Badge>
                  </StaggerItem>
                  <StaggerItem className="rounded-lg border border-border/50 p-2.5 text-center">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary/70 mb-0.5">
                      Muntha Lord
                    </div>
                    <Badge variant="accent" className="text-xs">{result.munthaLord}</Badge>
                  </StaggerItem>
                </StaggerList>
                <div className="mt-3 rounded-lg border border-border/50 p-2.5 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary/70 mb-0.5">
                    Solar Return Ascendant
                  </div>
                  <div className="text-xs font-medium text-text">
                    {result.solarReturnAscendant.sign} {result.solarReturnAscendant.degree.toFixed(1)}° — {result.solarReturnAscendant.nakshatra} Pada {result.solarReturnAscendant.nakshatraPada}
                  </div>
                </div>
              </CardContent>
            </Card>
          </FadeIn>

          {/* Planet Positions Table */}
          <ScrollReveal>
            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-serif)]">Solar Return Planet Positions</CardTitle>
                <CardDescription>Planetary positions at the moment of the Sun's return</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-2.5 py-1.5 text-left font-medium text-text-secondary">Planet</th>
                        <th className="px-2.5 py-1.5 text-left font-medium text-text-secondary">Sign</th>
                        <th className="px-2.5 py-1.5 text-left font-medium text-text-secondary">Degree</th>
                        <th className="px-2.5 py-1.5 text-left font-medium text-text-secondary">Nakshatra</th>
                        <th className="px-2.5 py-1.5 text-left font-medium text-text-secondary">House</th>
                        <th className="px-2.5 py-1.5 text-left font-medium text-text-secondary">Status</th>
                      </tr>
                    </thead>
                    <motion.tbody variants={staggerContainer} initial="initial" animate="animate">
                      {result.solarReturnPlanets.map((p) => (
                        <motion.tr key={p.planet} variants={staggerItem} className="border-b border-border/50">
                          <td className="px-2.5 py-1.5 font-medium text-text">{p.planet}</td>
                          <td className="px-2.5 py-1.5 text-text-secondary">{p.sign}</td>
                          <td className="px-2.5 py-1.5 text-text-secondary">{p.signDegree.toFixed(2)}°</td>
                          <td className="px-2.5 py-1.5 text-text-secondary">
                            {p.nakshatra} <span className="text-[10px] text-text-secondary/60">P{p.nakshatraPada}</span>
                          </td>
                          <td className="px-2.5 py-1.5 text-text-secondary">{p.house || '—'}</td>
                          <td className="px-2.5 py-1.5">
                            {p.isRetrograde ? (
                              <Badge variant="warning">Retrograde</Badge>
                            ) : (
                              <Badge variant="outline">Direct</Badge>
                            )}
                          </td>
                        </motion.tr>
                      ))}
                    </motion.tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </ScrollReveal>

          {/* Year Overview */}
          {result.aiInterpretation.yearOverview && (
            <ScrollReveal>
              <Card>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-serif)]">Year Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-line text-xs leading-relaxed text-text-secondary">
                    {result.aiInterpretation.yearOverview}
                  </p>
                </CardContent>
              </Card>
            </ScrollReveal>
          )}

          {/* Year Lord & Muntha Analysis */}
          <div className="grid gap-4 md:grid-cols-2">
            {result.aiInterpretation.yearLordAnalysis && (
              <ScrollReveal>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-serif)]">
                      Year Lord Analysis
                      <Badge variant="default">{result.yearLord}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-line text-xs leading-relaxed text-text-secondary">
                      {result.aiInterpretation.yearLordAnalysis}
                    </p>
                  </CardContent>
                </Card>
              </ScrollReveal>
            )}
            {result.aiInterpretation.munthaAnalysis && (
              <ScrollReveal>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-serif)]">
                      Muntha Analysis
                      <Badge variant="accent">{result.munthaSign}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-line text-xs leading-relaxed text-text-secondary">
                      {result.aiInterpretation.munthaAnalysis}
                    </p>
                  </CardContent>
                </Card>
              </ScrollReveal>
            )}
          </div>

          {/* Life Area Interpretations */}
          <div className="grid gap-4 md:grid-cols-2">
            {result.aiInterpretation.career && (
              <ScrollReveal>
                <Card>
                  <CardHeader>
                    <CardTitle className="font-[family-name:var(--font-serif)]">Career & Profession</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-line text-xs leading-relaxed text-text-secondary">
                      {result.aiInterpretation.career}
                    </p>
                  </CardContent>
                </Card>
              </ScrollReveal>
            )}
            {result.aiInterpretation.relationships && (
              <ScrollReveal>
                <Card>
                  <CardHeader>
                    <CardTitle className="font-[family-name:var(--font-serif)]">Relationships</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-line text-xs leading-relaxed text-text-secondary">
                      {result.aiInterpretation.relationships}
                    </p>
                  </CardContent>
                </Card>
              </ScrollReveal>
            )}
            {result.aiInterpretation.health && (
              <ScrollReveal>
                <Card>
                  <CardHeader>
                    <CardTitle className="font-[family-name:var(--font-serif)]">Health & Well-being</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-line text-xs leading-relaxed text-text-secondary">
                      {result.aiInterpretation.health}
                    </p>
                  </CardContent>
                </Card>
              </ScrollReveal>
            )}
            {result.aiInterpretation.finances && (
              <ScrollReveal>
                <Card>
                  <CardHeader>
                    <CardTitle className="font-[family-name:var(--font-serif)]">Finances & Wealth</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-line text-xs leading-relaxed text-text-secondary">
                      {result.aiInterpretation.finances}
                    </p>
                  </CardContent>
                </Card>
              </ScrollReveal>
            )}
          </div>

          {/* Monthly Highlights */}
          {result.aiInterpretation.monthlyHighlights && result.aiInterpretation.monthlyHighlights.length > 0 && (
            <ScrollReveal>
              <Card>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-serif)]">Monthly Highlights</CardTitle>
                  <CardDescription>Key themes and events for each month of the year</CardDescription>
                </CardHeader>
                <CardContent>
                  <StaggerList className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {result.aiInterpretation.monthlyHighlights.map((m, i) => (
                      <StaggerItem key={i} className="rounded-lg border border-border/50 p-2.5">
                        <div className="mb-0.5 text-xs font-semibold text-text">{m.month}</div>
                        <p className="text-[10px] text-text-secondary">{m.highlight}</p>
                      </StaggerItem>
                    ))}
                  </StaggerList>
                </CardContent>
              </Card>
            </ScrollReveal>
          )}

          {/* Key Transits */}
          {result.aiInterpretation.keyTransits && result.aiInterpretation.keyTransits.length > 0 && (
            <ScrollReveal>
              <Card>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-serif)]">Key Transits</CardTitle>
                  <CardDescription>Important planetary movements during the year</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5">
                    {result.aiInterpretation.keyTransits.map((t, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-text-secondary">
                        <span className="mt-0.5 text-primary">&#9679;</span>
                        {t}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </ScrollReveal>
          )}

          {/* Remedies */}
          {result.aiInterpretation.remedies && result.aiInterpretation.remedies.length > 0 && (
            <ScrollReveal>
              <Card className="border-warning/30">
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-serif)]">Recommended Remedies</CardTitle>
                  <CardDescription>Remedies to strengthen positive influences this year</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5">
                    {result.aiInterpretation.remedies.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-text-secondary">
                        <span className="mt-0.5 text-warning">&#9679;</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </ScrollReveal>
          )}
        </div>
      )}
    </MotionPage>
  );
}
