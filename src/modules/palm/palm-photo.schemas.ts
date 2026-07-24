import { z } from '@hono/zod-openapi';

/** ~6MB raw image after base64's ~33% size overhead — generous for a phone photo, bounded to keep the temporary Postgres storage and the Gemini vision payload reasonable. */
export const PALM_PHOTO_MAX_BASE64_LENGTH = 8_000_000;

export const PalmPhotoUploadRequestSchema = z
  .object({
    imageBase64: z.string().min(1).max(PALM_PHOTO_MAX_BASE64_LENGTH),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  })
  .openapi('PalmPhotoUploadRequest');

export const PalmPhotoUploadResponseSchema = z
  .object({
    uploaded: z.literal(true),
    expiresAt: z.string(),
  })
  .openapi('PalmPhotoUploadResponse');
