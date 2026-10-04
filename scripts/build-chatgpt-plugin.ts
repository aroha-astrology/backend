/**
 * Checks the ChatGPT plugin package (chatgpt-plugin/) against OpenAI's
 * submission rules and writes the ZIP to upload:
 *
 *   npx tsx scripts/build-chatgpt-plugin.ts --demo-url https://youtu.be/...
 *   npx tsx scripts/build-chatgpt-plugin.ts --draft
 *
 * The rules are the ones in OpenAI's "Plugin submission errors" reference
 * (listing limits, images, skills, review cases). Anything that would be
 * rejected at upload or at "Submit for review" fails here first.
 *
 * --demo-url  The reviewer-accessible recording of the test cases. Required
 *             for the ZIP you submit; written into the packaged manifest.
 * --draft     Build without a demo recording, to upload and see the portal's
 *             own findings early. Not submittable.
 *
 * Output: chatgpt-plugin/dist/aroha-astrology-plugin-<version>.zip
 * SUBMISSION.md and dist/ are left out of the ZIP.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

const ROOT = join(process.cwd(), 'chatgpt-plugin');
const EXCLUDED = new Set(['SUBMISSION.md', 'dist']);
const CATEGORIES = [
  'Productivity',
  'Creativity',
  'Developer Tools',
  'Business & Operations',
  'Data & Analytics',
  'Communication',
  'Education & Research',
  'Security',
  'Finance',
  'Healthcare',
  'Travel',
  'Entertainment',
  'Other',
];
const MIB = 1024 * 1024;

const args = process.argv.slice(2);
const draft = args.includes('--draft');
const demoUrl = args.includes('--demo-url') ? args[args.indexOf('--demo-url') + 1] : undefined;

const problems: string[] = [];
const fail = (message: string): void => {
  problems.push(message);
};

type Json = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const oneLine = (s: string) => !/[\r\n]/.test(s);
const isHttps = (s: string) => {
  try {
    const url = new URL(s);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
};

function text(label: string, value: unknown, max: number, opts: { line?: boolean } = {}): string {
  const s = str(value);
  if (!s.trim()) fail(`${label}: required`);
  else if (s.length > max) fail(`${label}: ${s.length} characters, limit is ${max}`);
  else if (opts.line && !oneLine(s)) fail(`${label}: must be a single line`);
  return s;
}

/** WCAG contrast ratio between two #RRGGBB colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function checkImage(label: string, path: unknown, required: boolean): void {
  const p = str(path);
  if (!p) {
    if (required) fail(`${label}: required`);
    return;
  }
  if (!p.startsWith('./')) return fail(`${label}: path must start with ./`);
  const file = join(ROOT, p);
  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch {
    return fail(`${label}: file ${p} is missing`);
  }
  if (bytes.length > 5 * MIB) fail(`${label}: larger than 5 MiB`);
  if (!p.endsWith('.png')) return fail(`${label}: this script only checks .png images`);
  if (bytes.readUInt32BE(0) !== 0x89504e47) return fail(`${label}: not a PNG file`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== height) fail(`${label}: must be square, is ${width}x${height}`);
  if (width < 48 || width > 4096) fail(`${label}: side must be 48 to 4096 px, is ${width}`);
}

/** Tool names the server really exposes, read from the source. */
function serverToolNames(): Set<string> {
  const dir = join(process.cwd(), 'src', 'modules', 'mcp', 'tools');
  const names = new Set<string>();
  for (const file of readdirSync(dir)) {
    for (const match of readFileSync(join(dir, file), 'utf8').matchAll(/^\s+name: '([a-z_]+)',$/gm)) {
      names.add(match[1]!);
    }
  }
  return names;
}

function checkSkills(pluginName: string): string[] {
  const skillsDir = join(ROOT, 'skills');
  const names: string[] = [];
  for (const entry of readdirSync(skillsDir)) {
    const file = join(skillsDir, entry, 'SKILL.md');
    let md: string;
    try {
      md = readFileSync(file, 'utf8');
    } catch {
      fail(`skill ${entry}: SKILL.md is missing`);
      continue;
    }
    const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(md);
    if (!front) {
      fail(`skill ${entry}: SKILL.md must start with front matter between --- lines`);
      continue;
    }
    const field = (key: string) => new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(front[1]!)?.[1]?.trim() ?? '';
    const name = field('name');
    const description = field('description');
    if (name !== entry) fail(`skill ${entry}: name "${name}" must match its folder`);
    if (!description) fail(`skill ${entry}: description is required`);
    if (description.length > 1024) fail(`skill ${entry}: description over 1024 characters`);
    if (!front[2]!.trim()) fail(`skill ${entry}: instructions are empty`);
    if (`${pluginName}:${name}`.length > 64) fail(`skill ${entry}: "${pluginName}:${name}" is over 64 characters`);
    if (names.includes(name)) fail(`skill ${entry}: duplicate name`);
    names.push(name);
  }
  if (names.length === 0) fail('skills: at least one skill is expected');
  return names;
}

