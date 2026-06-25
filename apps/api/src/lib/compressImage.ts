import sharp from 'sharp';

const MAX_DIM = 1500;
const JPEG_QUALITY = 82;

export interface ProcessedImage {
  data: string;
  mediaType: 'image/jpeg';
}

/**
 * Resize and re-encode a palm photo to JPEG.
 * Used by callers that only need a single color image.
 */
export async function compressImage(
  base64: string,
  _originalMediaType: string,
): Promise<ProcessedImage> {
  const inputBuffer = Buffer.from(base64, 'base64');

  const outputBuffer = await sharp(inputBuffer)
    .rotate()
    .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  return { data: outputBuffer.toString('base64'), mediaType: 'image/jpeg' };
}

/**
 * Produce two views of a palm photo so the vision model can read it well:
 *
 *   color    — natural color, high quality, used for skin texture / hand shape / mounts
 *   enhanced — CLAHE + sharpening + grayscale, used to read fine line geometry
 *
 * CLAHE (contrast-limited adaptive histogram equalization) is the same
 * preprocessing standard biometric palmprint research uses to surface
 * faint creases. We pair it with unsharp masking so line edges pop without
 * over-amplifying noise.
 */
export async function preparePalmImages(
  base64: string,
  _originalMediaType: string,
): Promise<{ color: ProcessedImage; enhanced: ProcessedImage }> {
  const inputBuffer = Buffer.from(base64, 'base64');

  const base = sharp(inputBuffer)
    .rotate()
    .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true });

  const [colorBuffer, enhancedBuffer] = await Promise.all([
    base
      .clone()
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer(),
    base
      .clone()
      .greyscale()
      .clahe({ width: 80, height: 80, maxSlope: 3 })
      .sharpen({ sigma: 1.2, m1: 1, m2: 2 })
      .normalise()
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer(),
  ]);

  return {
    color: { data: colorBuffer.toString('base64'), mediaType: 'image/jpeg' },
    enhanced: { data: enhancedBuffer.toString('base64'), mediaType: 'image/jpeg' },
  };
}

/**
 * Produce a neon-highlighted version of a palm photo where the major creases
 * (Life, Heart, Head, Fate lines) are drawn in bright teal over the original
 * color image, making line geometry unambiguous for the vision model.
 *
 * Process:
 *   1. CLAHE-enhanced greyscale → invert so creases (dark) become bright
 *   2. Threshold to isolate strongest creases
 *   3. Slight blur then re-threshold to dilate/thicken the lines
 *   4. Tint the crease mask neon teal
 *   5. Screen-composite over the original color image
 */
export async function highlightPalmLines(
  base64: string,
): Promise<ProcessedImage> {
  const inputBuffer = Buffer.from(base64, 'base64');

  const base = sharp(inputBuffer)
    .rotate()
    .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true });

  const [colorPng, creaseMaskRaw] = await Promise.all([
    base.clone().png().toBuffer(),
    base
      .clone()
      .greyscale()
      .clahe({ width: 60, height: 60, maxSlope: 4 })
      .normalise()
      .negate()        // dark creases → bright
      .threshold(165)  // keep only the deepest crease pixels
      .blur(1.4)       // dilate: spread edge pixels slightly
      .threshold(35)   // re-binarise after dilation
      .png()
      .toBuffer(),
  ]);

  // Tint crease mask neon teal
  const neonMask = await sharp(creaseMaskRaw)
    .tint({ r: 0, g: 240, b: 185 })
    .png()
    .toBuffer();

  // Screen-blend neon mask over original — keeps skin tones, adds bright lines
  const resultBuffer = await sharp(colorPng)
    .composite([{ input: neonMask, blend: 'screen' }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  return { data: resultBuffer.toString('base64'), mediaType: 'image/jpeg' };
}
