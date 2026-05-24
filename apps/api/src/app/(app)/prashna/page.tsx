'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionPage, FadeIn, StaggerList, StaggerItem, ScrollReveal } from '@/components/ui/motion-primitives';
import { staggerContainer, staggerItem, cardHover } from '@/lib/motion';

interface PlanetData {
  planet: string;
  sign: string;
  signDegree: number;
  house: number;
  nakshatra: string;
  nakshatraPada: number;
  isRetrograde: boolean;
}

interface AscendantData {
  sign: string;
  signIndex: number;
  degree: number;
  nakshatra: string;
  nakshatraPada: number;
}

interface Interpretation {
  summary: string;
  detailedAnalysis: string;
  favorability: 'favorable' | 'unfavorable' | 'mixed';
  timing: string;
  advice: string;
  keyFactors: string[];
}

interface PrashnaResult {
  question: string;
  castAt: string;
  location: { latitude: number; longitude: number };
  ascendant: AscendantData;
  planets: PlanetData[];
  interpretation: Interpretation;
}

const PLANET_EMOJI: Record<string, string> = {
  Sun: '\u2609', Moon: '\u263D', Mars: '\u2642', Mercury: '\u263F',
  Jupiter: '\u2643', Venus: '\u2640', Saturn: '\u2644', Rahu: '\u260A', Ketu: '\u260B',
};