function validate(manifest: Json): void {
  const name = text('name', manifest.name, 64);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) fail('name: use lowercase letters, numbers and single hyphens');
  if (!/^\d+\.\d+\.\d+$/.test(str(manifest.version))) fail('version: must be a semantic version like 1.0.0');
  text('description', manifest.description, 1024);

  const author = (manifest.author ?? {}) as Json;
  text('author.name', author.name, 120);
  if (author.url && !isHttps(str(author.url))) fail('author.url: must be https');

  const openai = ((manifest.extensions ?? {}) as Json)['com.openai'] as Json | undefined;
  if (!openai) return fail('extensions.com.openai: missing');
  for (const banned of ['apps', 'hooks']) {
    if (banned in openai) fail(`extensions.com.openai.${banned}: packages with ${banned} cannot be submitted`);
  }

  const ui = (openai.interface ?? {}) as Json;
  const displayName = text('displayName', ui.displayName, 30, { line: true });
  if (/\b(MCP|Plugin)\b/i.test(displayName)) fail('displayName: must not contain "MCP" or "Plugin"');
  text('shortDescription', ui.shortDescription, 30, { line: true });
  text('longDescription', ui.longDescription, 4000);
  text('developerName', ui.developerName, 80, { line: true });
  if (!CATEGORIES.includes(str(ui.category))) fail(`category: must be one of ${CATEGORIES.join(', ')}`);

  // OpenAI: listings must not advertise pricing, subscriptions, trials or discounts.
  const listing = [ui.displayName, ui.shortDescription, ui.longDescription, manifest.description].map(str).join('\n');
  const money = /₹|\$\d|\b(price|pricing|priced|free trial|discount|subscription|subscribe|upgrade|credits?)\b/i.exec(listing);
  if (money) fail(`listing text mentions "${money[0]}": pricing and plans are not allowed in a listing`);

  const capabilities = (ui.capabilities ?? []) as unknown[];
  if (capabilities.length > 20) fail('capabilities: at most 20');
  capabilities.forEach((c, i) => text(`capabilities[${i}]`, c, 120, { line: true }));

  for (const key of ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL']) {
    const url = str(ui[key]);
    if (!isHttps(url) || url.length > 1024) fail(`${key}: required, https, at most 1024 characters`);
  }

  const prompts = (Array.isArray(ui.defaultPrompt) ? ui.defaultPrompt : [ui.defaultPrompt]).map(str);
  if (prompts.length > 3) fail('defaultPrompt: at most 3');
  prompts.forEach((p, i) => {
    text(`defaultPrompt[${i}]`, p, 128, { line: true });
    if (p.includes('@')) fail(`defaultPrompt[${i}]: must not contain an @mention`);
  });
  const normalised = prompts.map((p) => p.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase());
  if (new Set(normalised).size !== prompts.length) fail('defaultPrompt: prompts must be unique');

  const hex = /^#[0-9A-Fa-f]{6}$/;
  if (ui.brandColor) {
    if (!hex.test(str(ui.brandColor))) fail('brandColor: must be #RRGGBB');
    else if (contrast(str(ui.brandColor), '#FFFFFF') < 2) fail('brandColor: needs 2:1 contrast against white');
  }
  if (ui.brandColorDark) {
    if (!hex.test(str(ui.brandColorDark))) fail('brandColorDark: must be #RRGGBB');
    else if (contrast(str(ui.brandColorDark), '#212121') < 2) fail('brandColorDark: needs 2:1 contrast against #212121');
  }

  checkImage('logo', ui.logo, true);
  checkImage('composerIcon', ui.composerIcon, true);
  checkImage('logoDark', ui.logoDark, false);
  checkImage('composerIconDark', ui.composerIconDark, false);
  if (ui.screenshots) fail('screenshots: leave out (if added, OpenAI wants one 706 px wide image per starter prompt)');

  const skills = checkSkills(name);
  const onboarding = /^\.\/skills\/([^/]+)\/SKILL\.md$/.exec(str(openai.onboardingSkill));
  if (openai.onboardingSkill && (!onboarding || !skills.includes(onboarding[1]!))) {
    fail('onboardingSkill: must point at a packaged skill, e.g. ./skills/get-started/SKILL.md');
  }

  const review = (openai.review ?? {}) as Json;
  for (const banned of ['test_credentials', 'reviewer_instructions']) {
    if (banned in review) fail(`review.${banned}: not allowed in the ZIP, enter it in the dashboard`);
  }
  const cases = (review.test_cases ?? {}) as { positive?: Json[]; negative?: Json[] };
  const positive = cases.positive ?? [];
  const negative = cases.negative ?? [];
  if (positive.length !== 5) fail(`review.test_cases.positive: exactly 5 needed, found ${positive.length}`);
  if (negative.length !== 3) fail(`review.test_cases.negative: exactly 3 needed, found ${negative.length}`);
  const tools = serverToolNames();
  positive.forEach((c, i) => {
    text(`positive[${i}].description`, c.description, 4000);
    text(`positive[${i}].prompt`, c.prompt, 4000);
    text(`positive[${i}].expected_behavior`, c.expected_behavior, 4000);
    for (const tool of text(`positive[${i}].tools_triggered`, c.tools_triggered, 400).split(',')) {
      if (tool.trim() && !tools.has(tool.trim())) fail(`positive[${i}].tools_triggered: the server has no tool "${tool.trim()}"`);
    }
  });
  negative.forEach((c, i) => {
    text(`negative[${i}].description`, c.description, 4000);
    text(`negative[${i}].prompt`, c.prompt, 4000);
  });

  if (demoUrl) {
    if (!isHttps(demoUrl)) fail('--demo-url: must be an https link');
  } else if (!draft && !isHttps(str(review.demo_recording_url))) {
    fail('demo recording: pass --demo-url <https link>, or --draft to build without one');
  }

  const publication = (openai.publication ?? {}) as Json;
  text('publication.release_notes', publication.release_notes, 4000);

  const mcp = JSON.parse(readFileSync(join(ROOT, 'mcp.json'), 'utf8')) as { mcpServers?: Record<string, Json> };
  const servers = Object.values(mcp.mcpServers ?? {});
  if (servers.length !== 1) fail('mcp.json: exactly one server is expected');
  for (const server of servers) {
    if (!isHttps(str(server.url))) fail('mcp.json: server url must be https');
    if (server.type !== 'streamable-http') fail('mcp.json: server type must be streamable-http');
  }
}

