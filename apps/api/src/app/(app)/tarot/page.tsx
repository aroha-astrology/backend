'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionPage, FadeIn, StaggerList, StaggerItem, ScrollReveal } from '@/components/ui/motion-primitives';
import { cardHover } from '@/lib/motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { SPREADS, type SpreadKey } from '@/lib/tarot/spreads';
import { TarotScene } from '@/components/tarot/TarotScene';
import { TarotDeck3D } from '@/components/tarot/TarotDeck3D';
import type { CardElement, Orientation } from '@/lib/tarot/deck';
import type { QuestionTheme } from '@/lib/tarot/interpret';

interface TarotCardResult {
  id: string;
  name: string;
  number: string;
  arcana: 'major' | 'minor';
  orientation: Orientation;
  position: string;
  interpretation: string;
  vedic: { element: CardElement; deity_hint?: string };
}

interface TarotResult {
  spread: SpreadKey;
  cards: TarotCardResult[];
  summary?: [string, string, string];
  overall_message: string;
  theme?: QuestionTheme;
}

const SPREAD_OPTION_ORDER: SpreadKey[] = ['single', 'three', 'relationship', 'horseshoe', 'celtic_cross'];

export default function TarotPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [question, setQuestion] = useState('');
  const [spread, setSpread] = useState<SpreadKey | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [policyMessage, setPolicyMessage] = useState('');
  const [result, setResult] = useState<TarotResult | null>(null);
  const [highlighted, setHighlighted] = useState<number | null>(null);

  const handleDraw = async () => {
    if (!question.trim() || !spread) return;

    setLoading(true);
    setError('');
    setPolicyMessage('');
    setResult(null);

    try {
      const res = await fetch('/api/tarot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), spread }),
      });

      const json = await res.json();

      if (!res.ok) {
        const errMsg = (json as { error?: string }).error ?? 'Failed to draw cards';
        if (errMsg === 'INSUFFICIENT_TOKENS') {
          setError('You need 2 credits to draw this reading.');
        } else {
          setError(errMsg);
        }
        return;
      }

      // Server returns success:false with POLICY_BLOCKED for banned questions.
      if (json && json.success === false && json.error === 'POLICY_BLOCKED') {
        setPolicyMessage(json.data?.response ?? '');
        return;
      }

      setResult(json.data as TarotResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setQuestion('');
    setSpread('');
    setResult(null);
    setError('');
    setPolicyMessage('');
    setHighlighted(null);
  };

  return (
    <MotionPage className="mx-auto max-w-5xl px-4 py-6 min-h-screen">
      <div className="mb-5">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Mystical Arts</p>
        <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">Tarot Card Reading</h1>
        <p className="mt-0.5 text-sm text-text-secondary">Receive guidance through the cards, framed by Vedic wisdom.</p>
      </div>

      {/* Step indicators */}
      <AnimatePresence mode="wait">
        {!result && !loading && (
          <FadeIn key="steps-indicator" className="mb-5 flex items-center gap-1.5">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    step >= s
                      ? 'bg-primary text-white'
                      : 'bg-surface text-text-secondary border border-border'
                  }`}
                >
                  {s}
                </div>
                {s < 3 && (
                  <div
                    className={`h-0.5 w-7 transition-colors ${
                      step > s ? 'bg-primary' : 'bg-border'
                    }`}
                  />
                )}
              </div>
            ))}
            <span className="ml-2 text-[11px] text-text-secondary">
              {step === 1 ? 'Ask your question' : step === 2 ? 'Choose spread' : 'Draw cards'}
            </span>
          </FadeIn>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {/* Step 1: Question */}
        {!result && !loading && step === 1 && (
          <motion.div
            key="step-1"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="j-card relative overflow-hidden">
              <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{ height: 220 }}>
                <TarotDeck3D />
              </div>
              <div className="relative">
                <CardHeader>
                  <CardTitle className="text-base font-[family-name:var(--font-serif)]">What would you like guidance on?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-text-secondary">
                    Focus your mind on one area of life. The more specific your question, the more useful the reading.
                  </p>
                  <textarea
                    className="flex min-h-[100px] w-full rounded-lg border border-border bg-surface/60 px-3 py-2.5 text-sm text-text placeholder:text-text-secondary/50 transition-all duration-200 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-surface resize-none"
                    placeholder="e.g., What should I focus on in my work this year?"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                  />
                  {error && <p className="text-xs text-error">{error}</p>}
                  {policyMessage && (
                    <p className="text-xs text-warning bg-warning/10 border border-warning/30 rounded-md p-2.5">{policyMessage}</p>
                  )}
                  <Button
                    onClick={() => {
                      if (!question.trim()) {
                        setError('Please enter your question.');
                        return;
                      }
                      setError('');
                      setPolicyMessage('');
                      setStep(2);
                    }}
                    disabled={!question.trim()}
                    className="w-full"
                    size="lg"
                  >
                    Continue
                  </Button>
                </CardContent>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Step 2: Spread selection */}
        {!result && !loading && step === 2 && (
          <motion.div
            key="step-2"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="j-card">
              <CardHeader>
                <CardTitle className="text-base font-[family-name:var(--font-serif)]">Choose Your Spread</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md bg-surface/60 p-2.5 text-xs text-text-secondary">
                  Your question: &ldquo;{question}&rdquo;
                </div>

                <StaggerList className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {SPREAD_OPTION_ORDER.map((key) => {
                    const def = SPREADS[key];
                    const selected = spread === key;
                    return (
                      <StaggerItem key={key}>
                        <motion.button
                          {...cardHover}
                          onClick={() => {
                            setSpread(key);
                            setStep(3);
                          }}
                          className={`w-full rounded-lg border-2 p-3 text-left transition-all hover:border-primary/40 ${
                            selected ? 'border-primary bg-primary/5' : 'border-border'
                          }`}
                        >
                          <p className="text-base font-bold text-text">{def.label}</p>
                          <p className="mt-0.5 text-[11px] text-text-secondary">{def.description}</p>
                          <Badge variant="outline" className="mt-1.5">
                            {def.cardCount} {def.cardCount === 1 ? 'card' : 'cards'}
                          </Badge>
                        </motion.button>
                      </StaggerItem>
                    );
                  })}
                </StaggerList>

                <Button variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Step 3: Draw */}
        {!result && !loading && step === 3 && spread && (
          <motion.div
            key="step-3"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="j-card">
              <CardHeader>
                <CardTitle className="text-base font-[family-name:var(--font-serif)]">Ready to Draw</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5 rounded-md bg-surface/60 p-2.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Question</span>
                    <span className="text-text font-medium text-right max-w-[60%]">{question}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Spread</span>
                    <span className="text-text font-medium">{SPREADS[spread].label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Investment</span>
                    <span className="text-primary font-semibold">2 credits</span>
                  </div>
                </div>

                <div className="h-[240px] rounded-lg overflow-hidden border border-border bg-surface/40">
                  <TarotDeck3D />
                </div>

                <p className="text-xs text-text-secondary text-center">
                  Take a deep breath, hold the question in mind, and draw.
                </p>

                {error && <p className="text-xs text-error">{error}</p>}

                <Button onClick={handleDraw} className="w-full" size="lg">
                  Draw Cards
                </Button>
                <Button variant="outline" onClick={() => setStep(2)} className="w-full">
                  Back
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Loading */}
        {loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Card className="j-card text-center">
              <CardContent className="py-6">
                <div className="h-[260px] rounded-lg overflow-hidden">
                  <TarotDeck3D />
                </div>
                <div className="mt-4 flex flex-col items-center gap-2">
                  <Loading size="md" />
                  <p className="text-base font-semibold text-text">Shuffling the deck…</p>
                  <p className="text-xs text-text-secondary">Drawing your cards and weaving the reading.</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Results */}
        {result && !loading && (
          <ResultsView
            result={result}
            highlighted={highlighted}
            setHighlighted={setHighlighted}
            onReset={handleReset}
          />
        )}
      </AnimatePresence>
    </MotionPage>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Results view — pulled out for readability
// ────────────────────────────────────────────────────────────────────────────

function ResultsView({
  result,
  highlighted,
  setHighlighted,
  onReset,
}: {
  result: TarotResult;
  highlighted: number | null;
  setHighlighted: (i: number | null) => void;
  onReset: () => void;
}) {
  const geometry = useMemo(() => SPREADS[result.spread].geometry, [result.spread]);

  return (
    <motion.div
      key="results"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* 3D spread stage */}
      <Card className="j-card mb-4 overflow-hidden">
        <CardContent className="p-2 sm:p-3">
          <div style={{ minHeight: 360 }}>
            <TarotScene
              cards={result.cards}
              geometry={geometry}
              highlightedIndex={highlighted}
              height={420}
            />
          </div>
        </CardContent>
      </Card>

      {/* H/N/A summary trio */}
      {result.summary && (
        <ScrollReveal>
          <Card className="j-card mb-4">
            <CardContent className="space-y-2 p-4">
              <p className="text-sm font-semibold text-text">{result.summary[0]}</p>
              <p className="text-sm text-text-secondary">{result.summary[1]}</p>
              <p className="text-sm text-text-secondary"><span className="text-primary font-semibold">This week — </span>{result.summary[2]}</p>
            </CardContent>
          </Card>
        </ScrollReveal>
      )}

      {/* Per-card interpretations */}
      <StaggerList
        className={`grid gap-2.5 ${
          result.cards.length === 1
            ? 'max-w-md mx-auto'
            : result.cards.length <= 3
              ? 'sm:grid-cols-3'
              : 'sm:grid-cols-2 lg:grid-cols-3'
        }`}
      >
        {result.cards.map((card, i) => (
          <StaggerItem key={i}>
            <motion.div
              {...cardHover}
              onMouseEnter={() => setHighlighted(i)}
              onMouseLeave={() => setHighlighted(null)}
            >
              <Card
                className={`j-card transition-all ${
                  card.orientation === 'Reversed' ? 'border-warning/30' : 'border-primary/30'
                }`}
              >
                <CardHeader className="pb-1.5">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[11px]">{card.position}</Badge>
                    <Badge variant={card.orientation === 'Upright' ? 'success' : 'warning'}>
                      {card.orientation}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-2 text-center">
                    <p className="text-[11px] text-text-secondary">{card.number}</p>
                    <h3 className="text-base font-bold font-[family-name:var(--font-serif)] text-text">{card.name}</h3>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">{card.interpretation}</p>
                </CardContent>
              </Card>
            </motion.div>
          </StaggerItem>
        ))}
      </StaggerList>

      {/* Overall message */}
      <ScrollReveal>
        <Card className="j-card mt-4">
          <CardHeader>
            <CardTitle className="text-base font-[family-name:var(--font-serif)]">Overall Reading</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-secondary leading-relaxed">{result.overall_message}</p>
          </CardContent>
        </Card>
      </ScrollReveal>

      <div className="mt-4 text-center">
        <Button variant="outline" onClick={onReset}>New Reading</Button>
      </div>
    </motion.div>
  );
}
