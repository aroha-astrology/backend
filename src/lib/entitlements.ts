/**
 * Entitlements — what a user has paid for beyond one-off wallet charges.
 *
 * `hasPass()` is the single check every "free with Aroha Pass" feature calls,
 * wired in from day one so those features never need touching again when the
 * Pass itself ships. Until then it always answers false: nobody has a Pass,
 * so every such feature charges its normal wallet price.
 */
export async function hasPass(_userId: string): Promise<boolean> {
  return false;
}
