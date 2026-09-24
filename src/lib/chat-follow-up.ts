// =============================================================================
// Free follow-up detection
// =============================================================================
// scholar.ts's OUTPUT_STYLE asks the model to end a reply with an optional
// "Ask next: <question>" line, and the frontend already renders that as a
// tappable chip (splitFollowUp in ChatConversation.tsx) — but tapping it sent
// a normal, fully-charged message. The chip existed for months and every tap
// cost the full ₹8; the mechanism built to keep a conversation going was
// itself the reason it didn't.
//
// This makes that one tap free: when the incoming message is (a close match
// for) the follow-up the model itself just suggested, skip the charge.
// Verified against the SERVER'S OWN stored transcript, not a client-supplied
// flag — a client claiming "this is the free follow-up" would be trivially
// spoofable into free chat for anyone who reads the network tab.
//
// Narrowed since: only a tap that ANSWERS the astrologer's own question about
// the user (a multi-option "A | B | C" line — income range, timeframe, field
// of work) is free, because that turn feeds chat-fact-extraction.ts a durable
// user fact. A plain "Ask next: <question>" chip is just another paid
// question. The free tap itself is rationed to one per account per
// FREE_FOLLOW_UP_COOLDOWN_MS (users.last_free_follow_up_at, claimed atomically
// by claimFreeFollowUp in users.repo.ts) — so also at most once per session.
// =============================================================================

/** One free follow-up per account per 3 days. The frontend never re-derives
 * this — it reads `nextFreeFollowUpAt` off the user DTO. */
export const FREE_FOLLOW_UP_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

/** Mirrors ChatConversation.tsx's splitFollowUp regex exactly — same suggestion, same syntax. */
const ASK_NEXT_RE = /\n *Ask next:\s*(.+?)\s*$/i;

function extractFollowUp(content: string): string | null {
  const match = content.match(ASK_NEXT_RE);
  return match ? match[1]!.trim() : null;
}

/** Loose equality: trims, collapses whitespace, drops trailing punctuation, case-insensitive —
 * a real tap on the chip sends the exact suggested text verbatim, but normalizing this cheaply
 * absorbs whitespace-only client differences without opening the door to unrelated free chat
 * (still requires a near-exact match, not just "any question").
 * Exported because chat-income.ts matches a tapped income range the same way, and two
 * near-identical normalizers would drift apart the first time either is tweaked. */
export function normalizeFollowUp(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[?!.]+$/, '');
}

/**
 * True when `incomingMessage` is one of the tappable ANSWERS the assistant's
 * last turn in `history` offered to its own question about the user (a
 * " | "-separated line with at least two options). A single-option line is a
 * suggested follow-up question, not an answer — tapping it shares nothing
 * about the user — so it is never free. Eligibility only: whether the account
 * still has its free tap left is claimFreeFollowUp's call. `history` is the STORED transcript (loaded from
 * chat_sessions, never client-supplied) — see chatRoute in astro.routes.ts.
 */
export function isFreeFollowUp(
  incomingMessage: string,
  history: { role: 'user' | 'assistant'; content: string }[],
): boolean {
  const lastAssistantTurn = [...history].reverse().find((t) => t.role === 'assistant');
  if (!lastAssistantTurn) return false;

  const suggested = extractFollowUp(lastAssistantTurn.content);
  if (!suggested) return false;

  // One "Ask next:" line can offer several tappable answers separated by " | "
  // (see scholar.ts's OUTPUT_STYLE and chat-income.ts's range options) — the
  // user still taps exactly one of them, so any of them is the free follow-up.
  const options = suggested
    .split('|')
    .map((option) => option.trim())
    .filter(Boolean);
  if (options.length < 2) return false;
  return options.some((option) => normalizeFollowUp(option) === normalizeFollowUp(incomingMessage));
}
