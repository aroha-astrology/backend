import { createSign, X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A throwaway Apple-shaped certificate chain (root -> intermediate -> leaf) built with the openssl
 * command line at test time, so no private key is ever committed. The intermediate carries Apple's
 * WWDR marker OID and the leaf Apple's App Store receipt-signing marker OID, which is what
 * verifyAppleJws looks for. `markers: false` builds a leaf without its marker.
 */
export interface TestChain {
  rootPem: string;
  /** Signs a JWS with the leaf key and the chain in x5c. */
  sign: (payload: unknown, opts?: { alg?: string; chain?: 'full' | 'noRoot' }) => string;
  /** Another chain's root, to prove a chain that doesn't end at the trusted root is refused. */
  cleanup: () => void;
}

const run = (cwd: string, args: string[]) =>
  execFileSync('openssl', args, { cwd, stdio: 'pipe' });

export function opensslAvailable(): boolean {
  try {
    execFileSync('openssl', ['version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function makeTestChain(opts: { markers?: boolean; days?: number } = {}): TestChain {
  const markers = opts.markers !== false;
  const days = String(opts.days ?? 3650);
  const dir = mkdtempSync(join(tmpdir(), 'apple-chain-'));
  const w = (name: string, text: string) => writeFileSync(join(dir, name), text);

  for (const name of ['root', 'inter', 'leaf']) {
    run(dir, ['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', `${name}.key`]);
  }
  w('root.ext', 'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign\n');
  w(
    'inter.ext',
    `basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign\n${markers ? '1.2.840.113635.100.6.2.1=ASN1:NULL\n' : ''}`,
  );
  w('leaf.ext', `basicConstraints=CA:FALSE\n${markers ? '1.2.840.113635.100.6.11.1=ASN1:NULL\n' : ''}`);

  run(dir, ['req', '-new', '-x509', '-key', 'root.key', '-subj', '/CN=Test Root', '-days', days, '-addext', 'basicConstraints=critical,CA:TRUE', '-out', 'root.pem']);
  run(dir, ['req', '-new', '-key', 'inter.key', '-subj', '/CN=Test Intermediate', '-out', 'inter.csr']);
  run(dir, ['x509', '-req', '-in', 'inter.csr', '-CA', 'root.pem', '-CAkey', 'root.key', '-CAcreateserial', '-days', days, '-extfile', 'inter.ext', '-out', 'inter.pem']);
  run(dir, ['req', '-new', '-key', 'leaf.key', '-subj', '/CN=Test Leaf', '-out', 'leaf.csr']);
  run(dir, ['x509', '-req', '-in', 'leaf.csr', '-CA', 'inter.pem', '-CAkey', 'inter.key', '-CAcreateserial', '-days', days, '-extfile', 'leaf.ext', '-out', 'leaf.pem']);

  const pem = (name: string) => readFileSync(join(dir, name), 'utf8');
  const der = (name: string) => new X509Certificate(pem(name)).raw.toString('base64');
  const leafKey = pem('leaf.key');
  const x5c = [der('leaf.pem'), der('inter.pem'), der('root.pem')];
  const rootPem = pem('root.pem');

  return {
    rootPem,
    sign: (payload, o = {}) => {
      const header = { alg: o.alg ?? 'ES256', x5c: o.chain === 'noRoot' ? x5c.slice(0, 2) : x5c };
      const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
      const signingInput = `${b64(header)}.${b64(payload)}`;
      const signature = createSign('sha256')
        .update(signingInput)
        .sign({ key: leafKey, dsaEncoding: 'ieee-p1363' });
      return `${signingInput}.${signature.toString('base64url')}`;
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
