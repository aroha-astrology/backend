'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MotionPage, FadeIn, StaggerList, StaggerItem, ScrollReveal } from '@/components/ui/motion-primitives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import { Modal } from '@/components/ui/modal';
import { useStore } from '@/store/useStore';

const videoTypes = [
  { id: 'quick', label: 'Quick Reading', duration: '2 min', credits: 1, icon: '⚡' },
  { id: 'standard', label: 'Standard Reading', duration: '5 min', credits: 2, icon: '🌟' },
  { id: 'detailed', label: 'Detailed Reading', duration: '10 min', credits: 3, icon: '🔮' },
];

const languages = [
  { value: 'hindi', label: 'Hindi' },
  { value: 'english', label: 'English' },
  { value: 'tamil', label: 'Tamil' },
];

const focusAreas = ['General', 'Career', 'Marriage', 'Health', 'Wealth'];

type VideoStatus = 'idle' | 'pending' | 'generating' | 'ready' | 'error';

export default function VideoPage() {
  // All features are free — no credits required

  const [selectedType, setSelectedType] = useState('');
  const [language, setLanguage] = useState('hindi');
  const [focusArea, setFocusArea] = useState('General');
  const [question, setQuestion] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState<VideoStatus>('idle');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoId, setVideoId] = useState('');
  const [error, setError] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedTypeData = videoTypes.find((t) => t.id === selectedType);

  const pollStatus = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/video/status/${id}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.data.status === 'ready') {
        setStatus('ready');
        setVideoUrl(json.data.video_url);
        if (pollRef.current) clearInterval(pollRef.current);
      } else if (json.data.status === 'error') {
        setStatus('error');
        setError('Video generation failed. Credits have been refunded.');
        if (pollRef.current) clearInterval(pollRef.current);
      } else {
        setStatus(json.data.status);
      }
    } catch {
      // continue polling
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleGenerate = async () => {
    setShowConfirm(false);
    setStatus('pending');
    setError('');

    try {
      const res = await fetch('/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: selectedType,
          language,
          focus_area: focusArea,
          question: question || undefined,
        }),
      });

      if (!res.ok) throw new Error('Generation failed');

      const json = await res.json();
      const vid = json.data.videoId ?? json.data.id;
      setVideoId(vid);
      setStatus('generating');

      pollRef.current = setInterval(() => pollStatus(vid), 5000);
    } catch {
      setStatus('error');
      setError('Failed to start video generation. Please try again.');
    }
  };

  const handleReplay = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
    }
  };

  return (
    <MotionPage className="min-h-screen mx-auto max-w-4xl px-3 py-4">
      <h1 className="mb-4 text-xl font-bold font-[family-name:var(--font-serif)] text-text">AI Video Reading</h1>

      {status === 'idle' && (
        <div className="space-y-4">
          {/* Step 1: Type */}
          <ScrollReveal>
            <div>
              <h2 className="mb-2.5 text-xs font-semibold text-text-secondary">Step 1: Select Type</h2>
              <StaggerList className="grid gap-2.5 sm:grid-cols-3">
                {videoTypes.map((t) => (
                  <StaggerItem key={t.id}>
                    <Card
                      className={`cursor-pointer transition-all ${selectedType === t.id ? 'border-primary ring-1 ring-primary/30' : 'hover:border-primary/30'}`}
                      onClick={() => setSelectedType(t.id)}
                    >
                      <CardContent className="text-center">
                        <span className="text-2xl">{t.icon}</span>
                        <p className="mt-1.5 text-sm font-semibold text-text">{t.label}</p>
                        <p className="text-xs text-text-secondary">{t.duration}</p>
                        <Badge className="mt-1.5">{t.credits} credit{t.credits > 1 ? 's' : ''}</Badge>
                      </CardContent>
                    </Card>
                  </StaggerItem>
                ))}
              </StaggerList>
            </div>
          </ScrollReveal>

          {/* Step 2: Language */}
          <FadeIn delay={0.05}>
            <div>
              <h2 className="mb-2.5 text-xs font-semibold text-text-secondary">Step 2: Select Language</h2>
              <div className="flex flex-wrap gap-1.5">
                {languages.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => setLanguage(l.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      language === l.value
                        ? 'bg-primary text-bg'
                        : 'border border-border bg-surface text-text-secondary hover:text-text'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </FadeIn>

          {/* Step 3: Focus Area */}
          <FadeIn delay={0.1}>
            <div>
              <h2 className="mb-2.5 text-xs font-semibold text-text-secondary">Step 3: Focus Area</h2>
              <div className="flex flex-wrap gap-1.5">
                {focusAreas.map((area) => (
                  <button
                    key={area}
                    onClick={() => setFocusArea(area)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      focusArea === area
                        ? 'bg-primary text-bg'
                        : 'border border-border bg-surface text-text-secondary hover:text-text'
                    }`}
                  >
                    {area}
                  </button>
                ))}
              </div>
            </div>
          </FadeIn>

          {/* Step 4: Question */}
          <FadeIn delay={0.15}>
            <div>
              <h2 className="mb-2.5 text-xs font-semibold text-text-secondary">
                Step 4: Specific Question (Optional)
              </h2>
              <textarea
                className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text placeholder:text-text-secondary/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                rows={3}
                placeholder="e.g., Should I switch jobs this year?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>
          </FadeIn>

          {/* Disclaimer */}
          <FadeIn delay={0.2}>
            <Card className="border-warning/30 bg-warning/5">
              <CardContent className="flex items-start gap-2.5">
                <span className="text-lg">⚠️</span>
                <p className="text-xs text-text-secondary">
                  Video generation is under active deployment. Minor errors may occur. Generated readings
                  are AI-powered and should be treated as guidance, not absolute predictions.
                </p>
              </CardContent>
            </Card>
          </FadeIn>

          {/* Generate */}
          <Card>
            <CardContent className="flex justify-end">
              <Button
                size="lg"
                disabled={!selectedType}
                onClick={() => setShowConfirm(true)}
              >
                {!selectedType ? 'Select a Type' : 'Generate Video'}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Generating states */}
      {(status === 'pending' || status === 'generating') && (
        <FadeIn>
          <Card className="py-12 text-center">
            <CardContent>
              <Loading size="lg" />
              <p className="mt-3 text-base font-semibold text-text">
                {status === 'pending' ? 'Starting generation...' : 'Generating your video reading...'}
              </p>
              <p className="mt-1.5 text-xs text-text-secondary">
                This may take a few minutes. Please do not close this page.
              </p>
              <div className="mx-auto mt-4 h-1.5 w-56 overflow-hidden rounded-full bg-surface">
                <div className="h-full animate-pulse rounded-full bg-primary/60" style={{ width: status === 'pending' ? '20%' : '60%' }} />
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {/* Video ready */}
      {status === 'ready' && videoUrl && (
        <FadeIn>
          <div className="space-y-3">
            <Card>
              <CardContent>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  controls
                  className="w-full rounded-lg"
                  autoPlay
                />
              </CardContent>
            </Card>
            <div className="flex gap-2.5">
              <Button onClick={handleReplay} variant="outline">
                Replay
              </Button>
              <Button
                onClick={() => {
                  setStatus('idle');
                  setVideoUrl('');
                  setSelectedType('');
                }}
                variant="secondary"
              >
                Generate Another
              </Button>
            </div>
          </div>
        </FadeIn>
      )}

      {/* Error */}
      {status === 'error' && (
        <FadeIn>
          <Card className="text-center">
            <CardContent className="py-10">
              <span className="text-3xl">❌</span>
              <p className="mt-3 text-error text-sm">{error}</p>
              <Button
                className="mt-3"
                onClick={() => {
                  setStatus('idle');
                  setError('');
                }}
              >
                Try Again
              </Button>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Confirm Generation"
      >
        <div className="space-y-3">
          <p className="text-xs text-text-secondary">
            You are about to generate a <strong className="text-text">{selectedTypeData?.label}</strong> in{' '}
            <strong className="text-text">{language}</strong> focused on{' '}
            <strong className="text-text">{focusArea}</strong>.
          </p>
          <div className="flex gap-2.5 justify-end">
            <Button variant="ghost" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerate}>Confirm & Generate</Button>
          </div>
        </div>
      </Modal>
    </MotionPage>
  );
}
