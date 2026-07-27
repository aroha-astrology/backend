import { describe, it, expect } from 'vitest';
import { buildObserveMessages, parseObserveResponse } from '../src/lib/llm/palm/observe';

const SAMPLE_OBSERVATION = {
  hand: 'right',
  imageQuality: { score: 8, lineVisibility: 8, lighting: 7, focus: 9, framing: 8 },
  handType: { element: 'Water', palmShape: 'rectangular', skinTexture: 'fine' },
  mounts: {
    jupiter: 'prominent',
    saturn: 'normal',
    apollo: 'normal',
    mercury: 'normal',
    venus: 'normal',
    luna: 'normal',
    marsUpper: 'normal',
    marsLower: 'normal',
    rahuPlain: 'normal',
  },
  majorLines: {
    lifeLine: {
      present: true,
      length: 'medium',
      depth: 'deep',
      polyline: [
        [0.42, 0.3],
        [0.35, 0.5],
        [0.4, 0.75],
      ],
    },
    heartLine: { present: true, length: 'long', depth: 'medium', endingPosition: 'jupiter' },
    headLine: { present: true, length: 'medium', depth: 'medium' },
    fateLine: { present: true, length: 'medium', depth: 'faint' },
  },
  minorLines: {
    marriageLines: { count: 1 },
    childrenLines: { count: 0 },
    intuitionLine: { present: false },
    travelLines: { count: 0 },
  },
  thumb: { flexibility: 'normal', setAngle: 'medium' },
  fingerprints: [],
  specialMarkings: [],
};

describe('buildObserveMessages', () => {
  it('attaches one image_url content part per captured frame', () => {
    const messages = buildObserveMessages({
      hand: 'right',
      frames: [
        { slot: 'front', dataUrl: 'data:image/jpeg;base64,AAA' },
        { slot: 'percussion', dataUrl: 'data:image/jpeg;base64,BBB' },
      ],
    });
    const userMessage = messages.find((m) => m.role === 'user')!;
    expect(Array.isArray(userMessage.content)).toBe(true);
    const parts = userMessage.content as Array<{ type: string; image_url?: { url: string } }>;
    const imageParts = parts.filter((p) => p.type === 'image_url');
    expect(imageParts).toHaveLength(2);
    expect(imageParts.map((p) => p.image_url!.url)).toEqual([
      'data:image/jpeg;base64,AAA',
      'data:image/jpeg;base64,BBB',
    ]);
  });

  it('includes exactly one text part naming which hand is being observed', () => {
    const messages = buildObserveMessages({
      hand: 'left',
      frames: [{ slot: 'front', dataUrl: 'data:image/jpeg;base64,AAA' }],
    });
    const userMessage = messages.find((m) => m.role === 'user')!;
    const parts = userMessage.content as Array<{ type: string; text?: string }>;
    const textParts = parts.filter((p) => p.type === 'text');
    expect(textParts).toHaveLength(1);
    expect(textParts[0]!.text).toContain('left');
  });

  it('instructs pure measurement, no interpretation, in the system message', () => {
    const messages = buildObserveMessages({
      hand: 'right',
      frames: [{ slot: 'front', dataUrl: 'data:image/jpeg;base64,AAA' }],
    });
    const system = messages.find((m) => m.role === 'system')!;
    expect(typeof system.content).toBe('string');
    expect((system.content as string).toLowerCase()).toContain('measur');
  });
});

describe('parseObserveResponse', () => {
  it('parses a complete, well-formed observation', () => {
    const result = parseObserveResponse(JSON.stringify(SAMPLE_OBSERVATION));
    expect(result).not.toBeNull();
    expect(result!.mounts.jupiter).toBe('prominent');
    expect(result!.majorLines.heartLine.endingPosition).toBe('jupiter');
    expect(result!.imageQuality.score).toBe(8);
  });

  it('parses a line polyline as an array of normalized [x,y] points', () => {
    const result = parseObserveResponse(JSON.stringify(SAMPLE_OBSERVATION));
    expect(result!.majorLines.lifeLine.polyline).toEqual([
      [0.42, 0.3],
      [0.35, 0.5],
      [0.4, 0.75],
    ]);
  });

  it('drops a malformed polyline (non-numeric or out-of-range point) rather than failing the whole reading', () => {
    const bad = {
      ...SAMPLE_OBSERVATION,
      majorLines: {
        ...SAMPLE_OBSERVATION.majorLines,
        headLine: {
          present: true,
          length: 'medium',
          depth: 'medium',
          polyline: [
            [0.5, 'oops'],
            [1.5, 0.2],
          ],
        },
      },
    };
    const result = parseObserveResponse(JSON.stringify(bad));
    expect(result).not.toBeNull();
    expect(result!.majorLines.headLine.polyline).toBeUndefined();
  });

  it('strips markdown code fences before parsing', () => {
    const result = parseObserveResponse('```json\n' + JSON.stringify(SAMPLE_OBSERVATION) + '\n```');
    expect(result).not.toBeNull();
  });

  it('clamps an out-of-range imageQuality.score into 0-10', () => {
    const bad = {
      ...SAMPLE_OBSERVATION,
      imageQuality: { ...SAMPLE_OBSERVATION.imageQuality, score: 15 },
    };
    const result = parseObserveResponse(JSON.stringify(bad));
    expect(result!.imageQuality.score).toBe(10);
  });

  it('returns null on malformed JSON', () => {
    expect(parseObserveResponse('not json')).toBeNull();
  });

  it('returns null when the mounts block is missing entirely', () => {
    const { mounts: _mounts, ...withoutMounts } = SAMPLE_OBSERVATION;
    expect(parseObserveResponse(JSON.stringify(withoutMounts))).toBeNull();
  });

  it('returns null when majorLines is missing entirely', () => {
    const { majorLines: _majorLines, ...withoutLines } = SAMPLE_OBSERVATION;
    expect(parseObserveResponse(JSON.stringify(withoutLines))).toBeNull();
  });
});
