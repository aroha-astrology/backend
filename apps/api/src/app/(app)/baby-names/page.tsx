'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Loading } from '@/components/ui/loading';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionPage, FadeIn, StaggerList, StaggerItem, ScrollReveal } from '@/components/ui/motion-primitives';
import { staggerContainer, staggerItem, cardHover } from '@/lib/motion';

const ALL_NAKSHATRAS = [
  { value: '', label: 'Auto-detect from DOB' },
  { value: 'Ashwini', label: 'Ashwini' },
  { value: 'Bharani', label: 'Bharani' },
  { value: 'Krittika', label: 'Krittika' },
  { value: 'Rohini', label: 'Rohini' },
  { value: 'Mrigashira', label: 'Mrigashira' },
  { value: 'Ardra', label: 'Ardra' },
  { value: 'Punarvasu', label: 'Punarvasu' },
  { value: 'Pushya', label: 'Pushya' },
  { value: 'Ashlesha', label: 'Ashlesha' },
  { value: 'Magha', label: 'Magha' },
  { value: 'PurvaPhalguni', label: 'Purva Phalguni' },
  { value: 'UttaraPhalguni', label: 'Uttara Phalguni' },
  { value: 'Hasta', label: 'Hasta' },
  { value: 'Chitra', label: 'Chitra' },
  { value: 'Swati', label: 'Swati' },
  { value: 'Vishakha', label: 'Vishakha' },
  { value: 'Anuradha', label: 'Anuradha' },
  { value: 'Jyeshtha', label: 'Jyeshtha' },
  { value: 'Moola', label: 'Mula' },
  { value: 'PurvaAshadha', label: 'Purva Ashadha' },
  { value: 'UttaraAshadha', label: 'Uttara Ashadha' },
  { value: 'Shravana', label: 'Shravana' },
  { value: 'Dhanishta', label: 'Dhanishta' },
  { value: 'Shatabhisha', label: 'Shatabhisha' },
  { value: 'PurvaBhadrapada', label: 'Purva Bhadrapada' },
  { value: 'UttaraBhadrapada', label: 'Uttara Bhadrapada' },
  { value: 'Revati', label: 'Revati' },
];

interface BabyName {
  name: string;
  meaning: string;
  numerologyScore: number;
  origin: string;
}

interface BabyNameResult {
  nakshatra: string;
  syllables: string[];
  luckyNumber: number;
  names: BabyName[];
}

export default function BabyNamesPage() {
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [nakshatra, setNakshatra] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BabyNameResult | null>(null);

  const handleSubmit = async () => {
    if (!dob) {
      setError('Please select a date of birth.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/baby-names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dob,
          gender,
          nakshatra: nakshatra || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error((errJson as { error?: string }).error ?? 'Failed to generate names');
      }

      const json = await res.json();
      setResult(json.data as BabyNameResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MotionPage className="mx-auto max-w-5xl px-4 py-6 min-h-screen">
      <FadeIn>
        <div className="mb-5">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Namkaran</p>
          <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">Baby Name Suggestions</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Find the perfect name for your child based on Vedic astrology and numerology.
          </p>
        </div>
      </FadeIn>

      <AnimatePresence mode="wait">
        {!result && !loading && (
          <FadeIn key="form">
            <div className="grid gap-5 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="font-[family-name:var(--font-serif)]">Enter Birth Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    label="Date of Birth"
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                  />

                  <Select
                    label="Gender"
                    options={[
                      { value: 'male', label: 'Male' },
                      { value: 'female', label: 'Female' },
                    ]}
                    value={gender}
                    onChange={(e) => setGender(e.target.value as 'male' | 'female')}
                  />

                  <Select
                    label="Nakshatra (optional override)"
                    options={ALL_NAKSHATRAS}
                    value={nakshatra}
                    onChange={(e) => setNakshatra(e.target.value)}
                  />

                  {error && <p className="text-sm text-error">{error}</p>}

                  <Button
                    onClick={handleSubmit}
                    disabled={!dob}
                    className="w-full"
                    size="lg"
                  >
                    Generate Baby Names
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-[family-name:var(--font-serif)]">How It Works</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2.5">
                    {[
                      'Nakshatra is calculated from the date of birth',
                      'Each nakshatra has specific starting syllables (aksharas)',
                      'Names beginning with these syllables are considered auspicious',
                      'Numerology lucky number is derived from the full DOB',
                      'AI generates 20 curated names with meanings and scores',
                      'Names are scored based on numerological harmony',
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                        <span className="mt-0.5 font-bold text-primary">{i + 1}.</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </FadeIn>
        )}

        {loading && (
          <FadeIn key="loading">
            <Card className="py-12 text-center">
              <CardContent>
                <Loading size="lg" />
                <p className="mt-3 text-base font-semibold text-text">Generating baby names...</p>
                <p className="mt-1.5 text-sm text-text-secondary">
                  Our AI is crafting personalized name suggestions based on Vedic astrology and numerology.
                </p>
              </CardContent>
            </Card>
          </FadeIn>
        )}

        {result && !loading && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            {/* Summary */}
            <Card className="mb-4">
              <CardContent className="py-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <Badge variant="default">Nakshatra: {result.nakshatra}</Badge>
                  <Badge variant="accent">Lucky Number: {result.luckyNumber}</Badge>
                  <Badge variant="outline">
                    Syllables: {result.syllables.join(', ')}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Name grid */}
            <StaggerList className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {result.names.map((item, i) => (
                <StaggerItem key={i}>
                  <motion.div {...cardHover}>
                    <Card className="transition-all hover:border-primary/30">
                      <CardContent className="py-3">
                        <div className="mb-1.5 flex items-start justify-between">
                          <h3 className="text-base font-bold text-text">{item.name}</h3>
                          <Badge
                            variant={
                              item.numerologyScore === result.luckyNumber
                                ? 'success'
                                : item.numerologyScore <= 3
                                  ? 'warning'
                                  : 'default'
                            }
                          >
                            {item.numerologyScore}
                          </Badge>
                        </div>
                        <p className="mb-1.5 text-sm text-text-secondary">{item.meaning}</p>
                        <Badge variant="outline" className="text-xs">
                          {item.origin}
                        </Badge>
                      </CardContent>
                    </Card>
                  </motion.div>
                </StaggerItem>
              ))}
            </StaggerList>

            <div className="mt-4 text-center">
              <Button
                variant="outline"
                onClick={() => {
                  setResult(null);
                  setDob('');
                  setNakshatra('');
                }}
              >
                Generate More Names
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionPage>
  );
}
