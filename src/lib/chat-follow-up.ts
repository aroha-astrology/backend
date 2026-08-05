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
// =============================================================================

/** Mirrors ChatConversation.tsx's splitFollowUp regex exactly — same suggestion, same syntax. */
const ASK_NEXT_RE = /\n *Ask next:\s*(.+?)\s*$/i;

function extractFollowUp(content: string): string | null {
  const match = content.match(ASK_NEXT_RE);
  return match ? match[1]!.trim() : null;
}

/** Loose equality: trims, collapses whitespace, drops trailing punctuation, case-insensitive —
 * a real tap on the chip sends the exact suggested text verbatim, but normalizing this cheaply
 * absorbs whitespace-only client differences without opening the door to unrelated free chat
 * (still requires a near-exact match, not just "any question"). */
function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[?!.]+$/, '');
}

/**
 * True when `incomingMessage` is the free follow-up the assistant's last turn
 * in `history` suggested. `history` is the STORED transcript (loaded from
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

  return normalize(suggested) === normalize(incomingMessage);
}
