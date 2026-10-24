import { verify as verifySignature, X509Certificate } from 'node:crypto';
import { env } from '../../config/env.js';
import { Errors } from '../../lib/errors.js';

/**
 * Apple's signed App Store data (StoreKit 2 transactions, renewal info and App Store Server
 * Notifications V2), checked with no Apple SDK and no network call.
 *
 * Each is a JWS (ES256) whose header carries the certificate chain in `x5c`: leaf, Apple's
 * intermediate, Apple Root CA - G3. It is trusted only when
 *   - the last certificate IS Apple Root CA - G3 (pinned below, byte for byte),
 *   - every certificate is signed by the next one and is inside its validity dates,
 *   - the leaf carries Apple's App Store receipt-signing marker (OID 1.2.840.113635.100.6.11.1)
 *     and the intermediate Apple's WWDR marker (OID 1.2.840.113635.100.6.2.1),
 *   - and the JWS signature checks out with the leaf's key.
 * Revocation (OCSP) is not checked: the chain is Apple's own and short-lived.
 */

/** Apple Root CA - G3, from https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
 * (SHA-256 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79). */
export const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

/** DER of the OIDs Apple puts on its App Store signing certificates (tag 06 + length + body). */
const LEAF_MARKER = Buffer.from('060a2a864886f76364060b01', 'hex'); // 1.2.840.113635.100.6.11.1
const INTERMEDIATE_MARKER = Buffer.from('060a2a864886f76364060201', 'hex'); // 1.2.840.113635.100.6.2.1

export interface AppleJwsOptions {
  /** Trusted roots (PEM). Apple's G3 root unless a test passes its own. */
  roots?: string[];
  now?: Date;
}

function b64urlJson(part: string): unknown {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

/** Checks one JWS and returns its payload; throws 400 APP_STORE_SIGNATURE_INVALID otherwise. */
export function verifyAppleJws<T = Record<string, unknown>>(jws: string, opts: AppleJwsOptions = {}): T {
  const invalid = () => Errors.badRequest('APP_STORE_SIGNATURE_INVALID');
  const parts = jws.split('.');
  if (parts.length !== 3) throw invalid();
  let header: { alg?: string; x5c?: unknown };
  try {
    header = b64urlJson(parts[0]!) as typeof header;
  } catch {
    throw invalid();
  }
  if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length < 3) throw invalid();

  let chain: X509Certificate[];
  try {
    chain = header.x5c.map((c) => new X509Certificate(Buffer.from(String(c), 'base64')));
  } catch {
    throw invalid();
  }
  const now = opts.now ?? new Date();
  const roots = (opts.roots ?? [APPLE_ROOT_CA_G3_PEM]).map((pem) => new X509Certificate(pem));
  const top = chain[chain.length - 1]!;
  if (!roots.some((r) => r.raw.equals(top.raw))) throw invalid();
  for (let i = 0; i < chain.length; i++) {
    const cert = chain[i]!;
    if (now < new Date(cert.validFrom) || now > new Date(cert.validTo)) throw invalid();
    const issuer = chain[i + 1] ?? cert;
    if (!cert.checkIssued(issuer) || !cert.verify(issuer.publicKey)) throw invalid();
  }
  if (!chain[0]!.raw.includes(LEAF_MARKER) || !chain[1]!.raw.includes(INTERMEDIATE_MARKER)) throw invalid();

  const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = Buffer.from(parts[2]!, 'base64url');
  const ok = verifySignature(
    'sha256',
    signed,
    { key: chain[0]!.publicKey, dsaEncoding: 'ieee-p1363' },
    signature,
  );
  if (!ok) throw invalid();
  try {
    return b64urlJson(parts[1]!) as T;
  } catch {
    throw invalid();
  }
}

/** The fields of Apple's JWSTransactionDecodedPayload this code reads. Dates are ms since epoch. */
export interface AppleTransaction {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  /** 'Auto-Renewable Subscription' | 'Consumable' | ... */
  type: string;
  purchaseDate: number;
  expiresDate?: number;
  revocationDate?: number;
  /** The UUID the app passed at purchase: our user id. */
  appAccountToken?: string;
  environment: 'Production' | 'Sandbox' | string;
  /** Minor units x 10 (milli-units), with `currency`. */
  price?: number;
  currency?: string;
}

/** The fields of Apple's JWSRenewalInfoDecodedPayload this code reads. */
export interface AppleRenewalInfo {
  originalTransactionId: string;
  autoRenewStatus: 0 | 1;
  autoRenewProductId?: string;
  isInBillingRetryPeriod?: boolean;
  gracePeriodExpiresDate?: number;
}

function checkApp(bundleId: string, environment: string): void {
  if (bundleId !== env.APPLE_BUNDLE_ID) throw Errors.badRequest('APP_STORE_OTHER_APP');
  if (environment !== 'Production' && !(environment === 'Sandbox' && env.APPLE_ALLOW_SANDBOX))
    throw Errors.badRequest('APP_STORE_SANDBOX_REFUSED');
}

/** A signed transaction from the app (StoreKit 2 `jwsRepresentation`), checked for this app. */
export function verifyAppleTransaction(jws: string, opts: AppleJwsOptions = {}): AppleTransaction {
  const tx = verifyAppleJws<AppleTransaction>(jws, opts);
  checkApp(tx.bundleId, tx.environment);
  return tx;
}

export interface AppleNotification {
  notificationType: string;
  subtype?: string;
  notificationUUID: string;
  transaction: AppleTransaction | null;
  renewal: AppleRenewalInfo | null;
}

/** An App Store Server Notification V2 (`signedPayload`), with its inner transaction and renewal. */
export function verifyAppleNotification(signedPayload: string, opts: AppleJwsOptions = {}): AppleNotification {
  const n = verifyAppleJws<{
    notificationType: string;
    subtype?: string;
    notificationUUID: string;
    data?: {
      bundleId: string;
      environment: string;
      signedTransactionInfo?: string;
      signedRenewalInfo?: string;
    };
  }>(signedPayload, opts);
  if (!n.data) {
    return { notificationType: n.notificationType, subtype: n.subtype, notificationUUID: n.notificationUUID, transaction: null, renewal: null };
  }
  checkApp(n.data.bundleId, n.data.environment);
  return {
    notificationType: n.notificationType,
    subtype: n.subtype,
    notificationUUID: n.notificationUUID,
    transaction: n.data.signedTransactionInfo
      ? verifyAppleJws<AppleTransaction>(n.data.signedTransactionInfo, opts)
      : null,
    renewal: n.data.signedRenewalInfo
      ? verifyAppleJws<AppleRenewalInfo>(n.data.signedRenewalInfo, opts)
      : null,
  };
}
