/**
 * Fire-and-forget kick at /api/queue/drain so newly enqueued jobs start in
 * seconds instead of waiting up to a minute for the cron tick.
 *
 * Uses the same INTERNAL_PROCESS_KEY convention as the rest of the codebase
 * (reports/render, divisional-charts/auto-generate, etc). Failure is
 * intentionally non-fatal — the cron is the safety net.
 */
export async function kickDrain(request: Request): Promise<void> {
  const key = process.env.INTERNAL_PROCESS_KEY;
  if (!key) {
    console.warn('[queue/kick] INTERNAL_PROCESS_KEY not set — skipping kick');
    return;
  }
  try {
    const origin = new URL(request.url).origin;
    await fetch(`${origin}/api/queue/drain`, {
      method: 'POST',
      headers: { 'x-internal-key': key },
      keepalive: true,
    });
  } catch (e) {
    console.warn('[queue/kick] failed', e);
  }
}
