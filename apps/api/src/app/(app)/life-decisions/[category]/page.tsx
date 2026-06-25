'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { MotionPage, FadeIn } from '@/components/ui/motion-primitives';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const categoryMap: Record<string, { label: string; icon: string; description: string }> = {
  vehicle: { label: 'Vehicle Purchase', icon: '🚗', description: 'Best time and type of vehicle to buy' },
  property: { label: 'Property & Real Estate', icon: '🏘️', description: 'Auspicious timing for property deals' },
  business: { label: 'Business Ventures', icon: '💼', description: 'Start or expand your business' },
  baby: { label: 'Family Planning', icon: '👶', description: 'Auspicious timing for conception and birth' },
  job: { label: 'Job & Career Change', icon: '💻', description: 'Switch jobs or start a new role' },
  education: { label: 'Education & Learning', icon: '📚', description: 'Courses, degrees, and skill building' },
  travel: { label: 'Travel & Relocation', icon: '✈️', description: 'Domestic or international travel' },
  investment: { label: 'Investment & Finance', icon: '📈', description: 'Stocks, mutual funds, gold, crypto' },
  wedding: { label: 'Wedding Planning', icon: '💒', description: 'Marriage date and ceremony planning' },
  naming: { label: 'Naming Ceremony', icon: '📝', description: 'Auspicious letters and names' },
  phone: { label: 'Phone & Electronics', icon: '📱', description: 'Buy new gadgets and electronics' },
  diet: { label: 'Diet & Health', icon: '🥗', description: 'Health regime and dietary changes' },
  gold: { label: 'Gold & Jewellery', icon: '💎', description: 'Best time to buy gold or jewellery' },
  loan: { label: 'Loans & Borrowing', icon: '🏦', description: 'Taking or repaying loans' },
  legal: { label: 'Legal Matters', icon: '⚖️', description: 'Court cases and legal proceedings' },
  partnership: { label: 'Partnerships', icon: '🤝', description: 'Business or personal partnerships' },
  medical: { label: 'Medical Procedures', icon: '🏥', description: 'Surgery and medical treatments' },
  spiritual: { label: 'Spiritual Practices', icon: '🙏', description: 'Puja, vrat, and spiritual initiation' },
  moving: { label: 'Moving & Shifting', icon: '🏠', description: 'House shifting and relocation' },
  pet: { label: 'Pets & Animals', icon: '🐾', description: 'Adopting or buying pets' },
  farming: { label: 'Agriculture & Farming', icon: '🌾', description: 'Sowing, harvesting, and land work' },
  electronics: { label: 'Electronics & Appliances', icon: '🖥️', description: 'Major appliance purchases' },
  charity: { label: 'Charity & Donations', icon: '🎁', description: 'Giving back and philanthropy' },
  interview: { label: 'Job Interview', icon: '🎤', description: 'Prepare for and ace interviews' },
  exam: { label: 'Exams & Competitions', icon: '📄', description: 'Competitive exams and tests' },
};

export default function LifeDecisionPage() {
  const params = useParams();
  const category = params.category as string;

  const catInfo = categoryMap[category] ?? {
    label: category.charAt(0).toUpperCase() + category.slice(1),
    icon: '🔮',
    description: 'Personalized astrological guidance',
  };

  return (
    <MotionPage className="min-h-screen mx-auto max-w-4xl px-3 py-4">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="text-3xl opacity-60">{catInfo.icon}</span>
        <div>
          <h1 className="text-xl font-bold font-[family-name:var(--font-serif)] text-text">{catInfo.label}</h1>
          <p className="text-xs text-text-secondary">{catInfo.description}</p>
        </div>
      </div>

      <FadeIn>
        <Card className="text-center">
          <CardContent className="py-12">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface-2/60 text-text-muted">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <h2 className="text-base font-semibold font-[family-name:var(--font-serif)] text-text">Coming Soon</h2>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-text-secondary">
              Life Decisions guidance is being polished. We&apos;ll unlock it for you once the new prediction engine is live.
            </p>
            <Link href="/more">
              <Button className="mt-5" size="lg" variant="secondary">
                Back to Services
              </Button>
            </Link>
          </CardContent>
        </Card>
      </FadeIn>
    </MotionPage>
  );
}

