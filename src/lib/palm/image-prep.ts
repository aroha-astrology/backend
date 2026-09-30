// =============================================================================
// Palm photo preparation (sharp)
// =============================================================================
// Two jobs, both measured on real traces before they were adopted (2026-09-30):
//
// 1. Enhance before the vision model sees the photo. Contrast-normalised and
//    lightly sharpened input raised gpt-6-astra's own per-line confidence and
//    made repeat traces of the same palm land within ~0.1-0.4% of the frame of
//    each other (vs ~1-2% on the raw photo).
//
// 2. One contact sheet per hand. The Omnirush ask endpoint takes ONE image, and
//    a hand has up to four captured angles. Panel A (the front photo, the one
//    the lines are traced on and drawn over) keeps its full size on the left;
//    the other angles are stacked in a half-width column on the right, each
//    labelled. Traces made on the sheet agreed with traces made on the front
//    photo alone to within ~0.5% of the frame — the extra panels cost nothing
//    in tracing accuracy. The sheet's geometry is returned so coordinates can
//    be mapped back onto panel A exactly.
// =============================================================================

import sharp, { type OverlayOptions, type OutputInfo } from 'sharp';

/** Long edge the front panel is sent at — the capture wizard already downscales to 1600. */
const FRONT_LONG_EDGE = 1600;
const LABEL_HEIGHT = 56;

export interface SheetPanel {
  label: string;
  bytes: Buffer;
}

export interface ContactSheet {
  jpeg: Buffer;
  /** Whole-sheet size in pixels. */
  width: number;
  height: number;
  /** Panel A (the front photo) occupies [0, frontWidth) x [0, height) of the sheet. */
  frontWidth: number;
}

/** Enhanced, upright (EXIF-rotated) front photo, long edge capped at FRONT_LONG_EDGE. */
async function enhance(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes)
    .rotate()
    .resize({
      width: FRONT_LONG_EDGE,
      height: FRONT_LONG_EDGE,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .normalise()
    .linear(1.2, -20)
    .sharpen({ sigma: 1 })
    .jpeg({ quality: 90 })
    .toBuffer();
}

function labelSvg(text: string, width: number): Buffer {
  const safe = text.replace(/[<>&"']/g, '');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${LABEL_HEIGHT}">` +
      `<rect width="${width}" height="${LABEL_HEIGHT}" fill="#000" fill-opacity="0.65"/>` +
      `<text x="14" y="39" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#fff">${safe}</text>` +
      `</svg>`,
  );
}

/**
 * Builds the sheet: `front` as panel A on the left at full size, `others` stacked in a column on
 * the right (half panel A's width), every panel labelled with its letter and view. With no
 * `others` the sheet is just the labelled, enhanced front photo.
 */
export async function buildContactSheet(
  front: SheetPanel,
  others: SheetPanel[],
): Promise<ContactSheet> {
  const frontJpeg = await enhance(front.bytes);
  const meta = await sharp(frontJpeg).metadata();
  const frontWidth = meta.width ?? FRONT_LONG_EDGE;
  const height = meta.height ?? FRONT_LONG_EDGE;
  const colWidth = others.length > 0 ? Math.round(frontWidth / 2) : 0;
  const cellHeight = others.length > 0 ? Math.floor(height / others.length) : 0;

  const layers: OverlayOptions[] = [
    { input: frontJpeg, left: 0, top: 0 },
    { input: labelSvg(`A  ${front.label}`, frontWidth), left: 0, top: height - LABEL_HEIGHT },
  ];
  for (const [i, panel] of others.entries()) {
    const cell = await sharp(panel.bytes)
      .rotate()
      .resize(colWidth, cellHeight, { fit: 'contain', background: '#202020' })
      .normalise()
      .jpeg({ quality: 88 })
      .toBuffer();
    const top = i * cellHeight;
    const letter = String.fromCharCode(66 + i); // B, C, D
    layers.push({ input: cell, left: frontWidth, top });
    layers.push({
      input: labelSvg(`${letter}  ${panel.label}`, colWidth),
      left: frontWidth,
      top: top + cellHeight - LABEL_HEIGHT,
    });
  }

  const width = frontWidth + colWidth;
  const jpeg = await sharp({ create: { width, height, channels: 3, background: '#202020' } })
    .composite(layers)
    .jpeg({ quality: 90 })
    .toBuffer();
  return { jpeg, width, height, frontWidth };
}

/**
 * Maps a point from whole-sheet 0-1 coordinates onto panel A's own 0-1 coordinates, or null
 * when the point lies outside panel A (a line traced on the wrong panel is dropped, not moved).
 */
export function sheetPointToFront(
  [x, y]: [number, number],
  sheet: Pick<ContactSheet, 'width' | 'frontWidth'>,
): [number, number] | null {
  const fx = (x * sheet.width) / sheet.frontWidth;
  if (fx < 0 || fx > 1 || y < 0 || y > 1) return null;
  return [fx, y];
}

export interface GrayImage {
  data: Uint8Array;
  width: number;
  height: number;
}

/** Working resolution for crease snapping: main creases dominate at this scale, skin texture doesn't. */
export const SNAP_LONG_EDGE = 800;

export interface SnapImages {
  /** Local-contrast-equalised: creases stand out as valleys regardless of lighting. */
  equalised: GrayImage;
  /** Plain greyscale: keeps the big skin-to-background step that equalising flattens, which is
   * how a trace running along the hand's outline is told apart from a real crease. */
  plain: GrayImage;
}

/**
 * The front photo as the two lightly blurred greyscale bitmaps the crease snap reads. Same EXIF
 * rotation as the enhanced copy the model saw, so 0-1 coordinates line up across all three.
 */
export async function loadSnapImages(bytes: Buffer): Promise<SnapImages> {
  const base = () =>
    sharp(bytes)
      .rotate()
      .resize({
        width: SNAP_LONG_EDGE,
        height: SNAP_LONG_EDGE,
        fit: 'inside',
        withoutEnlargement: false,
      })
      .greyscale();
  const [eq, plain] = await Promise.all([
    base()
      .clahe({ width: 48, height: 48, maxSlope: 3 })
      .blur(1.1)
      .raw()
      .toBuffer({ resolveWithObject: true }),
    base().blur(1.1).raw().toBuffer({ resolveWithObject: true }),
  ]);
  const toGray = ({ data, info }: { data: Buffer; info: OutputInfo }): GrayImage => ({
    data: new Uint8Array(data),
    width: info.width,
    height: info.height,
  });
  return { equalised: toGray(eq), plain: toGray(plain) };
}
