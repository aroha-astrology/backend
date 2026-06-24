// Deterministic fallback content for Name Correction reports.
// Used when the AI call fails or returns malformed JSON — guarantees a
// complete, on-theme report so the user never sees an empty card.
//
// Indexed by primary target number (1-9). Pros/cons phrasings are written
// to honour the project's text rules: no planets/dashas in narrative, no
// invented project names, sector-only references to work, and no banned
// words (PRICE/DISCOUNT/PROBLEM/HURRY/BUY NOW/BASIC/STANDARD).

import type { NameAlignmentResult } from '@aroha-astrology/astro-engine';

export interface NameCorrectionContent {
  headline: string;
  what_your_name_carries: {
    money: string;
    relationships: string;
    energy_and_health: string;
    what_it_blocks: string;
  };
  your_target_number: {
    number: number;
    why_it_suits_you: string;
  };
  suggestions: NameSuggestion[];
  implementation_playbook: {
    legal: string;
    signature_and_branding: string;
    social_and_email: string;
  };
  lucky_in_daily_life: {
    dates: number[];
    amounts: string;
    addresses_and_vehicles: string;
  };
}

export interface NameSuggestion {
  variant: string;
  chaldean: number;
  change: string;
  pros: string[];
  cons: string[];
  best_for: string;
}

const HEADLINE_BY_ALIGNMENT: Record<string, (n: NameAlignmentResult) => string> = {
  aligned: (n) =>
    `Your current name already vibrates at ${n.chaldean} — the same number your day-to-day life is asking for. The work now is to amplify, not change.`,
  partially_aligned: (n) =>
    `Your name vibrates at ${n.chaldean}, which carries some of the lift you need but not all of it. A small adjustment can move the needle without breaking who you are.`,
  misaligned: (n) =>
    `Your name vibrates at ${n.chaldean}, and the life you are actually living asks for ${n.targets[0]}. That gap shows up as small frictions you can feel even when you cannot name them.`,
};

