'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Loading } from '@/components/ui/loading';
import { useStore } from '@/store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionPage, FadeIn, StaggerList, StaggerItem, ScrollReveal, CountUp } from '@/components/ui/motion-primitives';
import { staggerContainer, staggerItem, cardHover } from '@/lib/motion';

const muhurtaTypes = [
  { value: 'marriage', label: 'Marriage' },
  { value: 'griha_pravesh', label: 'Griha Pravesh' },
  { value: 'business_opening', label: 'Business Opening' },
  { value: 'namkaran', label: 'Namkaran (Naming)' },
  { value: 'vehicle_purchase', label: 'Vehicle Purchase' },
  { value: 'gold_purchase', label: 'Gold Purchase' },
  { value: 'travel', label: 'Travel' },
  { value: 'surgery', label: 'Surgery' },
];

interface MuhurtaResult {
  date: string;
  time: string;
  score: number;
  tithi: string;
  nakshatra: string;
  reasoning: string[];
  warnings: string[];
}

export default function MuhurtaPage() {
  const profiles = useStore((s) => s.profiles);
  const [type, setType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [location, setLocation] = useState('');
  const [profileId, setProfileId] = useState('');
  const [results, setResults] = useState<MuhurtaResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!type || !startDate || !endDate || !location) {
      setError('Please fill in all required fields.');
      return;
    }
    setLoading(true);
    setError('');
    setResults([]);
    try {
      const res = await fetch('/api/muhurta/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          startDate,
          endDate,
          location,
          chartId: profileId || undefined,
        }),
      });
      if (!res.ok) throw new Error('Calculation failed');
      const json = await res.json();
      setResults(json.data?.muhurtas ?? json.data ?? []);
    } catch {
      setError('Failed to calculate Muhurta. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'warning';
    return 'error';
  };

  return (
    <MotionPage className="mx-auto max-w-4xl px-4 py-6 min-h-screen">
      <FadeIn>
        <div className="mb-5">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Vedic Astrology</p>
          <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">Muhurta Calculator</h1>
          <p className="mt-0.5 text-sm text-text-secondary">Find the most auspicious time for your important events</p>
        </div>
      </FadeIn>

      <FadeIn delay={0.05}>
        <div className="mb-5 rounded-2xl glass-2 overflow-hidden" style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(212, 175, 55,0.12)' }}>
            <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide">Find Auspicious Timing</h2>
          </div>
          <div className="p-4 space-y-3">
            <Select
              label="Event Type"
              options={muhurtaTypes}
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="Select event type"
            />

            <div className="grid gap-2.5 sm:grid-cols-2">
              <Input
                type="date"
                label="Start Date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <Input
                type="date"
                label="End Date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <Input
              label="Location"
              placeholder="Enter city name (e.g., Mumbai, Delhi)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />

            {profiles.length > 0 && (
              <Select
                label="Link to Birth Profile (optional)"
                options={[
                  { value: '', label: 'None - Generic calculation' },
                  ...profiles.map((p) => ({ value: p.id, label: p.name })),
                ]}
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
              />
            )}

            {error && <p className="text-xs text-error">{error}</p>}

            <Button onClick={handleSubmit} isLoading={loading} className="w-full" size="lg">
              Calculate Best Muhurta
            </Button>
          </div>
        </div>
      </FadeIn>

      {loading && <Loading size="lg" section="muhurta" className="py-12" />}

      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="mt-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-[2px] h-4 rounded-full" style={{ background: 'linear-gradient(to bottom, var(--primary), #a87fff)' }} />
              <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide uppercase">
                Best Timings Found ({results.length})
              </h2>
            </div>
            <StaggerList className="space-y-3">
              {results.map((r, i) => (
                <StaggerItem key={i}>
                  <div
                    className="rounded-2xl overflow-hidden"
                    style={{
                      background: i === 0 ? 'rgba(212, 175, 55,0.06)' : 'rgba(0,0,0,0.03)',
                      border: `1px solid ${i === 0 ? 'rgba(212, 175, 55,0.30)' : 'rgba(212, 175, 55,0.10)'}`,
                      backdropFilter: 'blur(12px)',
                    }}
                  >
                    {i === 0 && <div className="h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent" />}
                    <div className="p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2.5 mb-1">
                            {i === 0 && <span className="text-base">🏆</span>}
                            <h3 className="text-sm font-bold text-text font-[family-name:var(--font-serif)]">
                              {new Date(r.date).toLocaleDateString('en-IN', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric',
                              })}
                            </h3>
                          </div>
                          <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text)' }}>{r.time}</p>
                          <div className="flex flex-wrap gap-1.5 mb-2.5">
                            {[r.tithi, r.nakshatra].map((tag) => (
                              <span key={tag} className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold" style={{ background: 'rgba(168,127,255,0.10)', border: '1px solid rgba(168,127,255,0.22)', color: '#a87fff' }}>
                                {tag}
                              </span>
                            ))}
                          </div>

                          <ul className="space-y-0.5">
                            {r.reasoning.map((reason, ri) => (
                              <li key={ri} className="flex items-start gap-1.5 text-xs text-text-secondary">
                                <span className="mt-0.5 flex-shrink-0" style={{ color: '#22c55e' }}>✦</span>
                                {reason}
                              </li>
                            ))}
                          </ul>

                          {r.warnings.length > 0 && (
                            <ul className="mt-1.5 space-y-0.5">
                              {r.warnings.map((warn, wi) => (
                                <li key={wi} className="flex items-start gap-1.5 text-xs" style={{ color: '#eab308' }}>
                                  <span className="mt-0.5 flex-shrink-0">⚡</span>
                                  {warn}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div className="text-center flex-shrink-0">
                          <div
                            className="inline-flex h-14 w-14 items-center justify-center rounded-full"
                            style={{
                              background: r.score >= 80 ? 'rgba(34,197,94,0.15)' : r.score >= 60 ? 'rgba(212, 175, 55,0.15)' : 'rgba(239,68,68,0.15)',
                              border: `2px solid ${r.score >= 80 ? 'rgba(34,197,94,0.40)' : r.score >= 60 ? 'rgba(212, 175, 55,0.40)' : 'rgba(239,68,68,0.40)'}`,
                            }}
                          >
                            <span style={{ color: r.score >= 80 ? '#22c55e' : r.score >= 60 ? 'var(--primary)' : '#ef4444' }}>
                              <CountUp value={r.score} className="text-lg font-bold" />
                            </span>
                          </div>
                          <p className="mt-1 text-[10px]" style={{ color: 'var(--text-secondary)' }}>/ 100</p>
                          <div className="mt-1 text-[10px] font-bold rounded-full px-2 py-0.5 inline-block" style={{
                            background: r.score >= 80 ? 'rgba(34,197,94,0.12)' : r.score >= 60 ? 'rgba(212, 175, 55,0.12)' : 'rgba(239,68,68,0.12)',
                            color: r.score >= 80 ? '#22c55e' : r.score >= 60 ? 'var(--primary)' : '#ef4444',
                          }}>
                            {r.score >= 80 ? 'Excellent' : r.score >= 60 ? 'Good' : 'Fair'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </StaggerList>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionPage>
  );
}
