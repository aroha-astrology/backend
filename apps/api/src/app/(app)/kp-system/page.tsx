'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MotionPage, FadeIn, StaggerList, StaggerItem, ScrollReveal } from '@/components/ui/motion-primitives';
import { staggerContainer, staggerItem } from '@/lib/motion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { useStore } from '@/store/useStore';
import { useActiveChart } from '@/hooks/useActiveChart';

interface CuspEntry {
  house: number;
  degree: string;
  longitude: number;
  sign: string;
  signLord: string;
  nakshatra: string;
  starLord: string;
  subLord: string;
}

interface PlanetSignificator {
  planet: string;
  sign: string;
  longitude: number;
  nakshatra: string;
  starLord: string;
  subLord: string;
  housesOwned: number[];
  housesOccupied: number;
  starLordHouses: number[];
}

interface RulingPlanets {
  dayLord: string;
  moonSignLord: string;
  moonStarLord: string;
  ascendantSignLord: string;
  ascendantStarLord: string;
}

interface HouseAnalysis {
  house: number;
  area: string;
  subLordSignifies: string;
  prediction: string;
  favorable: boolean;
}

interface KPInterpretation {
  summary?: string;
  houseAnalysis?: HouseAnalysis[];
  lifeAreas?: Record<string, string>;
  rulingPlanetAnalysis?: string;
  significatorSummary?: string;
}

interface KPData {
  cusps: CuspEntry[];
  planetSignificators: PlanetSignificator[];
  rulingPlanets: RulingPlanets;
  interpretation: KPInterpretation;
}

