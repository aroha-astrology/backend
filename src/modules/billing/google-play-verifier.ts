import { getAndroidPublisher, GOOGLE_PLAY_PACKAGE_NAME } from '../../config/google-play.js';

/** True if Google reports this purchase token as genuinely `purchased` (not canceled/pending). */
export async function verifyGooglePlayPurchase(params: {
  productId: string;
  purchaseToken: string;
}): Promise<boolean> {
  const purchase = await fetchGooglePlayPurchase(params);
  // purchaseState: 0 = purchased, 1 = canceled, 2 = pending.
  return purchase.purchaseState === 0;
}

/**
 * Fetches a purchase's full state from Google, including `obfuscatedExternalAccountId` —
 * the internal user id the client passed via `setObfuscatedAccountId` when launching the
 * purchase (PlayBillingPlugin.purchaseProduct). A Real-time Developer Notification only
 * carries the purchase token + product id, not who bought it, so the RTDN webhook
 * (billing.service.ts's reconcileGooglePlayNotification) calls this to find out.
 * Purchases made before that field existed on the client will come back with it unset.
 */
export async function fetchGooglePlayPurchase(params: {
  productId: string;
  purchaseToken: string;
}): Promise<{
  purchaseState: number | null | undefined;
  obfuscatedExternalAccountId: string | null;
}> {
  const client = getAndroidPublisher();
  const { data } = await client.purchases.products.get({
    packageName: GOOGLE_PLAY_PACKAGE_NAME,
    productId: params.productId,
    token: params.purchaseToken,
  });
  return {
    purchaseState: data.purchaseState,
    obfuscatedExternalAccountId: data.obfuscatedExternalAccountId ?? null,
  };
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
