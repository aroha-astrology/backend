import { refreshLapsedPlayPass } from './pass-play.service.js';
import { refreshLapsedRazorpayPass } from './pass-razorpay.service.js';

/**
 * A Pass that has just reached its end without a renewal notice: asks its store (Google Play,
 * then Razorpay for a web Pass) before treating the member as lapsed. True when the user has a
 * live Pass afterwards. Never throws. The App Store has no such on-demand check here (it needs
 * the App Store Server API key); its notifications keep that row in step.
 */
export async function refreshLapsedPass(userId: string, now?: Date): Promise<boolean> {
  if (await (now ? refreshLapsedPlayPass(userId, now) : refreshLapsedPlayPass(userId))) return true;
  return refreshLapsedRazorpayPass(userId, now);
}
