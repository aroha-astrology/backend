'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export interface FollowUpQuestion {
  id: string;
  text: string;
  options: string[];
  whyWeAsk: string;
}

export interface FollowUpAnswer {
  questionId: string;
  answer: string | null;
  skipped: boolean;
}

interface FollowUpQuestionsProps {
  questions: FollowUpQuestion[];
  onComplete: (answers: FollowUpAnswer[]) => void;
}

export function FollowUpQuestions({ questions, onComplete }: FollowUpQuestionsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<FollowUpAnswer[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);

  const totalQuestions = questions.length;
  const currentQuestion = questions[currentIndex];
  const answeredCount = answers.length;

  const handleAnswer = useCallback(() => {
    if (!currentQuestion) return;

    const answer: FollowUpAnswer = {
      questionId: currentQuestion.id,
      answer: selectedOption,
      skipped: false,
    };

    const newAnswers = [...answers, answer];
    setAnswers(newAnswers);
    setSelectedOption(null);
    setShowWhy(false);

    if (currentIndex + 1 >= totalQuestions) {
      onComplete(newAnswers);
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentQuestion, selectedOption, answers, currentIndex, totalQuestions, onComplete]);

  const handleSkip = useCallback(() => {
    if (!currentQuestion) return;

    const answer: FollowUpAnswer = {
      questionId: currentQuestion.id,
      answer: null,
      skipped: true,
    };

    const newAnswers = [...answers, answer];
    setAnswers(newAnswers);
    setSelectedOption(null);
    setShowWhy(false);

    if (currentIndex + 1 >= totalQuestions) {
      onComplete(newAnswers);
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentQuestion, answers, currentIndex, totalQuestions, onComplete]);

  if (!currentQuestion) return null;

  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-text-secondary">
          <span>{answeredCount}/{totalQuestions} questions answered</span>
          <span className="text-primary">{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Question card */}
      <div className="rounded-2xl p-4 bg-surface border border-border">
        <h3 className="mb-4 font-[family-name:var(--font-serif)] text-base font-bold text-text">{currentQuestion.text}</h3>
        <div className="space-y-4">
          {/* Options as radio buttons */}
          <div className="space-y-2">
            {currentQuestion.options.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-sm transition-all"
                style={selectedOption === option ? {
                  border: '1.5px solid var(--primary)',
                  background: 'rgba(212, 175, 55,0.10)',
                  color: 'var(--text)',
                } : {
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                }}
              >
                <input
                  type="radio"
                  name={`question-${currentQuestion.id}`}
                  value={option}
                  checked={selectedOption === option}
                  onChange={() => setSelectedOption(option)}
                  className="sr-only"
                />
                <div
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
                  style={{ borderColor: selectedOption === option ? 'var(--primary)' : 'var(--border-strong)' }}
                >
                  {selectedOption === option && (
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </div>
                <span>{option}</span>
              </label>
            ))}
          </div>

          {/* "Why we're asking" expandable */}
          <div>
            <button
              type="button"
              onClick={() => setShowWhy((prev) => !prev)}
              className="flex items-center gap-1 text-xs transition-colors"
              style={{ color: showWhy ? 'var(--primary)' : 'var(--text-muted)' }}
            >
              <span>{showWhy ? '▾' : '▸'}</span>
              <span>Why we&apos;re asking</span>
            </button>
            {showWhy && (
              <p className="mt-2 rounded-xl p-3 text-xs text-text-muted bg-primary/[0.05] border border-primary/20">
                {currentQuestion.whyWeAsk}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={handleSkip}>
              Skip
            </Button>
            <Button
              size="sm"
              disabled={!selectedOption}
              onClick={handleAnswer}
            >
              Continue
            </Button>
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-center text-xs text-text-secondary/50">
        We can make mistakes. Your answers help us improve accuracy.
      </p>
    </div>
  );
}
