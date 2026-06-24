import { invokeModel } from './bedrockClient';

const NOVA_CANVAS_MODEL = 'amazon.nova-canvas-v1:0';

/**
 * Generate a "perfected hand map" image using Amazon Nova Canvas.
 * Returns a data-URI (data:image/png;base64,...) or null if generation fails.
 * Never throws — callers must treat null as a non-fatal skip.
 */
export async function generateHandMap(prompt: string): Promise<string | null> {
  try {
    const body = {
      taskType: 'TEXT_IMAGE',
      textToImageParams: {
        text: prompt,
        negativeText:
          'blurry, distorted, text, words, labels, watermark, signature, low quality, noisy',
      },
      imageGenerationConfig: {
        numberOfImages: 1,
        height: 1024,
        width: 1024,
        cfgScale: 8.0,
        seed: 0,
      },
    };

    const res = await invokeModel(NOVA_CANVAS_MODEL, body) as {
      images?: string[];
      error?: string;
    };

    const b64 = res.images?.[0];
    if (!b64) return null;
    return `data:image/png;base64,${b64}`;
  } catch (err) {
    console.warn('[novaCanvas] image generation failed (non-fatal):', err);
    return null;
  }
}
