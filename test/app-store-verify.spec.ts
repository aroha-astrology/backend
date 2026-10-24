import { afterAll, describe, expect, it } from 'vitest';
import { makeTestChain, opensslAvailable } from './helpers/apple-test-chain.js';
import {
  APPLE_ROOT_CA_G3_PEM,
  verifyAppleJws,
  verifyAppleNotification,
  verifyAppleTransaction,
} from '../src/modules/billing/app-store-verify.js';
import { X509Certificate, createHash } from 'node:crypto';

const haveOpenssl = opensslAvailable();
const good = haveOpenssl ? makeTestChain() : null;
const noMarkers = haveOpenssl ? makeTestChain({ markers: false }) : null;
const other = haveOpenssl ? makeTestChain() : null;
afterAll(() => [good, noMarkers, other].forEach((c) => c?.cleanup()));

const tx = {
  transactionId: '2000000000001',
  originalTransactionId: '2000000000000',
  bundleId: 'com.aroha.astrology',
  productId: 'aroha_pass_gold',
  type: 'Auto-Renewable Subscription',
  purchaseDate: 1_790_000_000_000,
  expiresDate: 1_792_600_000_000,
  appAccountToken: '11111111-1111-4111-8111-111111111111',
  environment: 'Production',
};

describe('the pinned Apple root', () => {
  it('is Apple Root CA - G3 (SHA-256 fingerprint from apple.com)', () => {
    const fp = createHash('sha256').update(new X509Certificate(APPLE_ROOT_CA_G3_PEM).raw).digest('hex');
    expect(fp.toUpperCase()).toBe(
      '63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179',
    );
  });
});

describe.skipIf(!haveOpenssl)('verifyAppleJws with a test chain', () => {
  const opts = (c: NonNullable<typeof good>) => ({ roots: [c.rootPem] });

  it('accepts a correctly signed JWS and returns its payload', () => {
    expect(verifyAppleJws(good!.sign(tx), opts(good!))).toMatchObject({ productId: 'aroha_pass_gold' });
  });

  it('refuses a chain that does not end at the trusted root', () => {
    expect(() => verifyAppleJws(other!.sign(tx), opts(good!))).toThrow('APP_STORE_SIGNATURE_INVALID');
    // and the real pinned Apple root refuses a test chain
    expect(() => verifyAppleJws(good!.sign(tx))).toThrow('APP_STORE_SIGNATURE_INVALID');
  });

  it('refuses a payload changed after signing', () => {
    const [h, , s] = good!.sign(tx).split('.');
    const forged = Buffer.from(JSON.stringify({ ...tx, productId: 'aroha_pass_platinum' })).toString('base64url');
    expect(() => verifyAppleJws(`${h}.${forged}.${s}`, opts(good!))).toThrow('APP_STORE_SIGNATURE_INVALID');
  });

  it('refuses a chain without Apple\'s marker OIDs', () => {
    expect(() => verifyAppleJws(noMarkers!.sign(tx), opts(noMarkers!))).toThrow('APP_STORE_SIGNATURE_INVALID');
  });

  it('refuses a short chain, another algorithm, and garbage', () => {
    expect(() => verifyAppleJws(good!.sign(tx, { chain: 'noRoot' }), opts(good!))).toThrow('APP_STORE_SIGNATURE_INVALID');
    expect(() => verifyAppleJws(good!.sign(tx, { alg: 'none' }), opts(good!))).toThrow('APP_STORE_SIGNATURE_INVALID');
    expect(() => verifyAppleJws('not.a.jws', opts(good!))).toThrow('APP_STORE_SIGNATURE_INVALID');
    expect(() => verifyAppleJws('x', opts(good!))).toThrow('APP_STORE_SIGNATURE_INVALID');
  });

  it('refuses an expired or not-yet-valid chain', () => {
    const jws = good!.sign(tx);
    expect(() => verifyAppleJws(jws, { ...opts(good!), now: new Date('2100-01-01') })).toThrow('APP_STORE_SIGNATURE_INVALID');
    expect(() => verifyAppleJws(jws, { ...opts(good!), now: new Date('2001-01-01') })).toThrow('APP_STORE_SIGNATURE_INVALID');
  });

  it('a transaction for another app is refused, and so is the sandbox when it is switched off', () => {
    expect(verifyAppleTransaction(good!.sign(tx), opts(good!)).productId).toBe('aroha_pass_gold');
    expect(() => verifyAppleTransaction(good!.sign({ ...tx, bundleId: 'com.other.app' }), opts(good!))).toThrow('APP_STORE_OTHER_APP');
    // APPLE_ALLOW_SANDBOX defaults to true, so a Sandbox transaction passes
    expect(verifyAppleTransaction(good!.sign({ ...tx, environment: 'Sandbox' }), opts(good!)).environment).toBe('Sandbox');
    expect(() => verifyAppleTransaction(good!.sign({ ...tx, environment: 'Xcode' }), opts(good!))).toThrow('APP_STORE_SANDBOX_REFUSED');
  });

  it('opens a notification with its nested transaction and renewal info', () => {
    const payload = {
      notificationType: 'DID_RENEW',
      notificationUUID: 'n-1',
      data: {
        bundleId: tx.bundleId,
        environment: 'Production',
        signedTransactionInfo: good!.sign(tx),
        signedRenewalInfo: good!.sign({ originalTransactionId: tx.originalTransactionId, autoRenewStatus: 1 }),
      },
    };
    const n = verifyAppleNotification(good!.sign(payload), opts(good!));
    expect(n.notificationType).toBe('DID_RENEW');
    expect(n.transaction?.productId).toBe('aroha_pass_gold');
    expect(n.renewal?.autoRenewStatus).toBe(1);
  });

  it('refuses a notification whose inner transaction is signed by someone else', () => {
    const payload = {
      notificationType: 'DID_RENEW',
      notificationUUID: 'n-2',
      data: { bundleId: tx.bundleId, environment: 'Production', signedTransactionInfo: other!.sign(tx) },
    };
    expect(() => verifyAppleNotification(good!.sign(payload), opts(good!))).toThrow('APP_STORE_SIGNATURE_INVALID');
  });
});
