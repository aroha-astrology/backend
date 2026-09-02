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
    expect(followUp).toBe('Are you currently receiving any professional support for this?');
    expect(body).toBe('That craving often stems from pressure on your fourth house.');
  });

  it('keeps a closing question that is NOT a repeat of the suggestion', async () => {
    const out = await render(
      'Jupiter favours a move this spring. Are you weighing a specific offer?\nAsk next: When exactly does that window open?',
    );
    const { body, followUp } = splitFollowUp(out);
    expect(followUp).toBe('When exactly does that window open?');
    expect(body).toContain('Are you weighing a specific offer?');
  });

  it('promotes a closing prose question onto the suggestion line when there is no "Ask next:"', async () => {
    const out = await render('Marriage is well supported after March. Are you seeing someone now?');
    const { body, followUp } = splitFollowUp(out);
    expect(followUp).toBe('Are you seeing someone now?');
    expect(body).toBe('Marriage is well supported after March.');
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
      'The chart shows steady growth; the scale you are at sets the pace.\nAsk next: {{income}}',
    );
    const { followUp } = splitFollowUp(out);
    expect(followUp).toContain('Under ₹25,000 a month');
    expect(followUp).toContain('Prefer not to say');
    expect(followUp!.split('|')).toHaveLength(5);
    expect(out).not.toContain('{{income}}');
  });
});