const TARGET_DESC: Record<number, { headline: string; money: string; rel: string; health: string; blocks: string; whyTarget: string; best: string }> = {
  1: {
    headline: 'a number that opens doors, fast',
    money: 'Income tends to arrive in bursts tied to your visibility — when you are seen, the work follows. Quiet seasons feel disproportionately quiet because money tracks momentum more than effort.',
    rel: 'You are wired to lead the dance in close relationships, and you read most strongly to others as confident. The work is letting the people closest to you in on the parts that are still figuring it out.',
    health: 'Your energy comes in waves and crashes hard when you push past the wave. Two anchors a day — one in the morning, one before sleep — keep the cycle steady.',
    blocks: 'You sometimes shrink the size of an ask because you do not want to look like you are reaching. The version of you that asks bigger gets bigger answers.',
    whyTarget: 'Your day-to-day vibration responds to clear direction and visible authorship. A name that lands on this number puts your signature on every room you walk into.',
    best: 'visibility + leadership',
  },
  2: {
    headline: 'a number that softens edges',
    money: 'Income flows best through partnership — co-founders, collaborators, the right second voice in a deal. Going fully solo on money tends to cost you more than you save.',
    rel: 'You are at your most magnetic when you are mirroring another person well. The friction shows up when you forget that mirroring is a choice, not a duty.',
    health: 'Your nervous system is tuned to other people\'s weather. Two solo hours a day — morning or evening, your pick — keep you from absorbing everyone else\'s mood.',
    blocks: 'You sometimes wait too long to name what you actually want, hoping the room will guess. It will not. Saying the small thing early prevents the big breakdown later.',
    whyTarget: 'Your inner pull is toward harmony, and a name on this number gives every relationship — money, work, romance — a slightly softer landing.',
    best: 'partnerships + diplomacy',
  },
  3: {
    headline: 'a number that puts language on your side',
    money: 'You earn best when you are speaking, teaching, or writing about what you know. Sectors that pay for your sentences pay more than sectors that pay only for your hands.',
    rel: 'You attract through expression — humour, story, the way you frame things. The flip side: people sometimes hear your performance and miss your sincerity. Pause more.',
    health: 'You burn out through your throat and your gut. Hydration and one screen-free hour before sleep matter more than the next supplement.',
    blocks: 'You sometimes spread your gift across too many surfaces and none of them get the full version of you. Three threads, not thirty.',
    whyTarget: 'Your strongest channel is voice and expression, and a name on this number sharpens it into a signature people remember.',
    best: 'expression + visibility',
  },
  4: {
    headline: 'a number that builds slowly and never gives back',
    money: 'Your wealth compounds through structure — fixed payments, layered savings, real things you can point to. Get-rich-fast paths drain you faster than they pay.',
    rel: 'You show love through reliability. Some people read that as cold until they need you, and then they read it as everything. Spend the small affection currency, not just the big one.',
    health: 'Your body responds to routine more than novelty. Sleep window first, food window second, movement window third — in that order.',
    blocks: 'You sometimes wait for the right plan and end up never starting. A rough version moving is worth more than a perfect version waiting.',
    whyTarget: 'Your day-to-day vibration is built for endurance and structure. A name on this number gives every long arc you build a stronger frame.',
    best: 'stability + long arcs',
  },
  5: {
    headline: 'a number that loves change',
    money: 'You make money through movement — new markets, new geographies, new roles. The income that stays sits on top of the income that came from saying yes to something new.',
    rel: 'You give freedom and you need freedom. Relationships that try to clip your wings tend to lose you, and you tend to feel guilty about that for years.',
    health: 'Your nervous system runs hotter than most. One thing that grounds you — walking, breath, water — every single day, no exceptions.',
    blocks: 'You sometimes leave the room before the breakthrough happens because the next room looks more interesting. Three more days, then decide.',
    whyTarget: 'You vibrate at the speed of change, and a name on this number turns motion into momentum instead of restlessness.',
    best: 'momentum + variety',
  },
  6: {
    headline: 'a number that gathers people in',
    money: 'You earn through care — service, hospitality, sectors where someone\'s comfort is the product. The trap is undercharging because the care feels personal. It is also the product.',
    rel: 'You are the person people come home to. Make sure someone is doing that for you too, or the well runs dry quietly.',
    health: 'You hold tension in your shoulders and your jaw. A 10-minute body scan before sleep is worth more than an hour at a gym.',
    blocks: 'You sometimes carry other people\'s problems past the point where help becomes harm. Setting the limit is not the opposite of love.',
    whyTarget: 'Your gravity is what holds your circle together. A name on this number gives that gravity a clearer container so you can give without losing yourself.',
    best: 'home + caring work',
  },
  7: {
    headline: 'a number that rewards depth',
    money: 'You make your best money one or two layers deeper than the rest of the field — the niche inside the niche. Generic offers underperform what you are actually capable of.',
    rel: 'You need solitude to stay yourself. Partners who can read that need without taking it personally are the ones who last.',
    health: 'Your body responds to silence. One unplugged hour a day — phone in another room — does more than most interventions.',
    blocks: 'You sometimes wait until the answer is perfect before you share it. Half a real answer earlier is worth more than a complete answer later.',
    whyTarget: 'Your inner life is your wealth, and a name on this number protects that interiority while still letting your work reach the right rooms.',
    best: 'depth + research',
  },
  8: {
    headline: 'a number that asks for ownership',
    money: 'You are wired to build, not to clock in. Equity, ownership, royalties — the wealth you build that does not need you in the room is the wealth that compounds.',
    rel: 'You command respect more easily than affection. Naming what you want from people you love is harder than naming what you want from people you work with. Do it anyway.',
    health: 'You carry stress in your spine and your stomach. Heavy days need heavy recovery — sleep, water, and one slow movement practice.',
    blocks: 'You sometimes mistake control for safety. The thing you cannot delegate is the thing keeping you small.',
    whyTarget: 'Your destiny vibration is built for scale. A name on this number gives that scale a steadier ladder up.',
    best: 'wealth + authority',
  },
  9: {
    headline: 'a number that finishes things',
    money: 'You earn most when your work touches many lives at once — service at scale, art that travels, sectors with reach. Narrow work for narrow audiences underpays you.',
    rel: 'You love widely and sometimes diffusely. The work is going deeper with fewer people, not wider with everyone.',
    health: 'You absorb the room\'s emotion and call it your own. Boundaries are not the opposite of generosity. They are how generosity stays sustainable.',
    blocks: 'You sometimes hold on to a chapter past its closing because you do not want to admit the next one. Endings are how new beginnings start.',
    whyTarget: 'Your soul carries a wide signal, and a name on this number tunes that signal so it reaches more of the people it was meant for.',
    best: 'reach + completion',
  },
};

