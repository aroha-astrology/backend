import { getAndroidPublisher, GOOGLE_PLAY_PACKAGE_NAME } from '../../config/google-play.js';

/** True if Google reports this purchase token as genuinely `purchased` (not canceled/pending). */
export async function verifyGooglePlayPurchase(params: {
  productId: string;
  purchaseToken: string;
}): Promise<boolean> {
  const client = getAndroidPublisher();
  const { data } = await client.purchases.products.get({
    packageName: GOOGLE_PLAY_PACKAGE_NAME,
    productId: params.productId,
    token: params.purchaseToken,
  });
  // purchaseState: 0 = purchased, 1 = canceled, 2 = pending.
  return data.purchaseState === 0;
}

/** Marks a consumable purchase as spent so the same product can be bought again. */
export async function consumeGooglePlayPurchase(params: {
  productId: string;
  purchaseToken: string;
}): Promise<void> {
  const client = getAndroidPublisher();
  await client.purchases.products.consume({
    packageName: GOOGLE_PLAY_PACKAGE_NAME,
    productId: params.productId,
    token: params.purchaseToken,
  });
}
