// Deterministic fallback content for Mobile Numerology reports.
// Indexed primarily by harmony verdict, with light Mulank-aware overrides.
//
// Honours: no planet/dasha names in narrative, sector-only references,
// no banned words, lead with human impact.

import type { MobileNumberAnalysis } from '@aroha-astrology/astro-engine';

export interface MobileNumerologyContent {
  headline: string;
  decoded: string;
  how_this_number_behaves: {
    money: string;
    career: string;
    relationships: string;
  };
  harmony_with_you: string;
  verdict_and_next_step: string;
  lucky_digits_to_keep_an_eye_on: number[];
}

const VERDICT_HEADLINE: Record<string, (a: MobileNumberAnalysis) => string> = {
  powerful: (a) =>
    `This number vibrates at ${a.vibration} and lands in real harmony with the way your life is wired. It is doing more for you than you probably notice.`,
  supportive: (a) =>
    `This number vibrates at ${a.vibration} and supports the rhythm your life already runs at. Not flashy — quietly on your side.`,
  neutral: (a) =>
    `This number vibrates at ${a.vibration}. It does not push against you, but it does not amplify you either. Keepable, swappable — your call.`,
  draining: (a) =>
    `This number vibrates at ${a.vibration} and runs a little against the grain of how your life is actually wired. The friction is small but cumulative.`,
};

const VERDICT_NEXT_STEP: Record<string, string> = {
  powerful: 'Keep this number as long as you can. If you ever consider changing it, look for a number that reduces to the same vibration so you do not lose the lift you already have.',
  supportive: 'No urgency to change. If a new SIM crosses your path, check that its digits reduce to one of your friendly numbers — otherwise stick with this one, it is doing fine work.',
  neutral: 'You can keep this or change it without much practical difference. If you do change, hunt for a number whose total digit reduction lands on one of your friendly digits — that is where the real upgrade lives.',
  draining: 'When a clean opportunity to switch numbers comes along, take it. Look for a new SIM where the 10-digit total reduces to one of your friendly numbers and the last digit is one you respond well to. Until then, lower the wear by saving the number you actually share most as a contact alias and using messaging apps for daily chatter.',
};

const VIBRATION_BEHAVIOUR: Record<number, { money: string; career: string; relationships: string }> = {
  1: {
    money: 'Money tied to this number arrives in spikes around new beginnings — a new offer, a new role, a new platform you said yes to.',
    career: 'You will notice this number behaves best when you are visibly leading something. Quiet maintenance seasons feel quieter on this line.',
    relationships: 'Conversations on this number trend toward direct, decisive, fast-resolution. The trade-off: nuance gets lost if you are not careful.',
  },
  2: {
    money: 'This number favours money that flows through partnerships and arrangements. Solo deals on this line often need an extra round to close.',
    career: 'You will close more meetings on this number when you let the other side talk first. It is wired for harmony, not assertion.',
    relationships: 'People feel more easily met on this number. Personal conversations stretch longer here than on a number with a different vibration.',
  },
  3: {
    money: 'Money tied to this number arrives through expression — when you are talking about your work, not just doing it. Quiet weeks on this number tend to be quiet money weeks.',
    career: 'Calls and pitches on this number go better than emails on it. The vibration favours voice over text.',
    relationships: 'Charm travels well on this line. Sincerity sometimes gets read as performance — slow down at the moments that matter.',
  },
  4: {
    money: 'This number favours money that builds slowly and stays — recurring payments, stable accounts, predictable inflows. It is allergic to gamble.',
    career: 'Work on this number lands best when it is structured, scheduled, and shipped. Improvising on it feels heavier than it should.',
    relationships: 'You read as steady and reliable on this line. The trade: people sometimes hear you as cold when you are just being practical.',
  },
  5: {
    money: 'Money on this number arrives through motion — travel work, new geographies, new accounts. Staying still on a 5-number tends to feel like leaking money.',
    career: 'This number rewards saying yes. New introductions, new platforms, new approaches all do disproportionately well on it.',
    relationships: 'Conversations move fast on this line. People feel energised after them — and sometimes a little overwhelmed.',
  },
  6: {
    money: 'This number behaves well around money tied to home, family, or care — household decisions, shared accounts, family-driven sectors.',
    career: 'Sectors that involve hospitality, healing, or domestic service get an extra lift on this number. Hard-edge negotiation does not.',
    relationships: 'This line carries warmth naturally. People come to you on it with what they cannot bring elsewhere.',
  },
  7: {
    money: 'Money on this number arrives in fewer, larger drops than most. Patience is the currency. Trying to force frequency on a 7-line backfires.',
    career: 'Deep work, research, and specialist sectors do well on this number. Hot sales-cycle work does not.',
    relationships: 'Personal conversations on this line have more silence in them — comfortable for some, awkward for others. You will know quickly which is which.',
  },
  8: {
    money: 'This number behaves well around larger amounts and equity-style wealth. Small transactional money on it can feel heavier than it needs to.',
    career: 'Ownership work, authority work, sectors where the buck stops with you — this number carries them well. Routine support work less so.',
    relationships: 'You read as commanding on this line. Tender conversations sometimes need a different channel.',
  },
  9: {
    money: 'Money on this number flows when your work touches many people at once. Narrow audiences underperform what the line is capable of.',
    career: 'Sectors with reach — media, art, large-scale service — do disproportionately well on this number. Highly specialist work less so.',
    relationships: 'You give widely on this line. The work is going deeper with fewer people, not staying widely available to everyone.',
  },
};

