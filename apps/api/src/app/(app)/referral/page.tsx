'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MotionPage, FadeIn, StaggerList, StaggerItem } from '@/components/ui/motion-primitives';
import { cardHover } from '@/lib/motion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { ShareCard } from '@/components/referral/ShareCard';

interface ShareData {
  link: string;
  whatsapp: string;
  telegram: string;
  sms: string;
  rawMessage: string;
}

interface ReferralData {
  referralCode: string;
  share: ShareData;
  totalReferrals: number;
  totalDhanamEarned: number;
  recentReferrals: Array<{ name: string; joinedAt: string; paid: boolean }>;
  referrerBonus: number;
  inviteeBonus: number;
}

function relativeTime(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diffMs = Date.now() - t;
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) return 'today';
  if (diffMs < 2 * day) return 'yesterday';
  const days = Math.floor(diffMs / day);
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.floor(months / 12)} yr ago`;
}

export default function ReferralPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReferralData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/referral')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.error || 'Failed to load referral data');
        }
      })
      .catch(() => setError('Failed to load referral data'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[calc(100dvh-164px)] items-center justify-center">
        <Loading size="lg" section="dashboard" />
      </div>
    );
  }

  return (
    <MotionPage className="min-h-screen mx-auto max-w-3xl px-3 py-4">
      <div className="mb-4">
        <h1 className="j-display text-xl text-text">Refer &amp; Earn Dhanam</h1>
        <p className="mt-0.5 text-xs text-text-secondary">
          Share your code. Each friend who joins gives you +20 Dhanam, and earns +10 themselves.
        </p>
      </div>

      {error && (
        <FadeIn>
          <Card className="mb-4 border-error/30 bg-error/5">
            <CardContent className="pt-4">
              <p className="text-xs text-error">{error}</p>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {data && (
        <StaggerList className="space-y-4">
          <StaggerItem>
            <ShareCard
              code={data.referralCode}
              share={data.share}
              referrerBonus={data.referrerBonus}
              inviteeBonus={data.inviteeBonus}
              variant="full"
            />
          </StaggerItem>

          <StaggerItem>
            <div className="grid grid-cols-2 gap-2.5">
              <motion.div {...cardHover}>
                <Card className="text-center">
                  <CardContent className="pt-4">
                    <p className="text-2xl font-bold text-primary">{data.totalReferrals}</p>
                    <p className="mt-0.5 text-xs text-text-secondary">Friends Invited</p>
                  </CardContent>
                </Card>
              </motion.div>
              <motion.div {...cardHover}>
                <Card className="text-center">
                  <CardContent className="pt-4">
                    <p className="text-2xl font-bold text-primary">{data.totalDhanamEarned}</p>
                    <p className="mt-0.5 text-xs text-text-secondary">Dhanam Earned</p>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </StaggerItem>

          <StaggerItem>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-[family-name:var(--font-serif)]">How it works</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    {
                      step: '1',
                      title: 'Share your code',
                      desc: 'Send the 6-digit code or link via WhatsApp, Telegram, or SMS.',
                    },
                    {
                      step: '2',
                      title: 'Friend joins',
                      desc: `They enter your code at signup and start with +${data.inviteeBonus} Dhanam.`,
                    },
                    {
                      step: '3',
                      title: 'You earn Dhanam',
                      desc: `Once they finish setup, you instantly receive +${data.referrerBonus} Dhanam — and a notification.`,
                    },
                  ].map((item) => (
                    <div key={item.step} className="flex items-start gap-3">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                        {item.step}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-text">{item.title}</p>
                        <p className="text-xs text-text-secondary">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </StaggerItem>

          {data.recentReferrals.length > 0 && (
            <StaggerItem>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-[family-name:var(--font-serif)]">Recent friends</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {data.recentReferrals.map((ref, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2"
                      >
                        <span className="text-xs text-text">{ref.name}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-[11px] text-text-secondary">{relativeTime(ref.joinedAt)}</span>
                          <span
                            className={`text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 border ${
                              ref.paid
                                ? 'border-primary/40 bg-primary/10 text-primary'
                                : 'border-border bg-surface-2 text-text-muted'
                            }`}
                          >
                            {ref.paid ? `+${data.referrerBonus}` : 'Pending'}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          )}
        </StaggerList>
      )}
    </MotionPage>
  );
}