export default function KPSystemPage() {
  const { activeChartId, setActiveChartId, charts } = useActiveChart();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<KPData | null>(null);
  const selectedChartId = activeChartId ?? '';
  const setSelectedChartId = (id: string) => setActiveChartId(id);

  const analyze = async () => {
    if (!selectedChartId) return;
    setLoading(true);
    setError('');
    setData(null);

    try {
      const res = await fetch('/api/kp-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartId: selectedChartId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Analysis failed');
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const LIFE_AREA_LABELS: Record<string, string> = {
    marriage: 'Marriage & Relationships',
    career: 'Career & Profession',
    wealth: 'Wealth & Finance',
    health: 'Health & Vitality',
    education: 'Education & Knowledge',
    children: 'Children & Progeny',
  };

  return (
    <MotionPage className="mx-auto max-w-5xl px-4 py-6 min-h-screen">
      <div className="mb-5">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Vedic Astrology</p>
        <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">KP System Analysis</h1>
        <p className="mt-0.5 text-sm text-text-secondary">
          Krishnamurti Paddhati — Sub-lord based predictions
        </p>
      </div>

      {/* Chart Selection */}
      <FadeIn>
        <Card className="mb-4">
          <CardContent className="pt-4">
            <label className="mb-1.5 block text-xs font-medium text-text">Select Chart</label>
            {charts.length === 0 ? (
              <p className="text-xs text-text-secondary">
                No charts found. Please generate a Kundli first.
              </p>
            ) : (
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
                <select
                  value={selectedChartId}
                  onChange={(e) => setSelectedChartId(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text focus:border-primary/50 focus:outline-none"
                >
                  {charts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id.slice(0, 8)} — {new Date(c.created_at).toLocaleDateString()}
                    </option>
                  ))}
                </select>
                <Button onClick={analyze} disabled={loading || !selectedChartId} isLoading={loading}>
                  Analyze KP System
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </FadeIn>

      {error && (
        <FadeIn>
          <Card className="mb-4 border-error/30 bg-error/5">
            <CardContent className="pt-4">
              <p className="text-xs text-error">{error}</p>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {loading && (
        <div className="py-12">
          <Loading size="lg" section="kundli" />
        </div>
      )}

      {data && (
        <div className="space-y-4">
          {/* Summary */}
          {data.interpretation.summary && (
            <FadeIn>
              <Card>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-serif)]">KP Analysis Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs leading-relaxed text-text-secondary">
                    {data.interpretation.summary}
                  </p>
                </CardContent>
              </Card>
            </FadeIn>
          )}

          {/* Cusp Table */}
          <ScrollReveal>
            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-serif)]">House Cusps — Sign, Star & Sub Lords</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] text-text-secondary">
                        <th className="px-2.5 py-1.5">House</th>
                        <th className="px-2.5 py-1.5">Degree</th>
                        <th className="px-2.5 py-1.5">Sign</th>
                        <th className="px-2.5 py-1.5">Sign Lord</th>
                        <th className="px-2.5 py-1.5">Nakshatra</th>
                        <th className="px-2.5 py-1.5">Star Lord</th>
                        <th className="px-2.5 py-1.5">Sub Lord</th>
                      </tr>
                    </thead>
                    <motion.tbody variants={staggerContainer} initial="initial" animate="animate">
                      {data.cusps.map((cusp) => (
                        <motion.tr key={cusp.house} variants={staggerItem} className="border-b border-border/50 hover:bg-surface-hover/50">
                          <td className="px-2.5 py-1.5 font-semibold text-primary">{cusp.house}</td>
                          <td className="px-2.5 py-1.5 text-text">{cusp.degree}</td>
                          <td className="px-2.5 py-1.5 text-text">{cusp.sign}</td>
                          <td className="px-2.5 py-1.5">
                            <Badge variant="outline">{cusp.signLord}</Badge>
                          </td>
                          <td className="px-2.5 py-1.5 text-text-secondary">{cusp.nakshatra}</td>
                          <td className="px-2.5 py-1.5">
                            <Badge variant="accent">{cusp.starLord}</Badge>
                          </td>
                          <td className="px-2.5 py-1.5">
                            <Badge>{cusp.subLord}</Badge>
                          </td>
                        </motion.tr>
                      ))}
                    </motion.tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </ScrollReveal>

          {/* Planet Significators */}
          <ScrollReveal>
            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-serif)]">Planet Significators</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] text-text-secondary">
                        <th className="px-2.5 py-1.5">Planet</th>
                        <th className="px-2.5 py-1.5">Sign</th>
                        <th className="px-2.5 py-1.5">Nakshatra</th>
                        <th className="px-2.5 py-1.5">Star Lord</th>
                        <th className="px-2.5 py-1.5">Sub Lord</th>
                        <th className="px-2.5 py-1.5">Occupied</th>
                        <th className="px-2.5 py-1.5">Owns</th>
                        <th className="px-2.5 py-1.5">Star Lord Houses</th>
                      </tr>
                    </thead>
                    <motion.tbody variants={staggerContainer} initial="initial" animate="animate">
                      {data.planetSignificators.map((p) => (
                        <motion.tr key={p.planet} variants={staggerItem} className="border-b border-border/50 hover:bg-surface-hover/50">
                          <td className="px-2.5 py-1.5 font-semibold text-primary">{p.planet}</td>
                          <td className="px-2.5 py-1.5 text-text">{p.sign}</td>
                          <td className="px-2.5 py-1.5 text-text-secondary">{p.nakshatra}</td>
                          <td className="px-2.5 py-1.5">
                            <Badge variant="accent">{p.starLord}</Badge>
                          </td>
                          <td className="px-2.5 py-1.5">
                            <Badge>{p.subLord}</Badge>
                          </td>
                          <td className="px-2.5 py-1.5 text-text">{p.housesOccupied}</td>
                          <td className="px-2.5 py-1.5 text-text">{p.housesOwned.join(', ') || '-'}</td>
                          <td className="px-2.5 py-1.5 text-text-secondary">
                            {p.starLordHouses.join(', ') || '-'}
                          </td>
                        </motion.tr>
                      ))}
                    </motion.tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </ScrollReveal>

          {/* Ruling Planets */}
          <ScrollReveal>
            <Card>
              <CardHeader>
                <CardTitle className="font-[family-name:var(--font-serif)]">Ruling Planets at Moment of Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <StaggerList className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
                  {[
                    { label: 'Day Lord', value: data.rulingPlanets.dayLord },
                    { label: 'Moon Sign Lord', value: data.rulingPlanets.moonSignLord },
                    { label: 'Moon Star Lord', value: data.rulingPlanets.moonStarLord },
                    { label: 'Asc Sign Lord', value: data.rulingPlanets.ascendantSignLord },
                    { label: 'Asc Star Lord', value: data.rulingPlanets.ascendantStarLord },
                  ].map((rp) => (
                    <StaggerItem key={rp.label} className="rounded-lg border border-border bg-surface/60 p-2.5 text-center">
                      <p className="text-[10px] text-text-secondary">{rp.label}</p>
                      <p className="mt-0.5 text-xs font-bold text-primary">{rp.value}</p>
                    </StaggerItem>
                  ))}
                </StaggerList>
                {data.interpretation.rulingPlanetAnalysis && (
                  <p className="mt-3 text-xs leading-relaxed text-text-secondary">
                    {data.interpretation.rulingPlanetAnalysis}
                  </p>
                )}
              </CardContent>
            </Card>
          </ScrollReveal>

          {/* House-wise Analysis */}
          {data.interpretation.houseAnalysis && data.interpretation.houseAnalysis.length > 0 && (
            <ScrollReveal>
              <Card>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-serif)]">House-wise KP Predictions</CardTitle>
                </CardHeader>
                <CardContent>
                  <StaggerList className="space-y-3">
                    {data.interpretation.houseAnalysis.map((ha) => (
                      <StaggerItem
                        key={ha.house}
                        className="rounded-lg border border-border/50 bg-surface/40 p-3"
                      >
                        <div className="mb-1.5 flex items-center gap-2">
                          <Badge variant={ha.favorable ? 'success' : 'warning'}>
                            House {ha.house}
                          </Badge>
                          <span className="text-xs font-medium text-text">{ha.area}</span>
                        </div>
                        <p className="mb-0.5 text-[10px] text-text-secondary">
                          Sub-lord signifies: {ha.subLordSignifies}
                        </p>
                        <p className="text-xs leading-relaxed text-text-secondary">{ha.prediction}</p>
                      </StaggerItem>
                    ))}
                  </StaggerList>
                </CardContent>
              </Card>
            </ScrollReveal>
          )}

          {/* Life Areas */}
          {data.interpretation.lifeAreas &&
            Object.keys(data.interpretation.lifeAreas).length > 0 && (
              <ScrollReveal>
                <Card>
                  <CardHeader>
                    <CardTitle className="font-[family-name:var(--font-serif)]">Life Area Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <StaggerList className="grid gap-2.5 md:grid-cols-2">
                      {Object.entries(data.interpretation.lifeAreas).map(([key, value]) => (
                        <StaggerItem
                          key={key}
                          className="rounded-lg border border-border/50 bg-surface/40 p-3"
                        >
                          <h4 className="mb-1.5 text-xs font-semibold text-primary">
                            {LIFE_AREA_LABELS[key] || key}
                          </h4>
                          <p className="text-xs leading-relaxed text-text-secondary">{value}</p>
                        </StaggerItem>
                      ))}
                    </StaggerList>
                  </CardContent>
                </Card>
              </ScrollReveal>
            )}

          {/* Significator Summary */}
          {data.interpretation.significatorSummary && (
            <ScrollReveal>
              <Card>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-serif)]">Significator Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs leading-relaxed text-text-secondary">
                    {data.interpretation.significatorSummary}
                  </p>
                </CardContent>
              </Card>
            </ScrollReveal>
          )}
        </div>
      )}
    </MotionPage>
  );
}