function suggestionsFor(targets: number[]): NameSuggestion[] {
  // 5 deterministic prefix-suffix templates per target — used only as a last
  // resort when the AI did not return enough usable variants.
  const templates: Array<{ variant: string; change: string; chaldean: number; best_for: string }> = [];
  const t1 = targets[0];
  const t2 = targets[1] ?? t1;
  // We do NOT have the user's source name here — caller should mix these with
  // analyzeNameNumerology-tested variants. These act purely as last-resort
  // empty placeholders so the page never blows up.
  for (let i = 0; i < 5; i++) {
    const target = i < 3 ? t1 : t2;
    templates.push({
      variant: `Variant ${i + 1}`,
      change: 'a small spelling adjustment your name will accept naturally',
      chaldean: target,
      best_for: TARGET_DESC[target]?.best ?? 'overall lift',
    });
  }
  return templates.map((t) => ({
    variant: t.variant,
    chaldean: t.chaldean,
    change: t.change,
    pros: [
      'Lands the name on a number that matches the rhythm your day-to-day life is already asking for, so daily friction drops without changing who you are.',
      'Keeps every signature, email, and introduction you already use mostly intact — adoption effort is small and the upside compounds quietly.',
      'Sounds natural when said out loud in your sector — readable on a first introduction, easy to spell back, no friction in meetings.',
    ],
    cons: [
      'The new spelling is a small departure from how close people already write you. Expect a couple of months of gentle corrections.',
      'On forms tied to government records (PAN, Aadhaar), the unedited spelling will continue to be the legal one — keep the new spelling for the soft surface of life.',
    ],
    best_for: t.best_for,
  }));
}

export function buildNameCorrectionFallback(alignment: NameAlignmentResult): NameCorrectionContent {
  const targetDesc = TARGET_DESC[alignment.targets[0]] ?? TARGET_DESC[1]!;
  return {
    headline: HEADLINE_BY_ALIGNMENT[alignment.alignment]!(alignment),
    what_your_name_carries: {
      money: targetDesc.money,
      relationships: targetDesc.rel,
      energy_and_health: targetDesc.health,
      what_it_blocks: targetDesc.blocks,
    },
    your_target_number: {
      number: alignment.targets[0],
      why_it_suits_you: targetDesc.whyTarget,
    },
    suggestions: suggestionsFor(alignment.targets),
    implementation_playbook: {
      legal: 'Keep your legal name as it is on government records (PAN, Aadhaar, passport). The corrected spelling lives on the social surface of life — the part you actually live in.',
      signature_and_branding: 'Start using the corrected spelling on your signature, email signature line, LinkedIn header, and business cards within the first month. The signature carries the most weight.',
      social_and_email: 'Update WhatsApp display name, Instagram handle if possible, and the name field on the email accounts you actually use. Give close circle a heads-up so the change feels like an invitation, not a surprise.',
    },
    lucky_in_daily_life: {
      dates: [alignment.targets[0], alignment.targets[0] + 9, alignment.targets[0] + 18].filter((d) => d <= 31),
      amounts: 'Round payouts and meaningful gifts to amounts that reduce to your target number — small, repeating, intentional.',
      addresses_and_vehicles: 'Where you have a choice — apartment number, vehicle plate, office desk — favour numbers that reduce to one of your friendly digits.',
    },
  };
}
