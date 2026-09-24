import { describe, expect, it, vi } from 'vitest';

// The reported bug, end to end through the direct-mode streamer: a reply whose
// closing question was ALSO repeated on the "Ask next:" line rendered the same
// question twice in one chat bubble. Root cause was stripUnitMarkers eating the
// "Ask next:" marker (it looks exactly like the short "Label:" openers that
// function exists to delete) before the marker test ever ran — so the
// suggestion was never recognised, never became a tappable chip, and simply
// landed in the body next to the prose copy of itself.

const state = vi.hoisted(() => ({ chunks: [] as string[] }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({
  stream: async function* () {
    // The `await` is only there because the real client's generator is genuinely
    // async and eslint's require-await rule holds this mock to the same shape.
    for (const chunk of state.chunks) yield await Promise.resolve(chunk);
  },
  generate: vi.fn(),
}));

const { streamDirectModeParagraph } = await import('../src/lib/swarm/agents/scholar.js');

/** Runs the streamer over `reply` (delivered as one chunk, as a fast model does) and
 *  returns the assembled message exactly as the client stores and renders it. */
async function render(reply: string): Promise<string> {
  state.chunks = [reply];
  let out = '';
  for await (const token of streamDirectModeParagraph(
    [{ role: 'user', content: 'hi' }],
    undefined,
  )) {
    out += token;
  }
  return out;
}

/** Mirrors the frontend's splitFollowUp / the server's own ASK_NEXT_RE. */
function splitFollowUp(content: string): { body: string; followUp: string | null } {
  const match = content.match(/\n *Ask next:\s*(.+?)\s*$/i);
  if (!match) return { body: content, followUp: null };
  return { body: content.slice(0, match.index).trimEnd(), followUp: match[1]! };
}

describe('direct-mode "Ask next:" handling', () => {
  it('keeps the suggestion on its own line so it renders as a chip, not body prose', async () => {
    const out = await render(
      'Your Saturn period rewards patience over speed.\nAsk next: What remedy helps most right now?',
    );
    const { body, followUp } = splitFollowUp(out);
    expect(followUp).toBe('What remedy helps most right now?');
    expect(body).toBe('Your Saturn period rewards patience over speed.');
    expect(body).not.toMatch(/ask next/i);
  });

  it('does not render the same question twice when the model asks it in prose and repeats it', async () => {
    const out = await render(
      'That craving often stems from pressure on your fourth house. Are you currently receiving any professional support for this?\nAsk next: Are you currently receiving any professional support for this?',
    );
    const { body, followUp } = splitFollowUp(out);
    // It is the astrologer's question, so it stays in the body for the user to answer —
    // as a chip, a tap would send that question back as if the user had asked it.
    expect(followUp).toBeNull();
    expect(body).toBe(
      'That craving often stems from pressure on your fourth house. Are you currently receiving any professional support for this?',
    );
  });

  it("moves the astrologer's own question off the chip line and into the body", async () => {
    // Reported live: tapping "What is your partner's name?" sent it as the user's message.
    const out = await render(
      "Today is a supportive day for opening up to your partner.\nAsk next: What is your partner's name?",
    );
    const { body, followUp } = splitFollowUp(out);
    expect(followUp).toBeNull();
    expect(body).toBe(
      "Today is a supportive day for opening up to your partner. What is your partner's name?",
    );
  });

  it('keeps user-voiced chips, including several on one line', async () => {
    const out = await render(
      'A productive day with steady progress.\nAsk next: Is today auspicious for a new task?| Should I focus on my current projects?',
    );
    const { body, followUp } = splitFollowUp(out);
    expect(followUp).toBe(
      'Is today auspicious for a new task? | Should I focus on my current projects?',
    );
    expect(body).toBe('A productive day with steady progress.');
  });

  it('keeps a closing question that is NOT a repeat of the suggestion', async () => {
    const out = await render(
      'Jupiter favours a move this spring. Are you weighing a specific offer?\nAsk next: When exactly does that window open?',
    );
    const { body, followUp } = splitFollowUp(out);
    expect(followUp).toBe('When exactly does that window open?');
    expect(body).toContain('Are you weighing a specific offer?');
  });

  it('leaves a closing prose question in the body instead of turning it into a chip', async () => {
    const out = await render('Marriage is well supported after March. Are you seeing someone now?');
    const { body, followUp } = splitFollowUp(out);
    expect(followUp).toBeNull();
    expect(body).toBe('Marriage is well supported after March. Are you seeing someone now?');
  });

  it('leaves a mid-reply question in the body, in order', async () => {
    const out = await render(
      'Money is tight this quarter. Is that already showing up? The pressure eases after June.',
    );
    expect(splitFollowUp(out).followUp).toBeNull();
    expect(out).toBe(
      'Money is tight this quarter. Is that already showing up? The pressure eases after June.',
    );
  });

  it('expands the income marker into the fixed tappable ranges', async () => {
    const out = await render(
      'The chart shows steady growth; knowing your monthly income range tells me how fast it moves.\nAsk next: {{income}}',
    );
    const { body, followUp } = splitFollowUp(out);
    expect(followUp).toContain('Under ₹25,000 a month');
    expect(followUp).toContain('Prefer not to say');
    expect(followUp!.split('|')).toHaveLength(5);
    expect(out).not.toContain('{{income}}');
    // The app's own question renders right above the chips, regardless of
    // whether — or how — the model phrased its own closing question.
    expect(body).toContain('Which range is your monthly income in?');
  });

  it("replaces the model's own closing question with the app-owned income question, without duplicating it", async () => {
    const out = await render(
      'Your finances are steadying. What is your rough monthly income?\nAsk next: {{income}}',
    );
    const { body, followUp } = splitFollowUp(out);
    expect(followUp).toContain('Under ₹25,000 a month');
    // Only the app's fixed question appears — the model's own phrasing of the
    // ask is dropped, not appended alongside it.
    const occurrences = body.split('income').length - 1;
    expect(body).toContain('Which range is your monthly income in?');
    expect(occurrences).toBe(1);
  });
});