function decodedFor(a: MobileNumberAnalysis): string {
  return `Adding the 10 digits gives ${a.total}. Reducing that down: ${a.total} → ${a.vibration}. The last digit you actually dial most — ${a.lastDigit} — adds its own small weight on top of the overall ${a.vibration}-vibration. Together they describe how this number behaves in your hands every day.`;
}

function harmonyNarrativeFor(a: MobileNumberAnalysis): string {
  const friendlyList = a.friendlyDigits.join(', ');
  if (a.verdict === 'powerful') {
    return `Your day-to-day vibration runs at ${a.mulank} and your long arc runs at ${a.bhagyank}. This number's ${a.vibration} sits squarely inside the digits your life responds best to (${friendlyList}). That is why opportunities you would not expect tend to surface here.`;
  }
  if (a.verdict === 'supportive') {
    return `Your day-to-day vibration runs at ${a.mulank} and your long arc runs at ${a.bhagyank}. This number's ${a.vibration} sits inside your friendly range (${friendlyList}), so it nudges things in your direction quietly. Not a magnet — a tailwind.`;
  }
  if (a.verdict === 'neutral') {
    return `Your day-to-day vibration runs at ${a.mulank} and your long arc runs at ${a.bhagyank}. This number's ${a.vibration} is neither inside your friendly range (${friendlyList}) nor in your draining range — it is simply along for the ride.`;
  }
  return `Your day-to-day vibration runs at ${a.mulank} and your long arc runs at ${a.bhagyank}. This number's ${a.vibration} sits outside your friendly range (${friendlyList}), so it works against the grain a little. Nothing dramatic — but cumulative.`;
}

export function buildMobileNumerologyFallback(a: MobileNumberAnalysis): MobileNumerologyContent {
  const behaviour = VIBRATION_BEHAVIOUR[a.vibration] ?? VIBRATION_BEHAVIOUR[1]!;
  return {
    headline: VERDICT_HEADLINE[a.verdict]!(a),
    decoded: decodedFor(a),
    how_this_number_behaves: behaviour,
    harmony_with_you: harmonyNarrativeFor(a),
    verdict_and_next_step: VERDICT_NEXT_STEP[a.verdict]!,
    lucky_digits_to_keep_an_eye_on: a.friendlyDigits,
  };
}