/** Every file to pack, as forward-slash paths relative to the plugin root. */
function packagedFiles(dir = ROOT): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (dir === ROOT && EXCLUDED.has(entry)) return [];
    if (statSync(full).isDirectory()) return packagedFiles(full);
    return [relative(ROOT, full).split('\\').join('/')];
  });
}

/** A plain ZIP writer: deflate, no directory entries, UTF-8 names. Enough for a few dozen small files. */
function zip(files: { path: string; data: Buffer }[]): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.path, 'utf8');
    const packed = deflateRawSync(file.data);
    const crc = crc32(file.data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt32LE(0x00210000, 10); // time 00:00, date 1980-01-01: a stable ZIP for the same input
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(file.data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, packed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(0x00210000, 12);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(file.data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += 30 + name.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'plugin.json'), 'utf8')) as Json;
validate(manifest);

if (problems.length > 0) {
  console.error(`The package is not ready (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

if (demoUrl) {
  const review = ((manifest.extensions as Json)['com.openai'] as Json).review as Json;
  review.demo_recording_url = demoUrl;
}

// Text goes in with LF line ends whatever the checkout used, so a ZIP built on
// Windows is byte-for-byte the one built on Linux.
const isText = (path: string) => /\.(md|json|ya?ml|txt)$/.test(path);
const files = packagedFiles().map((path) => ({
  path,
  data:
    path === 'plugin.json'
      ? Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
      : isText(path)
        ? Buffer.from(readFileSync(join(ROOT, path), 'utf8').replace(/\r\n/g, '\n'))
        : readFileSync(join(ROOT, path)),
}));
const out = join(ROOT, 'dist');
mkdirSync(out, { recursive: true });
const target = join(out, `${str(manifest.name)}-plugin-${str(manifest.version)}${draft ? '-draft' : ''}.zip`);
writeFileSync(target, zip(files));

console.log(`Checked: listing, images, ${files.filter((f) => f.path.endsWith('SKILL.md')).length} skills, 5 + 3 review cases.`);
console.log(`Wrote ${relative(process.cwd(), target)} (${files.length} files).`);
if (draft) console.log('Draft build: no demo recording. Rebuild with --demo-url before submitting for review.');