export default function PrashnaPage() {
  const [question, setQuestion] = useState('');
  const [city, setCity] = useState('Delhi');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PrashnaResult | null>(null);
  const [error, setError] = useState('');

  // Simple city -> coordinates mapping
  const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
    Delhi: { lat: 28.6139, lng: 77.209 },
    Mumbai: { lat: 19.076, lng: 72.8777 },
    Bangalore: { lat: 12.9716, lng: 77.5946 },
    Chennai: { lat: 13.0827, lng: 80.2707 },
    Kolkata: { lat: 22.5726, lng: 88.3639 },
    Hyderabad: { lat: 17.385, lng: 78.4867 },
    Pune: { lat: 18.5204, lng: 73.8567 },
    Jaipur: { lat: 26.9124, lng: 75.7873 },
    Lucknow: { lat: 26.8467, lng: 80.9462 },
    Varanasi: { lat: 25.3176, lng: 82.9739 },
  };

  const handleSubmit = async () => {
    if (!question.trim() || question.trim().length < 5) {
      setError('Please enter a meaningful question (at least 5 characters).');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const coords = CITY_COORDS[city] || CITY_COORDS.Delhi;
      const res = await fetch('/api/prashna', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          latitude: coords.lat,
          longitude: coords.lng,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to cast Prashna chart');
      }

      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Unknown error');
      setResult(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const favorabilityColor = (f: string) => {
    if (f === 'favorable') return 'success';
    if (f === 'unfavorable') return 'error';
    return 'warning';
  };

  return (
    <MotionPage className="min-h-screen">
      {/* Header */}
      <div className="px-4 pb-4 pt-6" style={{ borderBottom: '1px solid rgba(212, 175, 55,0.10)' }}>
        <div className="mx-auto max-w-[900px]">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Horary Astrology</p>
          <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">
            Prashna Kundli
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Cast a chart for the exact moment you ask your question
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[900px] px-4 py-4 pb-16">
        {/* Explanation */}
        <FadeIn>
          <div className="mb-4 rounded-xl border border-primary/15 bg-primary/[0.06] p-3">
            <p className="text-xs leading-relaxed text-text-secondary">
              <strong className="text-primary">How it works:</strong> Prashna Kundli is cast for the exact
              moment you ask your question. No birth time is needed. The positions of planets at the moment of
              inquiry reveal the answer. Think clearly about your question, then click &quot;Cast Prashna Chart.&quot;
            </p>
          </div>
        </FadeIn>

        {/* Input form */}
        <FadeIn delay={0.05}>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="font-[family-name:var(--font-serif)]">Ask Your Question</CardTitle>
              <CardDescription>
                Focus on one specific question for the most accurate reading.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-text">
                    Your Question
                  </label>
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="e.g., Will I get the job I interviewed for? Should I invest in this property?"
                    rows={3}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-text outline-none placeholder:text-text-secondary/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-text">
                    Your Current City
                  </label>
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-text outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
                    style={{ fontFamily: 'inherit' }}
                  >
                    {Object.keys(CITY_COORDS).map((c) => (
                      <option key={c} value={c} className="bg-surface">
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {error && (
                  <div className="rounded-lg border border-error/25 bg-error/[0.08] px-3 py-2 text-xs text-error">
                    {error}
                  </div>
                )}

                <Button onClick={handleSubmit} isLoading={loading} size="lg">
                  Cast Prashna Chart
                </Button>
              </div>
            </CardContent>
          </Card>
        </FadeIn>

        {/* Loading */}
        {loading && (
          <div className="py-8">
            <Loading size="lg" section="prashna" />
          </div>
        )}

        {/* Results */}
        <AnimatePresence>
          {result && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="flex flex-col gap-4"
            >
              {/* Answer summary */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="font-[family-name:var(--font-serif)]">Prashna Answer</CardTitle>
                    <Badge variant={favorabilityColor(result.interpretation.favorability)}>
                      {result.interpretation.favorability?.toUpperCase() || 'MIXED'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-text-secondary">
                    Chart cast at {new Date(result.castAt).toLocaleString('en-IN')}
                  </p>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-text leading-relaxed font-medium">
                    {result.interpretation.summary}
                  </p>

                  {result.interpretation.timing && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <span className="text-xs text-text-secondary">Timing:</span>
                      <Badge variant="accent">{result.interpretation.timing}</Badge>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Chart data */}
              <ScrollReveal>
                <Card>
                  <CardHeader>
                    <CardTitle className="font-[family-name:var(--font-serif)]">Prashna Chart</CardTitle>
                    <CardDescription>
                      Ascendant: {result.ascendant.sign} ({result.ascendant.degree.toFixed(1)}&deg;)
                      &mdash; {result.ascendant.nakshatra} Pada {result.ascendant.nakshatraPada}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr>
                            {['Planet', 'Sign', 'Degree', 'House', 'Nakshatra', 'Pada', 'Retro'].map((h) => (
                              <th
                                key={h}
                                className="border-b border-white/[0.08] px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-text-secondary"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.planets.map((p) => (
                            <tr key={p.planet} className="border-b border-white/[0.04]">
                              <td className="px-2.5 py-2 font-semibold text-accent">
                                {PLANET_EMOJI[p.planet] || ''} {p.planet}
                              </td>
                              <td className="px-2.5 py-2 text-text">{p.sign}</td>
                              <td className="px-2.5 py-2 text-text-secondary">{p.signDegree.toFixed(1)}&deg;</td>
                              <td className="px-2.5 py-2 text-text">{p.house}</td>
                              <td className="px-2.5 py-2 text-text-secondary">{p.nakshatra}</td>
                              <td className="px-2.5 py-2 text-text-secondary">{p.nakshatraPada}</td>
                              <td className="px-2.5 py-2">
                                {p.isRetrograde && (
                                  <Badge variant="error">R</Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </ScrollReveal>

              {/* Detailed analysis */}
              <ScrollReveal>
                <Card>
                  <CardHeader>
                    <CardTitle className="font-[family-name:var(--font-serif)]">Detailed Analysis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="whitespace-pre-wrap text-xs leading-relaxed text-text-secondary">
                      {result.interpretation.detailedAnalysis}
                    </div>

                    {result.interpretation.keyFactors?.length > 0 && (
                      <div className="mt-3">
                        <h4 className="mb-2 text-xs font-semibold text-text">
                          Key Factors
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {result.interpretation.keyFactors.map((f, i) => (
                            <Badge key={i} variant="outline">{f}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.interpretation.advice && (
                      <div className="mt-3 rounded-lg border border-success/15 bg-success/[0.06] p-3">
                        <h4 className="mb-1 text-xs font-semibold text-success">Advice</h4>
                        <p className="text-xs leading-relaxed text-text-secondary">
                          {result.interpretation.advice}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </ScrollReveal>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mt-6 text-center text-[11px] text-text-secondary/70">
          Prashna Kundli uses Vedic horary principles + AI interpretation. Use as guidance, not absolute truth.
        </p>
      </div>
    </MotionPage>
  );
}
