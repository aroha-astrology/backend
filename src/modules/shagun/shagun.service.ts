import type { ShagunProductRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import {
  findActiveShagunProductById,
  insertShagunClickEvent,
  listActiveShagunProducts,
} from './shagun.repo.js';
import type { ShagunProductCategory, ShagunProductDto } from './shagun.schemas.js';

export function toShagunProductDto(row: ShagunProductRow): ShagunProductDto {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    priceRangeText: row.priceRangeText,
    sortOrder: row.sortOrder,
  };
}

export async function listShagunProducts(
  category?: ShagunProductCategory,
): Promise<ShagunProductDto[]> {
  const rows = await listActiveShagunProducts(category);
  return rows.map(toShagunProductDto);
}

/**
 * Logs the click, then returns the affiliate URL to redirect to. Throws
 * NOT_FOUND (mapped to a 404 by the global errorHandler — same
 * throw-and-let-the-global-handler-format-it pattern as
 * device-tokens.service.ts's revokeDeviceToken) for an unknown or
 * deactivated product, WITHOUT logging a click for it.
 */
export async function recordShagunClickAndGetRedirectUrl(
  productId: string,
  userId: string,
): Promise<string> {
  const product = await findActiveShagunProductById(productId);
  if (!product) throw Errors.notFound('Product not found');
  await insertShagunClickEvent(productId, userId);
  return product.affiliateUrl;
}
